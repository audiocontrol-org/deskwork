import { readSidecar } from '../sidecar/read.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { regenerateCalendar } from '../calendar/regenerate.ts';
import { nextStage } from '../schema/entry.ts';
import type { Entry, Stage } from '../schema/entry.ts';
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
  readonly fromStage: Stage;
  readonly toStage: Stage;
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
 * Refuses:
 *   - Final → Published (use `publish`, not `approve`)
 *   - Published (terminal)
 *   - Blocked / Cancelled (off-pipeline; induct first)
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
 *   - Mutate the sidecar (currentStage advances; reviewState clears).
 *   - Regenerate `calendar.md` (issue #148).
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

  // 3. Strip reviewState on stage transition. exactOptionalPropertyTypes
  //    requires us to omit the key entirely rather than set undefined.
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
  // #148: keep calendar.md in sync after every transition. Without
  // this, the canonical visible representation of the pipeline lags
  // the SSOT until `doctor --fix=all` is run.
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
 *
 * The fold is one-pass: we record delete/archive/resolve sets first,
 * then the second loop emits comment ids that are not in any kill set.
 * (resolve != deleted/archived — a resolved comment is still a comment;
 * we only avoid double-archiving a comment that was already archived.)
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
