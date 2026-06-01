/**
 * Phase 8 Step 8.1.1 — CommentAnnotation schema delta.
 *
 * Three additive optional fields land on `CommentAnnotation`:
 *
 *   - `replyTo?: string` — root comment id for reply comments.
 *   - `attachments?: string[]` — relative paths under
 *     `<entryDir>/scrapbook/screenshots/`.
 *   - `spatialAnchor?: { kind: 'pixel' | 'dom-selector' | 'svg-element';
 *      selector?: string; x?: number; y?: number }` — spatial pin for
 *     graphical entries.
 *
 * These tests assert the additive shape — existing single-comment
 * annotations without the new fields continue to parse, each new field
 * round-trips through `safeParse`, each `spatialAnchor.kind` is
 * recognized, unknown kinds are rejected, and other annotation types
 * (edit / approve / reject / resolve / address / edit-comment /
 * delete-comment / archive-comment) are unaffected by the schema
 * extension.
 */

import { describe, it, expect } from 'vitest';
import { DraftAnnotationSchema } from '@/schema/draft-annotation';

const COMMENT_BASE = {
  type: 'comment' as const,
  id: 'cmt_abc123',
  workflowId: 'wf_1',
  createdAt: '2026-05-31T10:00:00.000Z',
  version: 1,
  range: { start: 0, end: 4 },
  text: 'sample comment',
};

describe('CommentAnnotation schema — Phase 8 Step 8.1.1 additive fields', () => {
  it('parses a legacy comment with none of the new fields', () => {
    const parsed = DraftAnnotationSchema.safeParse(COMMENT_BASE);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.type).toBe('comment');
    if (parsed.data.type !== 'comment') return;
    expect(parsed.data.replyTo).toBeUndefined();
    expect(parsed.data.attachments).toBeUndefined();
    expect(parsed.data.spatialAnchor).toBeUndefined();
  });

  it('parses and preserves replyTo', () => {
    const input = { ...COMMENT_BASE, replyTo: 'cmt_root_xyz' };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'comment') return;
    expect(parsed.data.replyTo).toBe('cmt_root_xyz');
  });

  it('parses and preserves attachments (array of relative paths)', () => {
    const input = {
      ...COMMENT_BASE,
      attachments: [
        'scrapbook/screenshots/comment-abc-12345.png',
        'scrapbook/screenshots/comment-abc-12346.png',
      ],
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'comment') return;
    expect(parsed.data.attachments).toEqual([
      'scrapbook/screenshots/comment-abc-12345.png',
      'scrapbook/screenshots/comment-abc-12346.png',
    ]);
  });

  it('parses and preserves spatialAnchor of kind "pixel"', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'pixel' as const, x: 100, y: 200 },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'comment') return;
    expect(parsed.data.spatialAnchor).toEqual({ kind: 'pixel', x: 100, y: 200 });
  });

  it('parses and preserves spatialAnchor of kind "dom-selector"', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: {
        kind: 'dom-selector' as const,
        selector: '#header > h1',
      },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'comment') return;
    expect(parsed.data.spatialAnchor).toEqual({
      kind: 'dom-selector',
      selector: '#header > h1',
    });
  });

  it('parses and preserves spatialAnchor of kind "svg-element"', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: {
        kind: 'svg-element' as const,
        selector: 'g.layer-2 > rect[id="logo"]',
      },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'comment') return;
    expect(parsed.data.spatialAnchor).toEqual({
      kind: 'svg-element',
      selector: 'g.layer-2 > rect[id="logo"]',
    });
  });

  it('rejects spatialAnchor with an unknown kind', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'invalid', x: 1, y: 1 },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  // AUDIT-20260601-07 — discriminated-union shape enforcement.
  // The pre-fix schema parsed all four of these as valid because every
  // position field was independently optional; the discriminated-union
  // refactor makes each variant declare only the fields its kind needs.
  // Annotations land in the append-only journal where bad data is
  // permanent, so the schema is the only enforcement point.
  //
  // AUDIT-20260601-10 — every negative case asserts BOTH that parsing
  // failed AND that the failure path includes `spatialAnchor`. The
  // path-based pin makes the test resilient: if `COMMENT_BASE` itself
  // ever becomes invalid for an unrelated reason (renamed `range`,
  // tightened `text`), these tests would still pass against a
  // SpatialAnchor schema that no longer enforces shape — and the
  // bug-factory pattern AUDIT-20260601-07 named would silently return.
  // The `expectSpatialAnchorFailure` helper does both checks.

  function expectSpatialAnchorFailure(
    parsed: ReturnType<typeof DraftAnnotationSchema.safeParse>,
  ): void {
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const anchorIssues = parsed.error.issues.filter((i) =>
      i.path.includes('spatialAnchor'),
    );
    // At least one of the surfaced issues must name `spatialAnchor` in
    // its path — without this, `parsed.success === false` could be true
    // for a totally unrelated reason (a base-field violation) and the
    // test would pass for the wrong reason.
    expect(anchorIssues.length).toBeGreaterThan(0);
  }

  it('rejects spatialAnchor kind "pixel" without coordinates', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'pixel' },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expectSpatialAnchorFailure(parsed);
  });

  it('rejects spatialAnchor kind "dom-selector" without selector', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'dom-selector' },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expectSpatialAnchorFailure(parsed);
  });

  it('rejects spatialAnchor kind "svg-element" without selector', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'svg-element' },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expectSpatialAnchorFailure(parsed);
  });

  it('rejects spatialAnchor kind "pixel" carrying a selector field', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'pixel', x: 10, y: 20, selector: '#header' },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expectSpatialAnchorFailure(parsed);
  });

  it('rejects spatialAnchor kind "svg-element" carrying x/y fields', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'svg-element', selector: '#shape', x: 1, y: 2 },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expectSpatialAnchorFailure(parsed);
  });

  it('rejects spatialAnchor kind "dom-selector" carrying x/y fields', () => {
    const input = {
      ...COMMENT_BASE,
      spatialAnchor: { kind: 'dom-selector', selector: '#header', x: 1, y: 2 },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expectSpatialAnchorFailure(parsed);
  });

  it('parses a comment with all three new fields set together', () => {
    const input = {
      ...COMMENT_BASE,
      replyTo: 'cmt_root_xyz',
      attachments: ['scrapbook/screenshots/comment-abc-12345.png'],
      spatialAnchor: { kind: 'pixel' as const, x: 42, y: 84 },
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    if (parsed.data.type !== 'comment') return;
    expect(parsed.data.replyTo).toBe('cmt_root_xyz');
    expect(parsed.data.attachments).toEqual([
      'scrapbook/screenshots/comment-abc-12345.png',
    ]);
    expect(parsed.data.spatialAnchor).toEqual({ kind: 'pixel', x: 42, y: 84 });
  });

  it('rejects replyTo when supplied with a non-string value', () => {
    const input = { ...COMMENT_BASE, replyTo: 42 };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('rejects attachments when supplied with non-array value', () => {
    const input = {
      ...COMMENT_BASE,
      attachments: 'scrapbook/screenshots/comment-abc-12345.png',
    };
    const parsed = DraftAnnotationSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });
});

describe('Other annotation types — unaffected by Phase 8 Step 8.1.1', () => {
  const BASE = {
    id: 'a_1',
    workflowId: 'wf_1',
    createdAt: '2026-05-31T10:00:00.000Z',
  };

  it('still parses an edit annotation', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...BASE,
      type: 'edit',
      beforeVersion: 1,
      afterMarkdown: 'new body',
      diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
    });
    expect(parsed.success).toBe(true);
  });

  it('still parses an approve annotation', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...BASE,
      type: 'approve',
      version: 2,
    });
    expect(parsed.success).toBe(true);
  });

  it('still parses a reject annotation (with and without reason)', () => {
    expect(
      DraftAnnotationSchema.safeParse({
        ...BASE,
        type: 'reject',
        version: 2,
      }).success,
    ).toBe(true);
    expect(
      DraftAnnotationSchema.safeParse({
        ...BASE,
        type: 'reject',
        version: 2,
        reason: 'needs more receipts',
      }).success,
    ).toBe(true);
  });

  it('still parses a resolve annotation', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...BASE,
      type: 'resolve',
      commentId: 'cmt_abc123',
      resolved: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('still parses an address annotation', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...BASE,
      type: 'address',
      commentId: 'cmt_abc123',
      version: 3,
      disposition: 'addressed',
    });
    expect(parsed.success).toBe(true);
  });

  it('still parses an edit-comment annotation', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...BASE,
      type: 'edit-comment',
      commentId: 'cmt_abc123',
      text: 'edited text',
    });
    expect(parsed.success).toBe(true);
  });

  it('still parses a delete-comment annotation', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...BASE,
      type: 'delete-comment',
      commentId: 'cmt_abc123',
    });
    expect(parsed.success).toBe(true);
  });

  it('still parses an archive-comment annotation', () => {
    const parsed = DraftAnnotationSchema.safeParse({
      ...BASE,
      type: 'archive-comment',
      commentId: 'cmt_abc123',
      priorStage: 'Drafting',
    });
    expect(parsed.success).toBe(true);
  });
});
