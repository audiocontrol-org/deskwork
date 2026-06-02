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

interface BlockOptions {
  readonly uuid: string;
  /** Optional reason — recorded on the stage-transition journal event. */
  readonly reason?: string;
}

interface BlockResult {
  readonly entryId: string;
  /**
   * Per Phase 4 (graphical-entries) the verb is lane-template-aware.
   * `toStage` is whichever off-pipeline stage the template carries as
   * its block destination — `Blocked` is the canonical name; templates
   * that omit it raise a configuration error at runtime.
   */
  readonly fromStage: string;
  readonly toStage: string;
}

/**
 * The reserved off-pipeline stage name for "blocked" entries. Unlike
 * `Cancelled`, the pipeline schema does not refine the placement of
 * this name — templates may or may not include it; the verb refuses at
 * runtime when missing.
 */
const BLOCK_STAGE = 'Blocked';

/**
 * Move an entry to the template's block destination (canonically
 * `Blocked`). Records priorStage on the sidecar so a later
 * `inductEntry` can return it to the linear pipeline.
 *
 * Refuses:
 *   - terminal linear stage — already shipped; blocking is meaningless.
 *   - any off-pipeline stage — entry is already off-pipeline.
 *   - unknown stages — surfaces the template's allowed stage list.
 *
 * Requires the template's `offPipelineStages` to include `Blocked`.
 */
export async function blockEntry(
  projectRoot: string,
  opts: BlockOptions,
): Promise<BlockResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const template = resolveEntryStrictTemplate(sidecar, projectRoot);
  const from = sidecar.currentStage;

  assertStageInTemplate(template, from, 'blockEntry');

  if (!template.offPipelineStages.includes(BLOCK_STAGE)) {
    throw new Error(
      `Cannot block: pipeline template "${template.id}" does not include "${BLOCK_STAGE}" ` +
        `in offPipelineStages. The block verb requires the template to reserve "${BLOCK_STAGE}" ` +
        `as its blocked destination. ` +
        `Available off-pipeline stages: ${template.offPipelineStages.join(', ') || '(none)'}.`,
    );
  }

  const terminal = terminalLinearStage(template);
  if (from === terminal) {
    throw new Error(
      `Cannot block: entry is at terminal stage "${from}" of pipeline "${template.id}".`,
    );
  }
  if (isOffPipelineStageInTemplate(template, from)) {
    throw new Error(`Cannot block: entry is already ${from} (off-pipeline).`);
  }

  const at = new Date().toISOString();
  const updated: Entry = {
    ...sidecar,
    currentStage: BLOCK_STAGE,
    priorStage: from,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to: BLOCK_STAGE,
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return { entryId: sidecar.uuid, fromStage: from, toStage: BLOCK_STAGE };
}
