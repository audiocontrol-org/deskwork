/**
 * Entry-keyed annotation store (Phase 34a — T2).
 *
 * The longform editorial review surface keys annotations by entry UUID,
 * not by workflow id. This module is the entry-side equivalent of
 * `review/pipeline.ts`'s `appendAnnotation` / `readAnnotations` /
 * `mintAnnotation`.
 *
 * Storage model: annotations live as `entry-annotation` events in the
 * existing journal (`.deskwork/review-journal/history/`), not as a
 * separate sidecar tree. The journal already keys events by `entryId`
 * and orders by ISO timestamp; reads filter to
 * `kind === 'entry-annotation'` and project the `annotation` payload.
 *
 * The two annotation stores (workflow-keyed in `review/pipeline.ts`,
 * entry-keyed here) intentionally do not interoperate — workflow
 * annotations are NOT visible from the entry-keyed listing, and vice
 * versa. See the `routes/api.ts` header for the split contract.
 *
 * Phase 35 (issue #199) — append-only edit + delete journal:
 *   - `edit-comment` annotations replace a prior comment's text /
 *     range / category / anchor in the FOLDED view.
 *   - `delete-comment` annotations tombstone a prior comment in the
 *     FOLDED view.
 *
 * `listEntryAnnotations` returns the FOLDED view by default. The raw
 * unfolded stream (for audit views) is accessible via
 * `listEntryAnnotationsRaw`.
 */

import { randomUUID } from 'node:crypto';
import { appendJournalEvent } from '../journal/append.ts';
import { readJournalEvents } from '../journal/read.ts';
import type { JournalEvent } from '../schema/journal-events.ts';
import type {
  CommentAnnotation,
  DraftAnnotation,
} from '../review/types.ts';

/**
 * The Zod schema (`DraftAnnotationSchema`) infers each optional field
 * as `T | undefined`, while `DraftAnnotation` (the canonical TS source
 * of truth) declares them as `field?: T` under `exactOptionalPropertyTypes`.
 * The two are runtime-equivalent but TS-incompatible: assigning the
 * Zod-inferred type to `DraftAnnotation` requires either a type assertion
 * or per-variant reconstruction.
 *
 * `toDraftAnnotation` picks fields explicitly and only includes optional
 * ones when defined — same pattern as `entry/block.ts`'s
 * `...(opts.reason !== undefined && { reason: opts.reason })`. No `as`
 * casts; no `any`.
 */
type StoredAnnotation = Extract<JournalEvent, { kind: 'entry-annotation' }>['annotation'];

function toDraftAnnotation(stored: StoredAnnotation): DraftAnnotation {
  const base = {
    id: stored.id,
    workflowId: stored.workflowId,
    createdAt: stored.createdAt,
  };
  switch (stored.type) {
    case 'comment': {
      const out: DraftAnnotation = {
        ...base,
        type: 'comment',
        version: stored.version,
        range: { start: stored.range.start, end: stored.range.end },
        text: stored.text,
        ...(stored.category !== undefined ? { category: stored.category } : {}),
        ...(stored.anchor !== undefined ? { anchor: stored.anchor } : {}),
      };
      return out;
    }
    case 'edit':
      return {
        ...base,
        type: 'edit',
        beforeVersion: stored.beforeVersion,
        afterMarkdown: stored.afterMarkdown,
        diff: stored.diff,
      };
    case 'approve':
      return {
        ...base,
        type: 'approve',
        version: stored.version,
      };
    case 'reject':
      return {
        ...base,
        type: 'reject',
        version: stored.version,
        ...(stored.reason !== undefined ? { reason: stored.reason } : {}),
      };
    case 'resolve':
      return {
        ...base,
        type: 'resolve',
        commentId: stored.commentId,
        resolved: stored.resolved,
      };
    case 'address':
      return {
        ...base,
        type: 'address',
        commentId: stored.commentId,
        version: stored.version,
        disposition: stored.disposition,
        ...(stored.reason !== undefined ? { reason: stored.reason } : {}),
      };
    case 'edit-comment':
      return {
        ...base,
        type: 'edit-comment',
        commentId: stored.commentId,
        ...(stored.text !== undefined ? { text: stored.text } : {}),
        ...(stored.range !== undefined
          ? { range: { start: stored.range.start, end: stored.range.end } }
          : {}),
        ...(stored.category !== undefined ? { category: stored.category } : {}),
        ...(stored.anchor !== undefined ? { anchor: stored.anchor } : {}),
      };
    case 'delete-comment':
      return {
        ...base,
        type: 'delete-comment',
        commentId: stored.commentId,
      };
  }
}

/**
 * Append an entry-keyed annotation. The annotation should already have
 * its `id` and `createdAt` minted (use `mintEntryAnnotation`).
 *
 * Phase 35: validates that `edit-comment` and `delete-comment`
 * annotations reference an existing `comment` annotation in the same
 * entry's stream. Throws when the referent is missing — preferable to
 * silently persisting an orphan that the folder will skip over.
 */
export async function addEntryAnnotation(
  projectRoot: string,
  entryId: string,
  annotation: DraftAnnotation,
): Promise<void> {
  if (annotation.type === 'edit-comment' || annotation.type === 'delete-comment') {
    const raw = await listEntryAnnotationsRaw(projectRoot, entryId);
    const referent = raw.find(
      (a): a is CommentAnnotation =>
        a.type === 'comment' && a.id === annotation.commentId,
    );
    if (!referent) {
      throw new Error(
        `addEntryAnnotation refused: ${annotation.type} references unknown commentId ${annotation.commentId}`,
      );
    }
  }
  await appendJournalEvent(projectRoot, {
    kind: 'entry-annotation',
    at: annotation.createdAt,
    entryId,
    annotation,
  });
}

/**
 * List the FOLDED active-comment view of every entry-keyed annotation
 * for `entryId`, in chronological order:
 *
 *   - For each `comment`, apply every later `edit-comment` whose
 *     `commentId` matches (in journal order). Missing fields preserve
 *     the prior value.
 *   - Drop any `comment` for which a `delete-comment` annotation
 *     exists.
 *
 * Non-comment annotations (resolve / address / approve / reject / edit
 * / orphaned edit-comment / delete-comment) pass through unchanged so
 * the renderer can still see them. (Edit-comment / delete-comment that
 * fail validation at write time can never reach this code — only ones
 * whose target later disappeared via journal damage would surface.)
 *
 * Returns an empty array when there are none — never throws, never
 * returns null.
 */
export async function listEntryAnnotations(
  projectRoot: string,
  entryId: string,
): Promise<DraftAnnotation[]> {
  const raw = await listEntryAnnotationsRaw(projectRoot, entryId);
  return foldAnnotations(raw);
}

/**
 * List the RAW (unfolded) entry-keyed annotation stream — every
 * `comment` / `edit-comment` / `delete-comment` / etc. as recorded on
 * disk, in chronological order. Useful for audit views.
 */
export async function listEntryAnnotationsRaw(
  projectRoot: string,
  entryId: string,
): Promise<DraftAnnotation[]> {
  const events = await readJournalEvents(projectRoot, { entryId });
  const out: DraftAnnotation[] = [];
  for (const event of events) {
    if (event.kind === 'entry-annotation') {
      out.push(toDraftAnnotation(event.annotation));
    }
  }
  return out;
}

/**
 * Pure fold over the raw annotation stream. Single pass to gather
 * edit + delete journals indexed by `commentId`, then one walk to emit
 * either the (possibly-edited) comment or skip it (if deleted) — and
 * pass non-comment annotations through unchanged.
 *
 * Chronological order is taken from the input array's order (callers
 * must pass the journal-sorted stream from `readJournalEvents`).
 */
function foldAnnotations(raw: DraftAnnotation[]): DraftAnnotation[] {
  const editsByCommentId = new Map<string, DraftAnnotation[]>();
  const deletedCommentIds = new Set<string>();
  for (const a of raw) {
    if (a.type === 'edit-comment') {
      const arr = editsByCommentId.get(a.commentId) ?? [];
      arr.push(a);
      editsByCommentId.set(a.commentId, arr);
    } else if (a.type === 'delete-comment') {
      deletedCommentIds.add(a.commentId);
    }
  }

  const out: DraftAnnotation[] = [];
  for (const a of raw) {
    if (a.type === 'edit-comment' || a.type === 'delete-comment') {
      // Fold-only events; not surfaced in the active view.
      continue;
    }
    if (a.type === 'comment') {
      if (deletedCommentIds.has(a.id)) continue;
      const edits = editsByCommentId.get(a.id);
      if (!edits || edits.length === 0) {
        out.push(a);
        continue;
      }
      out.push(applyEdits(a, edits));
      continue;
    }
    out.push(a);
  }
  return out;
}

function applyEdits(
  comment: CommentAnnotation,
  edits: DraftAnnotation[],
): CommentAnnotation {
  let text = comment.text;
  let range = comment.range;
  let category = comment.category;
  let anchor = comment.anchor;
  for (const e of edits) {
    if (e.type !== 'edit-comment') continue;
    if (e.text !== undefined) text = e.text;
    if (e.range !== undefined) range = { start: e.range.start, end: e.range.end };
    if (e.category !== undefined) category = e.category;
    if (e.anchor !== undefined) anchor = e.anchor;
  }
  const out: CommentAnnotation = {
    id: comment.id,
    workflowId: comment.workflowId,
    createdAt: comment.createdAt,
    type: 'comment',
    version: comment.version,
    range,
    text,
    ...(category !== undefined ? { category } : {}),
    ...(anchor !== undefined ? { anchor } : {}),
  };
  return out;
}

/**
 * Mint a server-assigned `id` and `createdAt` onto a draft annotation.
 *
 * Generic-and-intersected like `mintAnnotation` in `review/pipeline.ts`
 * so the caller's discriminated `type` narrowing survives.
 */
export function mintEntryAnnotation<
  T extends Omit<DraftAnnotation, 'id' | 'createdAt'>,
>(partial: T): T & { id: string; createdAt: string } {
  return {
    ...partial,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}
