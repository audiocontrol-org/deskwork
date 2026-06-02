/**
 * Phase 8 Step 8.4.1 — client-side attach-to-comment workflow.
 *
 * After a screenshot is captured (Step 8.3.1 + 8.3.2) and persisted
 * (Step 8.3.3), the operator can either:
 *
 *   1. Attach the screenshot to an EXISTING comment — appends the
 *      persisted relative path to the comment's `attachments[]` field
 *      via a PATCH that records the FULL intended attachment list
 *      (the schema is full-replacement; an "append" client-side
 *      becomes "send [...prior, newPath]" on the wire — see
 *      `packages/core/src/schema/draft-annotation.ts`'s
 *      `EditCommentAnnotation.attachments` JSDoc).
 *
 *   2. Create a NEW comment with the screenshot pre-attached —
 *      POSTs an annotation of `type: 'comment'` whose
 *      `attachments[]` is the path. Same field, different journal
 *      event type.
 *
 * Both flows are pure HTTP wrappers. The capture / persist /
 * comment-creation calls happen UPSTREAM of this module; this module
 * is the binding step from a persisted path into the comment's field.
 *
 * Composition contract: the controller (annotations.ts) drives the
 * round-trip:
 *
 *   - operator picks "attach screenshot to this comment" → capture +
 *     persist → call `attachScreenshotToComment(entryId, commentId,
 *     priorAttachments, newPath)`.
 *   - operator picks "new comment with screenshot" → capture +
 *     persist → call `createCommentWithAttachment(entryId, draft,
 *     newPath)`.
 *
 * Response parsing is hand-rolled (no `as` casts) — same shape as
 * `screenshot-persist.ts`.
 */

const ENTRY_BASE = '/api/dev/editorial-review/entry';

/**
 * Minimal subset of `CommentAnnotation` the new-comment-with-
 * attachment flow needs to compose with the EXISTING annotate-route
 * body. Caller supplies the comment's prose, range, version, and
 * (optional) category / anchor; the attachment list is supplied
 * separately so the call site doesn't have to manually compose it.
 */
export interface NewCommentDraft {
  readonly text: string;
  readonly version: number;
  readonly range: { readonly start: number; readonly end: number };
  readonly category?: string;
  readonly anchor?: string;
  readonly replyTo?: string;
}

/**
 * Attach a persisted screenshot path to an EXISTING comment. The
 * caller supplies the comment's current attachment list (from the
 * folded read) so the wire payload carries the full intended state
 * — the edit-comment schema's attachments field is full-replacement.
 *
 * Returns true on success (HTTP 200). Throws a descriptive error on
 * non-200 or network failure so the caller can surface the error to
 * the operator (toast / inline error).
 */
export async function attachScreenshotToComment(
  entryId: string,
  commentId: string,
  priorAttachments: readonly string[],
  newRelativePath: string,
): Promise<true> {
  const next = [...priorAttachments, newRelativePath];
  const url = `${ENTRY_BASE}/${encodeURIComponent(entryId)}/comments/${encodeURIComponent(commentId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attachments: next }),
  });
  if (!res.ok) {
    const reason = await extractErrorReason(res);
    throw new Error(
      `attach-screenshot PATCH failed (status ${res.status}): ${reason}`,
    );
  }
  return true;
}

/**
 * Create a NEW comment with the screenshot pre-attached. POSTs a
 * `type: 'comment'` annotation whose `attachments[]` carries the
 * given relative path. Returns the minted annotation id on success;
 * throws on failure.
 */
export async function createCommentWithAttachment(
  entryId: string,
  draft: NewCommentDraft,
  relativePath: string,
): Promise<{ readonly annotationId: string }> {
  const url = `${ENTRY_BASE}/${encodeURIComponent(entryId)}/annotate`;
  const body: Record<string, unknown> = {
    type: 'comment',
    workflowId: entryId,
    version: draft.version,
    range: { start: draft.range.start, end: draft.range.end },
    text: draft.text,
    attachments: [relativePath],
  };
  if (draft.category !== undefined) body.category = draft.category;
  if (draft.anchor !== undefined) body.anchor = draft.anchor;
  if (draft.replyTo !== undefined) body.replyTo = draft.replyTo;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const reason = await extractErrorReason(res);
    throw new Error(
      `create-comment-with-attachment POST failed (status ${res.status}): ${reason}`,
    );
  }
  const parsed: unknown = await res.json();
  const annotationId = extractAnnotationId(parsed);
  if (annotationId === null) {
    throw new Error(
      'create-comment-with-attachment: success response missing annotation.id',
    );
  }
  return { annotationId };
}

async function extractErrorReason(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null) {
      const err = Reflect.get(body, 'error');
      if (typeof err === 'string' && err.length > 0) return err;
    }
  } catch {
    // fall through to status-only
  }
  return `${res.status}`;
}

function extractAnnotationId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const ann = Reflect.get(body, 'annotation');
  if (typeof ann !== 'object' || ann === null) return null;
  const id = Reflect.get(ann, 'id');
  return typeof id === 'string' && id.length > 0 ? id : null;
}
