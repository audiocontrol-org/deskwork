/**
 * Body validator for `POST /api/dev/editorial-review/entry/:entryId/annotate`.
 *
 * Mirrors the shape of `handleAnnotate` in `@deskwork/core/review/handlers`:
 * same per-`type` field requirements, same status-code semantics for
 * malformed input. Differs in that the entry endpoint does NOT validate
 * an existing workflow (entry-keyed annotations don't reference workflows).
 *
 * Returns either a discriminated `AnnotationDraftFromBody` ready to be
 * passed into `mintEntryAnnotation`, OR an error result with a 400
 * status and a human-readable reason.
 */

import type { DraftAnnotation } from '@deskwork/core/review/types';

type DistributeOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type AnnotationDraftFromBody = DistributeOmit<DraftAnnotation, 'id' | 'createdAt'>;

type CommentDraft = Extract<AnnotationDraftFromBody, { type: 'comment' }>;
type AnnotationCategory = NonNullable<CommentDraft['category']>;

const VALID_CATEGORIES: ReadonlySet<AnnotationCategory> = new Set<AnnotationCategory>([
  'voice-drift',
  'missing-receipt',
  'tutorial-framing',
  'saas-vocabulary',
  'fake-authority',
  'structural',
  'other',
]);

function asCategory(value: unknown): AnnotationCategory | null {
  if (typeof value !== 'string') return null;
  // Type guard: narrow `value` to one of the union members by checking
  // membership in VALID_CATEGORIES. The Set iteration would be cleaner
  // but introduces an `as`-cast on the .has() argument; the per-key
  // check below keeps us cast-free.
  for (const c of VALID_CATEGORIES) {
    if (c === value) return c;
  }
  return null;
}

export type ParseResult =
  | { kind: 'ok'; draft: AnnotationDraftFromBody }
  | { kind: 'err'; status: 400; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asObject(v: unknown): Record<string, unknown> | null {
  return isRecord(v) ? v : null;
}

function err(message: string): ParseResult {
  return { kind: 'err', status: 400, message };
}

export function parseEntryAnnotationBody(body: unknown): ParseResult {
  const obj = asObject(body);
  if (!obj) return err('expected JSON object body');

  const type = obj.type;
  const workflowId = obj.workflowId;

  if (typeof type !== 'string') return err('type is required');
  if (typeof workflowId !== 'string') return err('workflowId is required');

  switch (type) {
    case 'comment': {
      const version = obj.version;
      const range = asObject(obj.range);
      const text = obj.text;
      if (typeof version !== 'number') return err('comment.version is required');
      if (
        !range ||
        typeof range.start !== 'number' ||
        typeof range.end !== 'number'
      ) {
        return err('comment.range with numeric start/end is required');
      }
      if (typeof text !== 'string') return err('comment.text is required');
      const category = asCategory(obj.category);
      const draft: AnnotationDraftFromBody = {
        type: 'comment',
        workflowId,
        version,
        range: { start: range.start, end: range.end },
        text,
        ...(category !== null ? { category } : {}),
        ...(typeof obj.anchor === 'string' ? { anchor: obj.anchor } : {}),
      };
      return { kind: 'ok', draft };
    }
    case 'edit': {
      const beforeVersion = obj.beforeVersion;
      const afterMarkdown = obj.afterMarkdown;
      const diff = obj.diff;
      if (typeof beforeVersion !== 'number') return err('edit.beforeVersion is required');
      if (typeof afterMarkdown !== 'string') return err('edit.afterMarkdown is required');
      if (typeof diff !== 'string') return err('edit.diff is required');
      return {
        kind: 'ok',
        draft: { type: 'edit', workflowId, beforeVersion, afterMarkdown, diff },
      };
    }
    case 'approve': {
      const version = obj.version;
      if (typeof version !== 'number') return err('approve.version is required');
      return { kind: 'ok', draft: { type: 'approve', workflowId, version } };
    }
    case 'reject': {
      const version = obj.version;
      if (typeof version !== 'number') return err('reject.version is required');
      const draft: AnnotationDraftFromBody = {
        type: 'reject',
        workflowId,
        version,
        ...(typeof obj.reason === 'string' ? { reason: obj.reason } : {}),
      };
      return { kind: 'ok', draft };
    }
    case 'resolve': {
      const commentId = obj.commentId;
      if (typeof commentId !== 'string' || commentId.length === 0) {
        return err('resolve.commentId is required');
      }
      const resolved = typeof obj.resolved === 'boolean' ? obj.resolved : true;
      return {
        kind: 'ok',
        draft: { type: 'resolve', workflowId, commentId, resolved },
      };
    }
    case 'address': {
      const commentId = obj.commentId;
      const version = obj.version;
      const disposition = obj.disposition;
      if (typeof commentId !== 'string' || commentId.length === 0) {
        return err('address.commentId is required');
      }
      if (typeof version !== 'number') return err('address.version is required');
      if (
        disposition !== 'addressed' &&
        disposition !== 'deferred' &&
        disposition !== 'wontfix'
      ) {
        return err("address.disposition must be 'addressed' | 'deferred' | 'wontfix'");
      }
      const draft: AnnotationDraftFromBody = {
        type: 'address',
        workflowId,
        commentId,
        version,
        disposition,
        ...(typeof obj.reason === 'string' ? { reason: obj.reason } : {}),
      };
      return { kind: 'ok', draft };
    }
    case 'edit-comment': {
      const commentId = obj.commentId;
      if (typeof commentId !== 'string' || commentId.length === 0) {
        return err('edit-comment.commentId is required');
      }
      const fields = parseEditCommentFields(obj);
      if (fields.kind === 'err') return err(`edit-comment: ${fields.message}`);
      const draft: AnnotationDraftFromBody = {
        type: 'edit-comment',
        workflowId,
        commentId,
        ...(fields.fields.text !== undefined ? { text: fields.fields.text } : {}),
        ...(fields.fields.range !== undefined ? { range: fields.fields.range } : {}),
        ...(fields.fields.category !== undefined ? { category: fields.fields.category } : {}),
        ...(fields.fields.anchor !== undefined ? { anchor: fields.fields.anchor } : {}),
      };
      return { kind: 'ok', draft };
    }
    case 'delete-comment': {
      const commentId = obj.commentId;
      if (typeof commentId !== 'string' || commentId.length === 0) {
        return err('delete-comment.commentId is required');
      }
      return {
        kind: 'ok',
        draft: { type: 'delete-comment', workflowId, commentId },
      };
    }
    default:
      return err(`unknown annotation type: ${type}`);
  }
}

/**
 * Parser for the PATCH /entry/:entryId/comments/:commentId body.
 *
 * Differs from `parseEntryAnnotationBody` for the `edit-comment` case
 * because the route already binds `commentId` from the URL — the body
 * carries only the editable fields. The route mints the `workflowId`
 * field (= entryId) on the draft to satisfy the schema.
 */
export interface ParseEditFieldsResult {
  text?: string;
  range?: { start: number; end: number };
  category?: NonNullable<CommentDraft['category']>;
  anchor?: string;
}

export type ParseEditFieldsOutcome =
  | { kind: 'ok'; fields: ParseEditFieldsResult }
  | { kind: 'err'; status: 400; message: string };

export function parseEditCommentFields(body: unknown): ParseEditFieldsOutcome {
  const obj = asObject(body);
  if (!obj) return { kind: 'err', status: 400, message: 'expected JSON object body' };

  const out: ParseEditFieldsResult = {};

  if (obj.text !== undefined) {
    if (typeof obj.text !== 'string') {
      return { kind: 'err', status: 400, message: 'text must be a string' };
    }
    out.text = obj.text;
  }

  if (obj.range !== undefined) {
    const range = asObject(obj.range);
    if (!range || typeof range.start !== 'number' || typeof range.end !== 'number') {
      return {
        kind: 'err',
        status: 400,
        message: 'range must have numeric start/end',
      };
    }
    out.range = { start: range.start, end: range.end };
  }

  if (obj.category !== undefined) {
    const category = asCategory(obj.category);
    if (category === null) {
      return {
        kind: 'err',
        status: 400,
        message: 'category must be a known category',
      };
    }
    out.category = category;
  }

  if (obj.anchor !== undefined) {
    if (typeof obj.anchor !== 'string') {
      return { kind: 'err', status: 400, message: 'anchor must be a string' };
    }
    out.anchor = obj.anchor;
  }

  if (
    out.text === undefined &&
    out.range === undefined &&
    out.category === undefined &&
    out.anchor === undefined
  ) {
    return {
      kind: 'err',
      status: 400,
      message: 'at least one of text / range / category / anchor is required',
    };
  }

  return { kind: 'ok', fields: out };
}
