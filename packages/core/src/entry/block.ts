import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import type { Entry } from '../schema/entry.ts';

interface BlockOptions {
  readonly uuid: string;
  /** Optional reason — recorded on the stage-transition journal event. */
  readonly reason?: string;
}

interface BlockResult {
  readonly entryId: string;
  /**
   * Per Phase 3 (graphical-entries) the sidecar's currentStage is now a
   * plain string (lane-template-driven). `fromStage` reports whatever
   * stage value the sidecar carried. Phase 4's lane-aware verb refactor
   * will gate this verb on the lane template's off-pipeline stage set
   * rather than the hardcoded `'Blocked' | 'Cancelled'` literals below.
   */
  readonly fromStage: string;
  readonly toStage: 'Blocked';
}

/**
 * Move an entry to Blocked. Records priorStage on the sidecar so a later
 * `inductEntry` can return it to the linear pipeline.
 *
 * Refuses Published / Blocked / Cancelled.
 */
export async function blockEntry(
  projectRoot: string,
  opts: BlockOptions,
): Promise<BlockResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const from = sidecar.currentStage;
  if (from === 'Published') {
    throw new Error('Cannot block: Published is terminal.');
  }
  if (from === 'Blocked' || from === 'Cancelled') {
    throw new Error(`Cannot block: entry is already ${from}.`);
  }
  const at = new Date().toISOString();
  const updated: Entry = {
    ...sidecar,
    currentStage: 'Blocked',
    priorStage: from,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to: 'Blocked',
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return { entryId: sidecar.uuid, fromStage: from, toStage: 'Blocked' };
}
