/**
 * lane move — relocate an entry from one lane to another.
 *
 * Phase 6 Task 6.1 (graphical-entries). The move:
 *
 *   1. Resolves the entry's current lane via the sidecar's `lane`
 *      field. Migration-window default: an entry without a `lane`
 *      field is treated as belonging to the `default` lane (matches
 *      the doctor's lane-back-fill default). The move is refused
 *      when the source lane and target lane are the same. Per
 *      AUDIT-20260530-58, when the resolved source lane config does
 *      NOT exist on disk the function refuses with an
 *      entry-named error (no `lane` field → instruct operator to
 *      run `/deskwork:doctor`; explicit `lane` field → name the
 *      missing lane id). No silent fallback to the project's
 *      contentDir — the migration gap is surfaced.
 *
 *   2. Resolves the target lane's pipeline template. The target
 *      stage MUST be in the union of `linearStages ∪
 *      offPipelineStages` of the target template. When the caller
 *      omits `targetStage`, the move defaults to the target
 *      template's FIRST `linearStages` entry.
 *
 *   3. Relocates the artifact file at
 *      `<sourceContentDir>/<artifactPath>` to
 *      `<targetContentDir>/<artifactPath>` (same relative path under
 *      the lane's contentDir). When the source file does not exist,
 *      the move is refused — the operator must repair the binding
 *      before relocating.
 *
 *   4. Relocates the per-entry scrapbook directory at
 *      `<sourceContentDir>/<slug>/scrapbook/` (when present) to the
 *      target lane's parallel location. A missing scrapbook
 *      directory is normal; the move proceeds.
 *
 *   5. Rewrites the sidecar with `lane = target`, `currentStage =
 *      targetStage`. Per the PRD's open-question default,
 *      `iterationByStage` is preserved verbatim — no stage-name
 *      remapping. Old keys from the prior lane template become dead
 *      entries that cause no harm (iterate uses `?? 0`).
 *
 *   6. Emits a `lane-move` journal event identifying source / target
 *      lanes, source / target stages, and the artifact paths.
 *
 * The function uses `renameSync` for the artifact relocation
 * (atomic on the same filesystem); when `renameSync` fails with
 * `EXDEV` (cross-device) the fallback is a copy + delete loop so the
 * move survives a contentDir that points at a separate mount.
 */

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { appendJournalEvent } from '../../journal/append.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import { readSidecar } from '../../sidecar/read.ts';
import { loadPipelineTemplate } from '../../pipelines/loader.ts';
import { loadLaneConfig } from '../loader.ts';

const DEFAULT_LANE_ID = 'default';

export interface MoveEntryOptions {
  readonly uuid: string;
  readonly toLane: string;
  /**
   * Stage in the TARGET lane's template to assign to the entry. When
   * omitted, defaults to the target template's first `linearStages`
   * entry. Must be in the union of the target template's
   * `linearStages ∪ offPipelineStages`.
   */
  readonly targetStage?: string;
}

export interface MoveEntryResult {
  readonly entryId: string;
  readonly fromLane: string;
  readonly toLane: string;
  readonly fromStage: string;
  readonly toStage: string;
  readonly fromArtifactPath?: string;
  readonly toArtifactPath?: string;
}

/**
 * Resolve `<contentDir>` to an absolute path. Lane configs may
 * declare `contentDir` as either absolute (taken verbatim) or
 * relative (resolved against the project root).
 */
function resolveContentDirAbs(projectRoot: string, contentDir: string): string {
  return isAbsolute(contentDir) ? contentDir : resolve(projectRoot, contentDir);
}

/**
 * AUDIT-20260530-64 boundary check. Refuses any resolved filesystem
 * path that escapes its containing lane contentDir. Used at four
 * sites in `moveEntryToLane`: source artifact, target artifact,
 * source scrapbook, target scrapbook. Each site joins a contentDir
 * with an entry-controlled relative segment (`sidecar.artifactPath`
 * or `sidecar.slug`) — without this check, a malformed sidecar with
 * `artifactPath: "../outside.md"` or `slug: "../escape"` makes the
 * move read + write files outside the lane content tree.
 *
 * The check uses `path.relative(contentDir, resolvedPath)` and
 * refuses any relative path that starts with `..` (or is itself
 * `..`) or is absolute. This is the canonical Node pattern for
 * "is X inside Y" — works on both POSIX and Windows because the
 * underlying `path.resolve` and `path.relative` are platform-aware.
 */
function assertPathInsideContentDir(args: {
  resolvedPath: string;
  contentDirAbs: string;
  entrySlug: string;
  boundary: 'artifactPath' | 'slug-derived scrapbook';
  side: 'source' | 'target';
}): void {
  const { resolvedPath, contentDirAbs, entrySlug, boundary, side } = args;
  const rel = relative(contentDirAbs, resolvedPath);
  const escapes = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (escapes) {
    throw new Error(
      `cannot move entry '${entrySlug}': ${side} ${boundary} resolves to `
      + `'${resolvedPath}', which escapes the ${side} lane contentDir `
      + `'${contentDirAbs}'. Refusing the move — repair the sidecar `
      + `(remove '..' segments / absolute paths from the offending field) `
      + `before retrying.`,
    );
  }
}

/**
 * Type guard for the subset of Node ErrnoException we care about
 * (just the `code` string). Keeps the cross-device fallback path
 * type-safe without an unchecked `as NodeJS.ErrnoException`.
 */
function isErrnoCode(err: unknown, expected: string): boolean {
  if (err === null || typeof err !== 'object') return false;
  const maybe = (err as { code?: unknown }).code;
  return typeof maybe === 'string' && maybe === expected;
}

/**
 * Move a path with renameSync, falling back to a caller-supplied
 * cross-device strategy on EXDEV. The fallback is responsible for
 * both creating the destination and removing the source — the
 * helper does not split copy/delete across calls.
 *
 * The parent directory of `dst` is mkdir'd on every call so callers
 * don't have to thread that detail.
 */
function tryRenameWithFallback(
  src: string,
  dst: string,
  exdevFallback: (src: string, dst: string) => void,
): void {
  mkdirSync(dirname(dst), { recursive: true });
  try {
    renameSync(src, dst);
  } catch (err) {
    if (!isErrnoCode(err, 'EXDEV')) throw err;
    exdevFallback(src, dst);
  }
}

function moveFile(src: string, dst: string): void {
  tryRenameWithFallback(src, dst, (s, d) => {
    copyFileSync(s, d);
    unlinkSync(s);
  });
}

function moveDir(src: string, dst: string): void {
  tryRenameWithFallback(src, dst, (s, d) => {
    cpSync(s, d, { recursive: true });
    rmSync(s, { recursive: true, force: true });
  });
}

export async function moveEntryToLane(
  projectRoot: string,
  opts: MoveEntryOptions,
): Promise<MoveEntryResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);

  const sidecarHadLane = sidecar.lane !== undefined;
  const sourceLaneId = sidecar.lane ?? DEFAULT_LANE_ID;
  if (sourceLaneId === opts.toLane) {
    throw new Error(
      `Cannot move entry ${sidecar.slug}: already in lane "${opts.toLane}".`,
    );
  }

  // Resolve the source lane explicitly per AUDIT-20260530-58. The
  // raw `loadLaneConfig` error names the missing lane config file,
  // which is the wrong object to surface to the operator — they
  // asked to move a specific entry. Re-throw with a message that
  // names the entry (and tells the operator how to recover):
  //
  //   - sidecar HAD an explicit `lane` field → the named lane is
  //     genuinely missing on disk; the error reports the lane id.
  //   - sidecar had NO `lane` field → the move fell back to the
  //     implicit `default` lane, which also does not exist (real
  //     migration-window state); the error names the entry slug
  //     and directs the operator to `/deskwork:doctor` to back-fill
  //     lane assignments before retrying the move.
  //
  // Per the project no-fallback rule, the function does NOT silently
  // substitute the project's contentDir for the missing lane — that
  // would hide the migration gap and produce wrong-place file moves.
  let sourceLane;
  try {
    sourceLane = loadLaneConfig(sourceLaneId, projectRoot);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (sidecarHadLane) {
      throw new Error(
        `cannot move entry '${sidecar.slug}': declared source lane `
        + `'${sourceLaneId}' is not a known lane. Re-bind the entry to an `
        + `existing lane (or restore the lane config under `
        + `.deskwork/lanes/${sourceLaneId}.json) before retrying. `
        + `Underlying error: ${detail}`,
      );
    }
    throw new Error(
      `cannot determine source lane for entry '${sidecar.slug}' — sidecar `
      + `has no 'lane' field AND no '${DEFAULT_LANE_ID}' lane config exists. `
      + `Run /deskwork:doctor to back-fill lane assignments before moving the `
      + `entry. Underlying error: ${detail}`,
    );
  }
  const targetLane = loadLaneConfig(opts.toLane, projectRoot);
  if (
    typeof targetLane.archivedAt === 'string'
    && targetLane.archivedAt.length > 0
  ) {
    throw new Error(
      `Cannot move entry ${sidecar.slug} into archived lane "${opts.toLane}". `
      + `Restore the lane first via "deskwork lane restore ${opts.toLane}".`,
    );
  }

  const targetTemplate = loadPipelineTemplate(
    targetLane.pipelineTemplate,
    projectRoot,
  );

  // Resolve targetStage — explicit operator value takes precedence;
  // default falls back to the target template's first linearStage.
  const targetStage = opts.targetStage ?? targetTemplate.linearStages[0];
  if (targetStage === undefined) {
    throw new Error(
      `Cannot move entry ${sidecar.slug}: target lane "${opts.toLane}" `
      + `template "${targetTemplate.id}" has no linearStages defined. `
      + `Repair the template before moving.`,
    );
  }

  const allowed = new Set<string>([
    ...targetTemplate.linearStages,
    ...targetTemplate.offPipelineStages,
  ]);
  if (!allowed.has(targetStage)) {
    throw new Error(
      `Cannot move entry ${sidecar.slug} to stage "${targetStage}": `
      + `not in target lane "${opts.toLane}" template "${targetTemplate.id}". `
      + `Allowed stages: ${[...allowed].join(', ')}.`,
    );
  }

  const sourceContentDir = resolveContentDirAbs(
    projectRoot,
    sourceLane.contentDir,
  );
  const targetContentDir = resolveContentDirAbs(
    projectRoot,
    targetLane.contentDir,
  );

  // Relocate the artifact file. When `artifactPath` is set on the
  // sidecar, the source file is at `<sourceContentDir>/<artifactPath>`;
  // we move it to `<targetContentDir>/<artifactPath>` (same relative
  // shape under the new contentDir).
  //
  // Per AUDIT-20260530-64, BOTH the source and the target resolved
  // paths are checked against their respective contentDirs before any
  // filesystem operation runs. The schema-level refinement on
  // `artifactPath` blocks the canonical attack shapes upstream, but
  // the boundary check stays as defense-in-depth — the field could be
  // populated by a non-deskwork process, or a future code path could
  // bypass the schema. The check uses `path.resolve` (via
  // `assertPathInsideContentDir`) so even a normalised-looking
  // relative path that traverses out is caught.
  let fromArtifactAbs: string | undefined;
  let toArtifactAbs: string | undefined;
  if (sidecar.artifactPath !== undefined) {
    fromArtifactAbs = resolve(sourceContentDir, sidecar.artifactPath);
    toArtifactAbs = resolve(targetContentDir, sidecar.artifactPath);
    assertPathInsideContentDir({
      resolvedPath: fromArtifactAbs,
      contentDirAbs: sourceContentDir,
      entrySlug: sidecar.slug,
      boundary: 'artifactPath',
      side: 'source',
    });
    assertPathInsideContentDir({
      resolvedPath: toArtifactAbs,
      contentDirAbs: targetContentDir,
      entrySlug: sidecar.slug,
      boundary: 'artifactPath',
      side: 'target',
    });
    if (!existsSync(fromArtifactAbs)) {
      throw new Error(
        `Cannot move entry ${sidecar.slug}: source artifact does not exist at `
        + `${fromArtifactAbs}. Repair the binding (e.g. via "deskwork doctor") `
        + `before moving.`,
      );
    }
    if (existsSync(toArtifactAbs)) {
      throw new Error(
        `Cannot move entry ${sidecar.slug}: target artifact already exists at `
        + `${toArtifactAbs}. The target lane already holds a file at the same `
        + `relative path; resolve the collision (rename / move / remove) before `
        + `running lane move.`,
      );
    }
  }

  const sourceScrapbookDir = resolve(sourceContentDir, sidecar.slug, 'scrapbook');
  const targetScrapbookDir = resolve(targetContentDir, sidecar.slug, 'scrapbook');
  // Per AUDIT-20260530-64, the per-entry scrapbook path is built from
  // `sidecar.slug` — also entry-controlled. EntrySchema's `slug` is
  // an unconstrained `z.string().min(1)` for back-compat, so a slug
  // like `../escape` parses cleanly. Refuse here for the same reason
  // as the artifact branch above; check both sides.
  assertPathInsideContentDir({
    resolvedPath: sourceScrapbookDir,
    contentDirAbs: sourceContentDir,
    entrySlug: sidecar.slug,
    boundary: 'slug-derived scrapbook',
    side: 'source',
  });
  assertPathInsideContentDir({
    resolvedPath: targetScrapbookDir,
    contentDirAbs: targetContentDir,
    entrySlug: sidecar.slug,
    boundary: 'slug-derived scrapbook',
    side: 'target',
  });

  // Track which filesystem operations succeeded so the catch below
  // can reverse them on a later failure (e.g. writeSidecar throwing
  // after the artifact + scrapbook are already in the target lane).
  let artifactMoved = false;
  let scrapbookMoved = false;

  if (fromArtifactAbs !== undefined && toArtifactAbs !== undefined) {
    moveFile(fromArtifactAbs, toArtifactAbs);
    artifactMoved = true;
  }

  // Relocate the per-entry scrapbook directory when present. Lives at
  // `<contentDir>/<slug>/scrapbook/` per the slug-template convention
  // — see packages/core/src/scrapbook/paths.ts (_scrapbookDirSlug).
  if (existsSync(sourceScrapbookDir)) {
    if (existsSync(targetScrapbookDir)) {
      // Rollback the artifact relocation so the operator's state is
      // consistent before re-running.
      if (artifactMoved && fromArtifactAbs !== undefined && toArtifactAbs !== undefined) {
        moveFile(toArtifactAbs, fromArtifactAbs);
      }
      throw new Error(
        `Cannot move entry ${sidecar.slug}: target scrapbook directory already `
        + `exists at ${targetScrapbookDir}. Resolve the collision before moving.`,
      );
    }
    moveDir(sourceScrapbookDir, targetScrapbookDir);
    scrapbookMoved = true;
  }

  const at = new Date().toISOString();
  const fromStage = sidecar.currentStage;
  const updated = {
    ...sidecar,
    lane: opts.toLane,
    currentStage: targetStage,
    updatedAt: at,
  };

  // Wrap the sidecar write in a rollback. If the sidecar write throws
  // AFTER the artifact + scrapbook have been moved, the entry is
  // half-moved: filesystem says "target lane" but sidecar still says
  // "source lane". Reverse the successful filesystem moves before
  // re-throwing so the operator's state is consistent.
  try {
    await writeSidecar(projectRoot, updated);
  } catch (err) {
    try {
      if (scrapbookMoved) {
        moveDir(targetScrapbookDir, sourceScrapbookDir);
      }
      if (
        artifactMoved
        && fromArtifactAbs !== undefined
        && toArtifactAbs !== undefined
      ) {
        moveFile(toArtifactAbs, fromArtifactAbs);
      }
    } catch (rollbackErr) {
      const rollbackDetail = rollbackErr instanceof Error
        ? rollbackErr.message
        : String(rollbackErr);
      const writeDetail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to move entry ${sidecar.slug}: sidecar write failed `
        + `(${writeDetail}) AND rollback of filesystem moves failed `
        + `(${rollbackDetail}). Operator intervention required.`,
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to move entry ${sidecar.slug}: sidecar write failed `
      + `(${detail}); filesystem moves rolled back.`,
    );
  }

  const moveDetails: {
    fromLane: string;
    toLane: string;
    fromStage: string;
    toStage: string;
    fromArtifactPath?: string;
    toArtifactPath?: string;
  } = {
    fromLane: sourceLaneId,
    toLane: opts.toLane,
    fromStage,
    toStage: targetStage,
  };
  if (fromArtifactAbs !== undefined) moveDetails.fromArtifactPath = fromArtifactAbs;
  if (toArtifactAbs !== undefined) moveDetails.toArtifactPath = toArtifactAbs;

  await appendJournalEvent(projectRoot, {
    kind: 'lane-move',
    at,
    entryId: sidecar.uuid,
    details: moveDetails,
  });

  const result: MoveEntryResult = {
    entryId: sidecar.uuid,
    fromLane: sourceLaneId,
    toLane: opts.toLane,
    fromStage,
    toStage: targetStage,
    ...(fromArtifactAbs !== undefined && { fromArtifactPath: fromArtifactAbs }),
    ...(toArtifactAbs !== undefined && { toArtifactPath: toArtifactAbs }),
  };
  return result;
}
