import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { isLinearPipelineStage } from '../schema/entry.ts';
import type { Entry, Stage } from '../schema/entry.ts';

interface InductOptions {
  readonly uuid: string;
  /**
   * Linear-pipeline stage to teleport the entry into. Must be one of:
   * Ideas, Planned, Outlining, Drafting, Final, Published. (Blocked /
   * Cancelled are not valid induction targets — use `blockEntry` /
   * `cancelEntry` for those.)
   */
  readonly targetStage: Stage;
  readonly reason?: string;
}

interface InductResult {
  readonly entryId: string;
  readonly fromStage: Stage;
  readonly toStage: Stage;
}

/**
 * Teleport an entry into a chosen linear-pipeline stage.
 *
 * Primary use: returning a Blocked or Cancelled entry to the pipeline.
 * Also works on linear-pipeline entries when the operator wants to
 * non-linearly skip ahead or back.
 *
 * Refuses targetStage = Blocked / Cancelled (use the dedicated helpers).
 */
export async function inductEntry(
  projectRoot: string,
  opts: InductOptions,
): Promise<InductResult> {
  if (!isLinearPipelineStage(opts.targetStage)) {
    throw new Error(
      `Cannot induct to ${opts.targetStage}: targetStage must be a linear-pipeline stage. ` +
        `Use blockEntry / cancelEntry for off-pipeline transitions.`,
    );
  }
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const from = sidecar.currentStage;
  const to = opts.targetStage;
  if (from === to) {
    throw new Error(`Cannot induct: entry is already at ${to}.`);
  }
  const at = new Date().toISOString();

  // Inducting OUT of an off-pipeline stage clears priorStage.
  // Inducting between linear stages doesn't change it (priorStage only
  // tracks the most-recent entry into Blocked/Cancelled).
  const wasOffPipeline = from === 'Blocked' || from === 'Cancelled';
  const { priorStage: _drop, ...rest } = sidecar;
  void _drop;
  const updated: Entry = {
    ...rest,
    currentStage: to,
    updatedAt: at,
    ...(wasOffPipeline ? {} : sidecar.priorStage !== undefined ? { priorStage: sidecar.priorStage } : {}),
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
  return { entryId: sidecar.uuid, fromStage: from, toStage: to };
}
