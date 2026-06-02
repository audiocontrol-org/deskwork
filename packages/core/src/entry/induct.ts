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
} from '../pipelines/helpers.ts';

interface InductOptions {
  readonly uuid: string;
  /**
   * Linear-pipeline stage to teleport the entry into. Per Phase 4
   * (graphical-entries) the parameter is `string` rather than the
   * editorial-narrow `Stage` union; the runtime check validates that
   * the requested stage is in the entry's lane template's
   * `linearStages` list and throws with the allowed-stages list on
   * mismatch.
   */
  readonly targetStage: string;
  readonly reason?: string;
}

interface InductResult {
  readonly entryId: string;
  /**
   * Per Phase 4 (graphical-entries) both stages are plain strings
   * echoing the lane template's vocabulary.
   */
  readonly fromStage: string;
  readonly toStage: string;
}

/**
 * Teleport an entry into a chosen linear-pipeline stage.
 *
 * Primary use: returning an off-pipeline (e.g. Blocked / Cancelled)
 * entry to the linear pipeline. Also works on linear-pipeline entries
 * when the operator wants to non-linearly skip ahead or back.
 *
 * Refuses:
 *   - `targetStage` not in the entry's lane template's `linearStages`
 *     (covers both unknown stages AND off-pipeline destinations like
 *     Blocked / Cancelled — use `blockEntry` / `cancelEntry` for those).
 *   - `targetStage === currentStage` (no-op).
 *   - `currentStage` itself unknown to the template (configuration drift).
 */
export async function inductEntry(
  projectRoot: string,
  opts: InductOptions,
): Promise<InductResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
  const from = sidecar.currentStage;
  const to = opts.targetStage;

  // Validate the entry's current stage belongs to the template.
  assertStageInTemplate(template, from, 'inductEntry');

  // Validate the target stage is a recognized LINEAR stage. The check
  // surfaces both "unknown stage" and "off-pipeline target" with the
  // same error shape — both cases require operator-side correction.
  if (!isLinearPipelineStageInTemplate(template, to)) {
    if (isOffPipelineStageInTemplate(template, to)) {
      throw new Error(
        `Cannot induct to ${to}: ${to} is an off-pipeline stage of pipeline "${template.id}". ` +
          `Use blockEntry / cancelEntry for off-pipeline transitions. ` +
          `Allowed linear stages: ${template.linearStages.join(', ')}.`,
      );
    }
    throw new Error(
      `Cannot induct to ${to}: ${to} is not a linear stage of pipeline "${template.id}". ` +
        `Allowed linear stages: ${template.linearStages.join(', ')}.`,
    );
  }

  if (from === to) {
    throw new Error(`Cannot induct: entry is already at ${to}.`);
  }
  const at = new Date().toISOString();

  // Inducting OUT of an off-pipeline stage clears priorStage.
  // Inducting between linear stages doesn't change it (priorStage only
  // tracks the most-recent entry into the off-pipeline stages).
  const wasOffPipeline = isOffPipelineStageInTemplate(template, from);
  const { priorStage: _drop, ...rest } = sidecar;
  void _drop;
  const updated: Entry = {
    ...rest,
    currentStage: to,
    updatedAt: at,
    ...(wasOffPipeline
      ? {}
      : sidecar.priorStage !== undefined
        ? { priorStage: sidecar.priorStage }
        : {}),
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to,
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return { entryId: sidecar.uuid, fromStage: from, toStage: to };
}
