/**
 * Doctor lane-migration helper (Phase 4 Task 4.4).
 *
 * Two concerns, run in sequence:
 *
 *   1. Bootstrap a `default` lane bound to the editorial template from
 *      the legacy `sites.<defaultSite>.contentDir` config block. This
 *      delegates to `bootstrapDefaultLaneIfMissing` (Phase 3) which is
 *      already side-effect-safe (returns `{ created: false }` when no
 *      work to do) and atomic.
 *
 *   2. Back-fill `lane: "default"` and a derived `artifactKind` on
 *      every existing sidecar that lacks either field. For each
 *      back-filled sidecar, emit a `lane-migration` journal event so
 *      the change is auditable.
 *
 * `--dry-run` is supported: the function returns a structured summary
 * of changes WITHOUT writing anything to disk. Atomic per-sidecar
 * writes (delegated to `writeSidecar`) ensure a crash mid-loop leaves a
 * consistent partial state — every successfully-written sidecar is
 * complete and valid, with its corresponding journal event recorded
 * before the write.
 *
 * Idempotent: running twice produces no further changes (the second
 * pass sees every sidecar already carries `lane` and `artifactKind`,
 * so no writes / journal events fire).
 *
 * Corrupt-vs-absent (AUDIT-20260530-15): the sidecar walk treats
 * filesystem ENOENT (a file that vanished between `readdir` and
 * `readFile`) as a benign race — skip the entry, do NOT report it as
 * corrupt. Every other failure (JSON parse, schema validation,
 * non-ENOENT I/O) is treated as corruption: the sidecar's filename
 * lands in `LaneMigrationResult.skippedCorrupt` AND the entry counts
 * toward `entriesExamined`, so the doctor's report distinguishes
 * data-corruption from a clean read. Same root cause as
 * AUDIT-20260529-39 in entry-review/data.ts; the precedent there
 * (commit d7f1ea7) used existsSync to pre-distinguish missing from
 * corrupt. Here we attempt the read and inspect the thrown error's
 * `code` instead — equivalent in semantics, one syscall cheaper, no
 * TOCTOU window between the existence probe and the actual read.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { bootstrapDefaultLaneIfMissing } from '../lanes/bootstrap.ts';
import type { ArtifactKind } from '../lanes/types.ts';

/**
 * Extract the `code` property Node attaches to filesystem-origin
 * Errors (e.g. `ENOENT`, `EACCES`). Returns `undefined` when the
 * value isn't an `Error` or doesn't carry a string `code`. Used by
 * the migration walk to distinguish ENOENT (benign race) from every
 * other I/O failure (treated as corruption).
 */
function fsErrorCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  if (!('code' in err)) return undefined;
  const code = err.code;
  return typeof code === 'string' ? code : undefined;
}

export interface LaneMigrationResult {
  /** Whether the `default` lane was created by this run. */
  readonly defaultLaneCreated: boolean;
  /** Path the default lane config landed at (whether created or pre-existing). */
  readonly defaultLanePath: string;
  /** Number of sidecars back-filled with `lane: "default"`. */
  readonly entriesLaneBackfilled: number;
  /** Number of sidecars back-filled with a derived `artifactKind`. */
  readonly entriesArtifactKindBackfilled: number;
  /**
   * Total number of sidecars examined — INCLUDES sidecars that failed
   * parse / schema validation (those land in `skippedCorrupt`). The
   * count reflects what the migration looked at; it does not silently
   * drop bad apples.
   */
  readonly entriesExamined: number;
  /**
   * Filenames (basename within `.deskwork/entries/`) of sidecars that
   * exist on disk but failed to load: malformed JSON, schema
   * validation failure, or non-ENOENT I/O error. Surfaced as an
   * explicit list per AUDIT-20260530-15 so the doctor can report the
   * corruption rather than silently skip. Empty array means every
   * `.json` parsed + validated cleanly.
   */
  readonly skippedCorrupt: readonly string[];
  /** True when this was a dry run (no disk writes). */
  readonly dryRun: boolean;
}

export interface LaneMigrationOptions {
  /** When true, plan changes but do not write to disk. */
  readonly dryRun?: boolean;
}

/**
 * Derive an `artifactKind` from an entry's `artifactPath`. Unlike
 * `detectArtifactKind` (which probes the filesystem), this function
 * works purely from the path string — the migration needs to be able
 * to derive a kind even for sidecars whose on-disk artifact has been
 * temporarily moved or hasn't landed yet. Returns `undefined` when
 * the path is missing or extensionless.
 */
function deriveArtifactKindFromPath(artifactPath: string | undefined): ArtifactKind | undefined {
  if (artifactPath === undefined || artifactPath.length === 0) return undefined;
  const ext = extname(artifactPath).toLowerCase();
  if (ext === '.md') return 'markdown';
  if (ext === '.html') return 'single-file-html';
  if (
    ext === '.png' || ext === '.jpg' || ext === '.jpeg'
    || ext === '.gif' || ext === '.webp' || ext === '.svg'
  ) {
    return 'image';
  }
  // No extension or unsupported: skip the back-fill rather than throwing.
  // The doctor's separate artifact-kind validation rule (later phase)
  // can surface the missing field; the migration's job is best-effort
  // back-fill for the clearly-classifiable cases.
  return undefined;
}

/**
 * Run the Phase 4 lane migration against `projectRoot`:
 *
 *   1. Bootstrap a `default` lane if absent (Phase 3 helper).
 *   2. Walk every sidecar; back-fill `lane: "default"` when missing;
 *      back-fill `artifactKind` when missing AND derivable from the
 *      sidecar's `artifactPath`.
 *   3. Emit a `lane-migration` journal event per modified sidecar.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param opts.dryRun - When true, return the summary without writing.
 */
export async function migrateLaneMembership(
  projectRoot: string,
  opts: LaneMigrationOptions = {},
): Promise<LaneMigrationResult> {
  const dryRun = opts.dryRun ?? false;

  // 1. Default lane bootstrap. The helper is idempotent and atomic; in
  //    dry-run mode we skip the call (the bootstrap doesn't have a
  //    dry-run mode of its own, so we synthesize one by probing the
  //    target path).
  let defaultLaneCreated = false;
  let defaultLanePath: string;
  if (dryRun) {
    defaultLanePath = join(projectRoot, '.deskwork', 'lanes', 'default.json');
    try {
      await readFile(defaultLanePath, 'utf8');
      defaultLaneCreated = false;
    } catch {
      defaultLaneCreated = true; // would create
    }
  } else {
    const bootstrap = await bootstrapDefaultLaneIfMissing(projectRoot);
    defaultLanePath = bootstrap.path;
    defaultLaneCreated = bootstrap.created;
  }

  // 2. Walk every sidecar; collect back-fill plan.
  const dir = sidecarsDir(projectRoot);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    // No entries dir — nothing to back-fill.
    return {
      defaultLaneCreated,
      defaultLanePath,
      entriesLaneBackfilled: 0,
      entriesArtifactKindBackfilled: 0,
      entriesExamined: 0,
      skippedCorrupt: [],
      dryRun,
    };
  }

  let laneBackfilled = 0;
  let artifactKindBackfilled = 0;
  let examined = 0;
  const skippedCorrupt: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const path = join(dir, name);

    // Examined counter increments BEFORE the parse guards — every
    // `.json` the walker considers counts toward what was examined,
    // even if it fails parse / schema (AUDIT-20260530-15). Pre-fix
    // the counter sat after the guards, so corrupt sidecars vanished
    // from both the count AND any error report.
    examined++;

    // Read the sidecar. ENOENT here means the file vanished between
    // the `readdir` snapshot and this `readFile` — a benign race;
    // skip silently. Every other I/O failure (permissions, disk,
    // etc.) is corruption-shaped: record the filename so the doctor
    // can surface it.
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (err) {
      if (fsErrorCode(err) === 'ENOENT') {
        // File disappeared between readdir + readFile. Roll the
        // examined counter back — the file isn't really there.
        examined--;
        continue;
      }
      skippedCorrupt.push(name);
      continue;
    }

    // Parse + schema-validate. JSON parse errors AND schema failures
    // are both treated as corruption; they share the same operator
    // disposition (fix the sidecar, re-run the migration).
    let parsed: Entry;
    try {
      const json: unknown = JSON.parse(raw);
      const result = EntrySchema.safeParse(json);
      if (!result.success) {
        skippedCorrupt.push(name);
        continue;
      }
      parsed = result.data;
    } catch {
      skippedCorrupt.push(name);
      continue;
    }

    const needsLane = parsed.lane === undefined;
    const derivedKind = parsed.artifactKind ?? deriveArtifactKindFromPath(parsed.artifactPath);
    const needsArtifactKind = parsed.artifactKind === undefined && derivedKind !== undefined;
    if (!needsLane && !needsArtifactKind) continue;

    if (needsLane) laneBackfilled++;
    if (needsArtifactKind) artifactKindBackfilled++;

    if (dryRun) continue;

    // 3. Write sidecar FIRST, then emit journal event. The journal's
    //    claims should describe post-conditions (what happened), not
    //    intent (what's about to happen). This matches
    //    `bootstrapDefaultLaneIfMissing`'s ordering in
    //    `packages/core/src/lanes/bootstrap.ts` and the broader
    //    append-only-journal convention. Crash semantics: if the
    //    sidecar write succeeds but the journal append fails, the
    //    state is correct but the audit trail is missing — the next
    //    migration run sees the field already present and skips both
    //    actions, so the journal never claims something untrue. The
    //    inverse ordering would let the journal claim a migration
    //    that didn't happen.
    const at = new Date().toISOString();
    const updated: Entry = {
      ...parsed,
      ...(needsLane ? { lane: 'default' } : {}),
      ...(needsArtifactKind && derivedKind !== undefined
        ? { artifactKind: derivedKind }
        : {}),
      updatedAt: at,
    };
    await writeSidecar(projectRoot, updated);
    await appendJournalEvent(projectRoot, {
      kind: 'lane-migration',
      at,
      migration: 'backfill-lane-and-artifact-kind',
      source: `entries/${parsed.uuid}.json`,
      target: `entries/${parsed.uuid}.json`,
      details: {
        entryUuid: parsed.uuid,
        ...(needsLane ? { laneAdded: 'default' } : {}),
        ...(needsArtifactKind && derivedKind !== undefined
          ? { artifactKindAdded: derivedKind }
          : {}),
      },
    });
  }

  return {
    defaultLaneCreated,
    defaultLanePath,
    entriesLaneBackfilled: laneBackfilled,
    entriesArtifactKindBackfilled: artifactKindBackfilled,
    entriesExamined: examined,
    skippedCorrupt,
    dryRun,
  };
}
