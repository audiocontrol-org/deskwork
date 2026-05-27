import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import type { Entry } from '../schema/entry.ts';
import { resolveEntryStrictTemplate } from '../lanes/resolve.ts';
import {
  assertStageInTemplate,
  isOffPipelineStageInTemplate,
  terminalLinearStage,
} from '../pipelines/helpers.ts';

interface CancelOptions {
  readonly uuid: string;
  readonly reason?: string;
}

interface CancelResult {
  readonly entryId: string;
  /**
   * Per Phase 4 (graphical-entries) the verb is lane-template-aware.
   * `toStage` is whichever off-pipeline stage the template carries as
   * its cancel destination — `Cancelled` is the reserved name and is
   * present in every preset; operator-authored templates that drop it
   * fail at runtime with a configuration error.
   */
  readonly fromStage: string;
  readonly toStage: string;
}

/**
 * The reserved off-pipeline stage name for cancellations. Per
 * DESKWORK-STATE-MACHINE.md and the PipelineTemplate schema's
 * `linearStages.includes('Cancelled')` refinement, `Cancelled` is
 * never a linear stage; templates that include `Cancelled` MUST list
 * it under `offPipelineStages`. The verb checks the bound template's
 * off-pipeline list at runtime to surface configuration drift.
 */
const CANCEL_STAGE = 'Cancelled';

/**
 * Move an entry to the template's cancel destination (canonically
 * `Cancelled`). Records priorStage on the sidecar so a later
 * `inductEntry` can return it to the linear pipeline if the decision
 * is reversed.
 *
 * Refuses:
 *   - terminal linear stage (e.g. `Published` for editorial) — already
 *     shipped; cancellation is meaningless.
 *   - any off-pipeline stage (e.g. `Blocked`, `Cancelled`, `Archived`)
 *     — entry is already off-pipeline.
 *   - unknown stages — surfaces the template's allowed stage list.
 *
 * Requires the template's `offPipelineStages` to include `Cancelled`.
 * Templates that omit it raise a configuration error.
 */
export async function cancelEntry(
  projectRoot: string,
  opts: CancelOptions,
): Promise<CancelResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
  const from = sidecar.currentStage;

  assertStageInTemplate(template, from, 'cancelEntry');

  // Templates without `Cancelled` in offPipelineStages cannot host the
  // cancel verb. The schema permits this (cancel-free templates are a
  // valid experiment); the verb refuses at runtime with a clear error.
  if (!template.offPipelineStages.includes(CANCEL_STAGE)) {
    throw new Error(
      `Cannot cancel: pipeline template "${template.id}" does not include "${CANCEL_STAGE}" ` +
        `in offPipelineStages. The cancel verb requires the template to reserve "${CANCEL_STAGE}" ` +
        `as its cancellation destination. ` +
        `Available off-pipeline stages: ${template.offPipelineStages.join(', ') || '(none)'}.`,
    );
  }

  const terminal = terminalLinearStage(template);
  if (from === terminal) {
    throw new Error(
      `Cannot cancel: entry is at terminal stage "${from}" of pipeline "${template.id}".`,
    );
  }
  if (isOffPipelineStageInTemplate(template, from)) {
    throw new Error(`Cannot cancel: entry is already ${from} (off-pipeline).`);
  }

  const at = new Date().toISOString();
  const updated: Entry = {
    ...sidecar,
    currentStage: CANCEL_STAGE,
    priorStage: from,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to: CANCEL_STAGE,
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return { entryId: sidecar.uuid, fromStage: from, toStage: CANCEL_STAGE };
}
