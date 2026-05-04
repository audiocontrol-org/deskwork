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
 */

import { randomUUID } from 'node:crypto';
import { appendJournalEvent } from '../journal/append.ts';
import { readJournalEvents } from '../journal/read.ts';
import type { JournalEvent } from '../schema/journal-events.ts';
import type { DraftAnnotation } from '../review/types.ts';

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
  }
}

/**
 * Append an entry-keyed annotation. The annotation should already have
 * its `id` and `createdAt` minted (use `mintEntryAnnotation`).
 */
export async function addEntryAnnotation(
  projectRoot: string,
  entryId: string,
  annotation: DraftAnnotation,
): Promise<void> {
  await appendJournalEvent(projectRoot, {
    kind: 'entry-annotation',
    at: annotation.createdAt,
    entryId,
    annotation,
  });
}

/**
 * List every entry-keyed annotation for `entryId`, in chronological
 * order. Returns an empty array when there are none — never throws,
 * never returns null.
 */
export async function listEntryAnnotations(
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
