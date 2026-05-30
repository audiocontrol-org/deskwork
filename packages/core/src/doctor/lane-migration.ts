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
 *
 * artifactKind authority (AUDIT-20260530-18): the artifactKind
 * back-fill calls the authoritative `detectArtifactKind` probe
 * (filesystem-aware) instead of dispatching on `extname()` alone.
 * The pre-fix path-only heuristic misclassified multi-file HTML
 * mockups — a directory containing `index.html` — as
 * `single-file-html`. Visual/mockups lane (the headline
 * graphical-entries use case) is exactly where multi-file mockups
 * live, and the migration's idempotency would have made the wrong
 * kind permanent. The probe throws on a non-existent path (per
 * AUDIT-20260530-09); the migration catches that case and lists the
 * entry on `LaneMigrationResult.skippedMissingArtifact` so the
 * operator can repair the dangling reference and re-run.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { bootstrapDefaultLaneIfMissing } from '../lanes/bootstrap.ts';
import { detectArtifactKind } from '../lanes/detection.ts';
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
  /**
   * UUIDs of entries whose sidecar parsed cleanly but whose
   * `artifactPath` points at a file that does not exist on disk.
   * Surfaced as an explicit list per AUDIT-20260530-18 because the
   * authoritative `detectArtifactKind` probe (used to classify the
   * artifact) throws on missing paths. The lane back-fill still lands
   * for these entries; only the artifactKind back-fill is skipped.
   * Empty array means every classifiable artifact was found on disk.
   */
  readonly skippedMissingArtifact: readonly string[];
  /** True when this was a dry run (no disk writes). */
  readonly dryRun: boolean;
}

export interface LaneMigrationOptions {
  /** When true, plan changes but do not write to disk. */
  readonly dryRun?: boolean;
}

/**
 * Outcome of attempting to classify an entry's artifact on disk.
 * Three branches the migration treats distinctly:
 *
 *   - `classified` — the artifact exists and `detectArtifactKind`
 *     returned a kind; back-fill proceeds with that value.
 *   - `missing` — the artifact does not exist at `artifactPath`;
 *     surfaced on `LaneMigrationResult.skippedMissingArtifact` so the
 *     operator can repair the underlying reference and re-run.
 *   - `none` — there is no `artifactPath` to classify against (the
 *     sidecar simply has no artifact yet); skip silently.
 */
type ArtifactClassification =
  | { readonly kind: 'classified'; readonly value: ArtifactKind }
  | { readonly kind: 'missing' }
  | { readonly kind: 'none' };

/**
 * Classify an entry's artifact using `detectArtifactKind` — the
 * authoritative filesystem probe used by the lanes / detection
 * pipeline. Replaces the prior path-extension heuristic
 * (`deriveArtifactKindFromPath`) per AUDIT-20260530-18: the heuristic
 * misclassified multi-file HTML mockups (a directory containing
 * `index.html`) as `single-file-html`, contradicting the authoritative
 * classifier. Because the migration is idempotent (skips entries that
 * already carry `artifactKind`), the wrong value would have been
 * permanent.
 *
 * `detectArtifactKind` throws on a non-existent path (per
 * AUDIT-20260530-09's existence-probe hardening). Catch that case and
 * return `{ kind: 'missing' }` so the caller can surface it on
 * `skippedMissingArtifact` — the operator's actionable signal that
 * something on disk needs repair. Any other classifier throw
 * propagates (unsupported extension / shape) because that's a
 * data-shape problem the migration cannot paper over.
 */
function classifyArtifact(
  projectRoot: string,
  artifactPath: string | undefined,
): ArtifactClassification {
  if (artifactPath === undefined || artifactPath.length === 0) {
    return { kind: 'none' };
  }
  const abs = isAbsolute(artifactPath) ? artifactPath : join(projectRoot, artifactPath);
  try {
    const value = detectArtifactKind(abs);
    return { kind: 'classified', value };
  } catch (err) {
    // The classifier's missing-path error has a stable prefix
    // ("artifact does not exist at"). Match on that prefix to avoid
    // conflating missing-artifact with unsupported-shape errors.
    if (err instanceof Error && err.message.includes('artifact does not exist at')) {
      return { kind: 'missing' };
    }
    throw err;
  }
}

/**
 * Run the Phase 4 lane migration against `projectRoot`:
 *
 *   1. Bootstrap a `default` lane if absent (Phase 3 helper).
 *   2. Walk every sidecar; back-fill `lane: "default"` when missing;
 *      back-fill `artifactKind` when missing AND the authoritative
 *      `detectArtifactKind` probe can classify the on-disk artifact.
 *   3. Emit a `lane-migration` journal event per modified sidecar.
 *
 * The returned `LaneMigrationResult` carries explicit lists of
 * sidecars the walk did NOT migrate cleanly:
 *
 *   - `skippedCorrupt` (AUDIT-20260530-15) — sidecars that exist on
 *     disk but failed read / JSON parse / schema validation.
 *   - `skippedMissingArtifact` (AUDIT-20260530-18) — entries whose
 *     `artifactPath` does not exist on disk, so `detectArtifactKind`
 *     refused to classify it. The lane back-fill still lands for
 *     these entries; only the artifactKind portion is skipped.
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
      skippedMissingArtifact: [],
      dryRun,
    };
  }

  let laneBackfilled = 0;
  let artifactKindBackfilled = 0;
  let examined = 0;
  const skippedCorrupt: string[] = [];
  const skippedMissingArtifact: string[] = [];
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

    // artifactKind back-fill: only invoke the filesystem probe when
    // the sidecar lacks `artifactKind`. The probe is the
    // authoritative classifier (AUDIT-20260530-18) — if the artifact
    // is missing on disk we record the UUID on `skippedMissingArtifact`
    // and leave `derivedKind` undefined.
    let derivedKind: ArtifactKind | undefined = parsed.artifactKind;
    if (parsed.artifactKind === undefined) {
      const classification = classifyArtifact(projectRoot, parsed.artifactPath);
      if (classification.kind === 'classified') {
        derivedKind = classification.value;
      } else if (classification.kind === 'missing') {
        skippedMissingArtifact.push(parsed.uuid);
      }
    }
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
    skippedMissingArtifact,
    dryRun,
  };
}
