/**
 * lane move — relocate an entry from one lane to another.
 *
 * Phase 6 Task 6.1 (graphical-entries); reshaped by Phase 39
 * (sites→lanes retirement). The move:
 *
 *   1. Resolves the entry's current lane via the sidecar's `lane`
 *      field. Migration-window default: an entry without a `lane`
 *      field is treated as belonging to the `default` lane (matches
 *      the doctor's lane-back-fill default). The move is refused
 *      when the source lane and target lane are the same. Per
 *      AUDIT-20260530-58, when the resolved source lane config does
 *      NOT exist on disk the function refuses with an entry-named
 *      error (no `lane` field → instruct operator to run
 *      `/deskwork:doctor`; explicit `lane` field → name the missing
 *      lane id).
 *
 *   2. Resolves the target lane's pipeline template. The target
 *      stage MUST be in the union of `linearStages ∪
 *      offPipelineStages` of the target template. When the caller
 *      omits `targetStage`, the move defaults to the target
 *      template's FIRST `linearStages` entry.
 *
 *   3. Rewrites the sidecar with `lane = target`, `currentStage =
 *      targetStage`. Per the PRD's open-question default,
 *      `iterationByStage` is preserved verbatim — no stage-name
 *      remapping. Old keys from the prior lane template become dead
 *      entries that cause no harm (iterate uses `?? 0`).
 *
 *   4. Emits a `lane-move` journal event identifying source / target
 *      lanes, source / target stages, and the (unchanged) artifact
 *      path for audit.
 *
 * **Phase 39: the move is a METADATA change only.** A lane carries no
 * `contentDir` — location is a property of the ENTRY
 * (`entry.artifactPath`, resolved against the project root), never the
 * lane. So moving an entry between lanes does NOT relocate its artifact
 * file or its per-entry scrapbook; both stay exactly where they are.
 * The lane "spans" whatever directories its entries happen to live in,
 * emergent from the entries. This dissolves the former
 * source/target-`contentDir` relocation (and its cross-device fallback
 * + rollback): there is nothing on disk to move.
 *
 * The source artifact must still EXIST on disk (when the entry carries
 * an `artifactPath`) — moving an entry whose artifact is missing is
 * refused so the operator repairs the binding first.
 */

import { existsSync } from 'node:fs';
import { appendJournalEvent } from '../../journal/append.ts';
import { writeSidecar } from '../../sidecar/write.ts';
import { readSidecar } from '../../sidecar/read.ts';
import { loadPipelineTemplate } from '../../pipelines/loader.ts';
import { resolveStoredArtifactPath } from '../../entry/resolve-artifact.ts';
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
  /**
   * Absolute artifact path. Phase 39: the move does NOT relocate the
   * artifact, so `from` and `to` are identical — both echo the entry's
   * (unchanged) resolved `artifactPath`. Present only when the entry
   * carries an `artifactPath`.
   */
  readonly fromArtifactPath?: string;
  readonly toArtifactPath?: string;
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
  try {
    loadLaneConfig(sourceLaneId, projectRoot);
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

  // Resolve the entry's artifact from its STORED `artifactPath` only
  // (Phase 39 — location is an ENTRY property, resolved against the
  // project root, never a lane dir). The move does NOT relocate the
  // file; it stays put. We still require the file to EXIST so the
  // operator repairs a broken binding before moving lanes.
  const artifactAbs = resolveStoredArtifactPath(sidecar, projectRoot);
  if (artifactAbs !== null && !existsSync(artifactAbs)) {
    throw new Error(
      `Cannot move entry ${sidecar.slug}: source artifact does not exist at `
      + `${artifactAbs}. Repair the binding (e.g. via "deskwork doctor") `
      + `before moving.`,
    );
  }

  const at = new Date().toISOString();
  const fromStage = sidecar.currentStage;
  const updated = {
    ...sidecar,
    lane: opts.toLane,
    currentStage: targetStage,
    updatedAt: at,
  };

  await writeSidecar(projectRoot, updated);

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
  if (artifactAbs !== null) {
    moveDetails.fromArtifactPath = artifactAbs;
    moveDetails.toArtifactPath = artifactAbs;
  }

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
    ...(artifactAbs !== null && {
      fromArtifactPath: artifactAbs,
      toArtifactPath: artifactAbs,
    }),
  };
  return result;
}
