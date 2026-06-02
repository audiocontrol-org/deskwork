/**
 * Phase 8 Step 8.4.1 — EditCommentAnnotation schema delta: optional
 * `attachments?: string[]` patch field.
 *
 * The patch field follows the same full-replacement semantics as every
 * other field on `edit-comment` (a present value REPLACES the prior
 * value; an absent value PRESERVES it). The fold-time consumer
 * (`applyEdits` in `entry/annotations.ts`) treats the field that way;
 * this schema test pins the parse contract that produces those values.
 */

import { describe, it, expect } from 'vitest';
import { DraftAnnotationSchema } from '@/schema/draft-annotation';

const EDIT_BASE = {
  type: 'edit-comment' as const,
  id: 'evt_abc123',
  workflowId: 'wf_1',
  createdAt: '2026-06-01T10:00:00.000Z',
  commentId: 'cmt_abc123',
};

describe('EditCommentAnnotation — Phase 8 Step 8.4.1 attachments field', () => {
  it('parses an edit-comment without attachments (legacy shape)', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...EDIT_BASE,
      text: 'edited text',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'edit-comment') {
      throw new Error('expected edit-comment after parse');
    }
    expect(parsed.data.attachments).toBeUndefined();
  });

  it('parses an edit-comment with attachments-only patch (the canonical Task 8.4.1 shape)', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...EDIT_BASE,
      attachments: [
        'scrapbook/screenshots/cmt_abc123-2026-06-01T10-00-00-000Z.png',
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'edit-comment') {
      throw new Error('expected edit-comment after parse');
    }
    expect(parsed.data.attachments).toEqual([
      'scrapbook/screenshots/cmt_abc123-2026-06-01T10-00-00-000Z.png',
    ]);
  });

  it('parses an edit-comment with attachments + text together', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...EDIT_BASE,
      text: 'rewritten with screenshot context',
      attachments: ['scrapbook/screenshots/cmt_abc123-A.png'],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'edit-comment') {
      throw new Error('expected edit-comment after parse');
    }
    expect(parsed.data.text).toBe('rewritten with screenshot context');
    expect(parsed.data.attachments).toEqual([
      'scrapbook/screenshots/cmt_abc123-A.png',
    ]);
  });

  it('parses an empty attachments array (the explicit-clear case)', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...EDIT_BASE,
      attachments: [],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'edit-comment') {
      throw new Error('expected edit-comment after parse');
    }
    expect(parsed.data.attachments).toEqual([]);
  });

  it('rejects attachments when not an array', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...EDIT_BASE,
      attachments: 'scrapbook/screenshots/x.png',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects attachments containing non-string entries', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...EDIT_BASE,
      attachments: ['ok.png', 42],
    });
    expect(parsed.success).toBe(false);
  });
});
