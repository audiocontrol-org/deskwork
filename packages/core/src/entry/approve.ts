import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { nextStage } from '../schema/entry.ts';
import type { Entry, Stage } from '../schema/entry.ts';

interface ApproveOptions {
  readonly uuid: string;
}

interface ApproveResult {
  readonly entryId: string;
  readonly fromStage: Stage;
  readonly toStage: Stage;
}

/**
 * Graduate an entry to the next linear-pipeline stage.
 *
 * Refuses:
 *   - Final → Published (use `publish`, not `approve`)
 *   - Published (terminal)
 *   - Blocked / Cancelled (off-pipeline; induct first)
 *
 * On success:
 *   - sidecar.currentStage advances to nextStage(currentStage)
 *   - sidecar.reviewState is cleared (stage-transition resets review)
 *   - a stage-transition journal event is appended
 */
export async function approveEntryStage(
  projectRoot: string,
  opts: ApproveOptions,
): Promise<ApproveResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);
  const from = sidecar.currentStage;
  if (from === 'Final') {
    throw new Error('Final → Published uses `publish`, not `approve`.');
  }
  if (from === 'Published') {
    throw new Error('Cannot approve: Published is terminal.');
  }
  if (from === 'Blocked' || from === 'Cancelled') {
    throw new Error(
      `Cannot approve: entry is ${from}; induct it back into the pipeline first.`,
    );
  }
  const to = nextStage(from);
  if (to === null) {
    throw new Error(`Cannot approve from stage ${from} (no successor).`);
  }
  const at = new Date().toISOString();

  // Strip reviewState on stage transition. exactOptionalPropertyTypes
  // requires us to omit the key entirely rather than set undefined.
  const { reviewState: _drop, ...rest } = sidecar;
  void _drop;
  const updated: Entry = {
    ...rest,
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
  return { entryId: sidecar.uuid, fromStage: from, toStage: to };
}
