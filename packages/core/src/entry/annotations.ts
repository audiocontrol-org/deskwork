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
  SpatialAnchor,
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
type StoredComment = Extract<StoredAnnotation, { type: 'comment' }>;
type StoredSpatialAnchor = NonNullable<StoredComment['spatialAnchor']>;

/**
 * Local exhaustiveness guard. If a future `SpatialAnchor` variant is
 * added to the discriminated union (e.g. `audio-region`,
 * `video-frame`) but the matching `case` is not added to
 * `cloneSpatialAnchor` below, the compiler now flags the missing arm at
 * the `assertNever` call site (parameter `_input` is typed `never`).
 * Without this guard, the rewritten switch would silently fall through
 * the switch with no `default` arm, returning `undefined` at runtime —
 * the lockstep contract between the TS union and the clone path would
 * be enforced only by convention.
 *
 * AUDIT-20260601-09 — companion guard to the AUDIT-20260601-07
 * discriminated-union refactor.
 */
function assertNever(_input: never, context: string): never {
  throw new Error(`Unhandled discriminated-union variant in ${context}`);
}

/**
 * Defensive copy for {@link SpatialAnchor} — keeps the in-memory
 * representation independent of the journal-event payload so later
 * mutations on either side don't leak.
 *
 * Post-AUDIT-20260601-07, {@link SpatialAnchor} is a discriminated
 * union — each `kind` declares only the fields its variant requires
 * — so the clone path narrows on `input.kind` and emits the matching
 * variant. The Zod-inferred {@link StoredSpatialAnchor} shape is also
 * a discriminated union (the schema is a `z.discriminatedUnion`), so
 * the narrow flows symmetrically.
 *
 * Per AUDIT-20260601-09, the `default` arm calls `assertNever` so
 * adding a new {@link SpatialAnchor} variant without updating this
 * switch is a compile-time error (the parameter narrows to `never`
 * only when every variant is handled above).
 */
function cloneSpatialAnchor(input: StoredSpatialAnchor): SpatialAnchor {
  switch (input.kind) {
    case 'pixel':
      return { kind: 'pixel', x: input.x, y: input.y };
    case 'dom-selector':
      return { kind: 'dom-selector', selector: input.selector };
    case 'svg-element':
      return { kind: 'svg-element', selector: input.selector };
    default:
      return assertNever(input, 'cloneSpatialAnchor');
  }
}

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
        // Phase 8 Step 8.1.1 — pass new optional fields through.
        ...(stored.replyTo !== undefined ? { replyTo: stored.replyTo } : {}),
        ...(stored.attachments !== undefined
          ? { attachments: [...stored.attachments] }
          : {}),
        ...(stored.spatialAnchor !== undefined
          ? { spatialAnchor: cloneSpatialAnchor(stored.spatialAnchor) }
          : {}),
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
      // Phase 8 Step 8.1.2 (Part 2) — `AddressAnnotation` is now a
      // discriminated union over `disposition`. The compiler can't pick
      // a single variant from `stored.disposition` (which is the full
      // enum) at the object-literal site, so each disposition branches
      // explicitly. The `addressed` variant requires non-empty
      // `reason`; the read-side schema (`DraftAnnotationSchema`'s
      // top-level `.superRefine`) has already rejected the event if
      // the contract was violated on disk, so reaching this branch
      // with `disposition === 'addressed'` and a missing reason is
      // unreachable — but the type system needs the explicit narrow.
      if (stored.disposition === 'addressed') {
        // `stored.reason` is `string | undefined` from the schema's
        // optional declaration; the runtime superRefine enforced
        // non-empty when disposition === 'addressed', so a missing
        // reason here would have failed the read-side parse and never
        // reached this code path.
        if (typeof stored.reason !== 'string' || stored.reason.length === 0) {
          throw new Error(
            `toDraftAnnotation: addressed annotation ${stored.id} reached the ` +
              `read fold path without a non-empty reason — the Phase 8 Step ` +
              `8.1.2 contract on DraftAnnotationSchema's top-level superRefine ` +
              `should have rejected this event before it reached toDraftAnnotation. ` +
              `This indicates a bypassed schema parse (e.g. legacy data read ` +
              `directly) or a schema regression.`,
          );
        }
        return {
          ...base,
          type: 'address',
          commentId: stored.commentId,
          version: stored.version,
          disposition: 'addressed',
          reason: stored.reason,
        };
      }
      if (stored.disposition === 'deferred') {
        return {
          ...base,
          type: 'address',
          commentId: stored.commentId,
          version: stored.version,
          disposition: 'deferred',
          ...(stored.reason !== undefined ? { reason: stored.reason } : {}),
        };
      }
      return {
        ...base,
        type: 'address',
        commentId: stored.commentId,
        version: stored.version,
        disposition: 'wontfix',
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
        // Phase 8 Step 8.4.1 — attachments patch field. The fold path
        // (`applyEdits` below) treats a present array as a full
        // replacement of the prior value, identical to every other
        // edit-comment field's full-replace semantics.
        ...(stored.attachments !== undefined
          ? { attachments: [...stored.attachments] }
          : {}),
      };
    case 'delete-comment':
      return {
        ...base,
        type: 'delete-comment',
        commentId: stored.commentId,
      };
    case 'archive-comment':
      return {
        ...base,
        type: 'archive-comment',
        commentId: stored.commentId,
        ...(stored.priorStage !== undefined ? { priorStage: stored.priorStage } : {}),
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
  if (
    annotation.type === 'edit-comment' ||
    annotation.type === 'delete-comment' ||
    annotation.type === 'archive-comment'
  ) {
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
  const archivedCommentIds = new Set<string>();
  for (const a of raw) {
    if (a.type === 'edit-comment') {
      const arr = editsByCommentId.get(a.commentId) ?? [];
      arr.push(a);
      editsByCommentId.set(a.commentId, arr);
    } else if (a.type === 'delete-comment') {
      deletedCommentIds.add(a.commentId);
    } else if (a.type === 'archive-comment') {
      archivedCommentIds.add(a.commentId);
    }
  }

  const out: DraftAnnotation[] = [];
  for (const a of raw) {
    if (
      a.type === 'edit-comment' ||
      a.type === 'delete-comment' ||
      a.type === 'archive-comment'
    ) {
      // Fold-only events; not surfaced in the active view.
      continue;
    }
    if (a.type === 'comment') {
      if (deletedCommentIds.has(a.id)) continue;
      if (archivedCommentIds.has(a.id)) continue;
      const edits = editsByCommentId.get(a.id);
      if (!edits || edits.length === 0) {
        out.push(a);
        continue;
      }
      out.push(applyEdits(a, edits));
      continue;
    }
    // Drop resolve/address annotations whose target comment was archived
    // — without this, the marginalia column would render an "address"
    // badge or a "resolve" status against a comment that no longer
    // appears in the active sidebar.
    if (
      (a.type === 'resolve' || a.type === 'address') &&
      archivedCommentIds.has(a.commentId)
    ) {
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
  // #200 — preserve prefix/suffix through edits. Edits don't currently
  // mutate them (the operator can edit text/category/range/anchor via
  // the existing edit-comment fields), but they must survive a
  // text/category edit unchanged.
  const anchorPrefix = comment.anchorPrefix;
  const anchorSuffix = comment.anchorSuffix;
  // Phase 8 Step 8.1.1 — replyTo / spatialAnchor remain immutable
  // through `edit-comment` (the edit schema doesn't expose them);
  // preserve unchanged the same way prefix/suffix are.
  //
  // Phase 8 Step 8.4.1 — `attachments` IS now mutable via
  // `edit-comment` (a screenshot attached after the comment was
  // originally posted lands as an `edit-comment` event carrying the
  // full intended attachment list). Full-replacement semantics: a
  // present `attachments` field on the edit REPLACES the prior list;
  // an absent `attachments` PRESERVES the prior list. Callers wishing
  // to add a single screenshot pass `[...prior, newPath]`.
  const replyTo = comment.replyTo;
  let attachments = comment.attachments;
  const spatialAnchor = comment.spatialAnchor;
  for (const e of edits) {
    if (e.type !== 'edit-comment') continue;
    if (e.text !== undefined) text = e.text;
    if (e.range !== undefined) range = { start: e.range.start, end: e.range.end };
    if (e.category !== undefined) category = e.category;
    if (e.anchor !== undefined) anchor = e.anchor;
    if (e.attachments !== undefined) attachments = [...e.attachments];
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
    ...(anchorPrefix !== undefined ? { anchorPrefix } : {}),
    ...(anchorSuffix !== undefined ? { anchorSuffix } : {}),
    ...(replyTo !== undefined ? { replyTo } : {}),
    ...(attachments !== undefined ? { attachments: [...attachments] } : {}),
    ...(spatialAnchor !== undefined
      ? { spatialAnchor: cloneSpatialAnchor(spatialAnchor) }
      : {}),
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
