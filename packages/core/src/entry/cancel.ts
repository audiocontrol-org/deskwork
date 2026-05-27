import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import type { Entry } from '../schema/entry.ts';

interface CancelOptions {
  readonly uuid: string;
  readonly reason?: string;
}

interface CancelResult {
  readonly entryId: string;
  /**
   * Per Phase 3 (graphical-entries) the sidecar's currentStage is now a
   * plain string. Phase 4 introduces lane-template-driven verb gating;
   * for now the cancel verb refuses the literal `'Blocked' | 'Cancelled'`
   * stages and writes the literal `'Cancelled'` target.
   */
  readonly fromStage: string;
  readonly toStage: 'Cancelled';
}

/**
 * Move an entry to Cancelled. Records priorStage on the sidecar so a
 * later `inductEntry` can return it to the linear pipeline if the
 * decision is reversed.
 *
 * Refuses Published / Blocked / Cancelled.
 */
export async function cancelEntry(
  projectRoot: string,
  opts: CancelOptions,
): Promise<CancelResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const from = sidecar.currentStage;
  if (from === 'Published') {
    throw new Error('Cannot cancel: Published is terminal.');
  }
  if (from === 'Blocked' || from === 'Cancelled') {
    throw new Error(`Cannot cancel: entry is already ${from}.`);
  }
  const at = new Date().toISOString();
  const updated: Entry = {
    ...sidecar,
    currentStage: 'Cancelled',
    priorStage: from,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);
  await appendJournalEvent(projectRoot, {
    kind: 'stage-transition',
    at,
    entryId: sidecar.uuid,
    from,
    to: 'Cancelled',
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });
  // #148: keep calendar.md in sync after every transition.
  await regenerateCalendar(projectRoot);
  return { entryId: sidecar.uuid, fromStage: from, toStage: 'Cancelled' };
}
