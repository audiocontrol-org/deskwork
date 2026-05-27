import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import type { Entry } from '../schema/entry.ts';
import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
import {
  assertStageInTemplate,
  isLinearPipelineStageInTemplate,
  isOffPipelineStageInTemplate,
  nextStageInTemplate,
  preTerminalLinearStage,
} from '../pipelines/helpers.ts';
import { snapshotIndexForStage } from './snapshot.ts';
import {
  addEntryAnnotation,
  listEntryAnnotationsRaw,
  mintEntryAnnotation,
} from './annotations.ts';
import type { DraftAnnotation } from '../review/types.ts';

interface ApproveOptions {
  readonly uuid: string;
}

interface ApproveResult {
  readonly entryId: string;
  /**
   * Per Phase 4 (graphical-entries) the verb is template-driven; both
   * stages are reported as plain strings echoing the lane template's
   * vocabulary (`Drafting` / `Final` for editorial, `Sketched` /
   * `Iterating` / `Approved` for visual, etc.).
   */
  readonly fromStage: string;
  readonly toStage: string;
  /** True when an `index.md` snapshot was preserved at
   *  `<dir>/scrapbook/<priorStage>.md`. False when there was no
   *  `index.md` to snapshot (common at Ideas) or the entry has no
   *  `artifactPath` (legacy entries pre-doctor migration). */
  readonly snapshotted: boolean;
  /** Number of `comment` annotations archived as part of the transition
   *  (issue #200 — comments don't auto-rebase across document evolution;
   *  archive-on-approve sidesteps the anchor-stability problem). */
  readonly archivedComments: number;
}

/**
 * Graduate an entry to the next linear-pipeline stage.
 *
 * Per Phase 4 (graphical-entries) the verb is lane-template-aware:
 * the entry's `lane` resolves to a `LaneConfig`, which binds a
 * `PipelineTemplate`; the template's `linearStages` defines the
 * forward-progress sequence. The verb advances `currentStage` to the
 * next entry in that list.
 *
 * Refuses:
 *   - pre-terminal linear stage (e.g. `Final`) — use `publish`, not
 *     `approve`. The pre-terminal stage is identified positionally as
 *     `linearStages[length - 2]`.
 *   - terminal linear stage (e.g. `Published`) — no successor exists.
 *   - off-pipeline stages (e.g. `Blocked`, `Cancelled`) — induct first.
 *   - unknown stages — surfaces the template's allowed stage list.
 *
 * On success, in this order (so a kill-power between any two steps
 * leaves a recoverable state):
 *   - Atomic snapshot of `<dir>/index.md` → `<dir>/scrapbook/<priorStage>.md`
 *     (issue #222 — Option B + hybrid refinement). Skipped when
 *     `index.md` doesn't exist on disk.
 *   - Archive every active `comment` annotation as the entry's prior
 *     stage's content goes into the freezer (issue #200 — anchor
 *     stability under document evolution; comments authored against
 *     the just-archived content cannot reliably rebase).
 *   - Append a `stage-transition` journal event.
 *   - Mutate the sidecar (currentStage advances).
 *   - Regenerate `calendar.md` (issue #148).
 */
export async function approveEntryStage(
  projectRoot: string,
  opts: ApproveOptions,
): Promise<ApproveResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
  const from = sidecar.currentStage;

  // Validate the current stage belongs to the template's vocabulary
  // before any state mutation. Surfaces lane / template misconfiguration
  // (entry's lane was renamed, template was edited to drop a stage that
  // entries still reference, etc.) with the full allowed list.
  assertStageInTemplate(template, from, 'approveEntryStage');

  if (isOffPipelineStageInTemplate(template, from)) {
    throw new Error(
      `Cannot approve: entry is ${from} (off-pipeline); induct it back into the pipeline first.`,
    );
  }
  if (!isLinearPipelineStageInTemplate(template, from)) {
    // Defensive: assertStageInTemplate succeeded, so `from` is either
    // linear or off-pipeline. The off-pipeline case is handled above.
    // This branch is unreachable in practice; the throw exists so a
    // future template schema with additional stage categories surfaces
    // the gap rather than silently mis-routing.
    throw new Error(
      `Cannot approve from stage ${from}: stage is in template "${template.id}" ` +
        `but is neither linear nor off-pipeline. This indicates a template-schema ` +
        `bug — investigate ${template.id}'s definition.`,
    );
  }

  const preTerminal = preTerminalLinearStage(template);
  if (preTerminal !== null && from === preTerminal) {
    throw new Error(
      `Cannot approve from ${from}: ${from} is the pre-terminal stage of pipeline ` +
        `"${template.id}". Use \`publish\`, not \`approve\`, to graduate to the ` +
        `terminal stage.`,
    );
  }
  const to = nextStageInTemplate(template, from);
  if (to === null) {
    throw new Error(
      `Cannot approve from stage ${from}: ${from} is the terminal stage of pipeline ` +
        `"${template.id}" (no successor).`,
    );
  }
  const at = new Date().toISOString();

  // 1. Atomic snapshot of index.md → scrapbook/<priorStage>.md (#222).
  //    Throws on conflicting prior snapshot — operator resolves and
  //    re-runs.
  const snapshot = await snapshotIndexForStage(projectRoot, sidecar, from);

  // 2. Archive every still-active comment annotation (#200). The
  //    `archive-comment` annotation is fold-only — it doesn't physically
  //    remove the original comment from the journal. The audit trail is
  //    preserved via `listEntryAnnotationsRaw`.
  const raw = await listEntryAnnotationsRaw(projectRoot, sidecar.uuid);
  const archived: string[] = collectActiveCommentIds(raw);
  for (const commentId of archived) {
    const annotation: DraftAnnotation = mintEntryAnnotation({
      type: 'archive-comment',
      workflowId: sidecar.uuid,
      commentId,
      priorStage: from,
    });
    await addEntryAnnotation(projectRoot, sidecar.uuid, annotation);
  }

  // 3. Update sidecar with the new stage. Per DESKWORK-STATE-MACHINE.md
  //    Commandment III, reviewState is RETIRED — the schema field is
  //    gone, so no strip-on-transition is needed and no
  //    `review-state-change` journal event is emitted.
  const updated: Entry = {
    ...sidecar,
    currentStage: to,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);

  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to,
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return {
    entryId: sidecar.uuid,
    fromStage: from,
    toStage: to,
    snapshotted: snapshot.snapshotted,
    archivedComments: archived.length,
  };
}

/**
 * Walk the raw annotation stream and return the ids of every comment
 * that is still active at the moment of approve — a comment is "active"
 * if it has not already been deleted, archived, or implicitly resolved
 * earlier in the journal.
 */
function collectActiveCommentIds(raw: DraftAnnotation[]): string[] {
  const deleted = new Set<string>();
  const archived = new Set<string>();
  for (const a of raw) {
    if (a.type === 'delete-comment') deleted.add(a.commentId);
    else if (a.type === 'archive-comment') archived.add(a.commentId);
  }
  const out: string[] = [];
  for (const a of raw) {
    if (a.type !== 'comment') continue;
    if (deleted.has(a.id)) continue;
    if (archived.has(a.id)) continue;
    out.push(a.id);
  }
  return out;
}
