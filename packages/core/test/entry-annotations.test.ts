/**
 * Phase 34a — entry-keyed annotation store (T2).
 *
 * Mirrors the test patterns in `entry/approve.test.ts`. Uses a fresh
 * fixture project tree on disk for each test (no fs mocks).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  listEntryAnnotationsRaw,
  mintEntryAnnotation,
} from '@/entry/annotations';
import type { DraftAnnotation } from '@/review/types';

const ENTRY_A = '11111111-1111-4111-8111-111111111111';
const ENTRY_B = '22222222-2222-4222-8222-222222222222';

function commentDraft(
  entryId: string,
  text: string,
): Omit<Extract<DraftAnnotation, { type: 'comment' }>, 'id' | 'createdAt'> {
  return {
    type: 'comment',
    workflowId: entryId,
    version: 1,
    range: { start: 0, end: 4 },
    text,
  };
}

describe('entry-keyed annotation store', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-annotations-'));
    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('round-trips a single annotation on a fresh entry', async () => {
    const minted = mintEntryAnnotation(commentDraft(ENTRY_A, 'first note'));
    await addEntryAnnotation(projectRoot, ENTRY_A, minted);
    const out = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(minted.id);
    if (out[0].type === 'comment') {
      expect(out[0].text).toBe('first note');
    } else {
      throw new Error('expected comment annotation');
    }
  });

  it('returns annotations in chronological order', async () => {
    // Mint timestamps explicitly so we can control order independently
    // of mint speed.
    const a: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'oldest'),
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const b: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'middle'),
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      createdAt: '2026-04-02T10:00:00.000Z',
    };
    const c: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'newest'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-03T10:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, b);
    await addEntryAnnotation(projectRoot, ENTRY_A, a);
    await addEntryAnnotation(projectRoot, ENTRY_A, c);
    const out = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(out.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it('does not leak annotations across entries', async () => {
    const aMinted = mintEntryAnnotation(commentDraft(ENTRY_A, 'note on A'));
    const bMinted = mintEntryAnnotation(commentDraft(ENTRY_B, 'note on B'));
    await addEntryAnnotation(projectRoot, ENTRY_A, aMinted);
    await addEntryAnnotation(projectRoot, ENTRY_B, bMinted);
    const onA = await listEntryAnnotations(projectRoot, ENTRY_A);
    const onB = await listEntryAnnotations(projectRoot, ENTRY_B);
    expect(onA).toHaveLength(1);
    expect(onB).toHaveLength(1);
    expect(onA[0].id).toBe(aMinted.id);
    expect(onB[0].id).toBe(bMinted.id);
  });

  it('returns an empty array (not null, not throw) for an entry with no annotations', async () => {
    const out = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(out).toEqual([]);
  });

  it('returns an empty array when the journal directory does not exist', async () => {
    // Recreate projectRoot WITHOUT the journal/history dir.
    await rm(projectRoot, { recursive: true, force: true });
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-annotations-'));
    const out = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(out).toEqual([]);
  });

  it('mintEntryAnnotation assigns a unique id and an ISO timestamp', () => {
    const m1 = mintEntryAnnotation(commentDraft(ENTRY_A, 'one'));
    const m2 = mintEntryAnnotation(commentDraft(ENTRY_A, 'two'));
    expect(m1.id).not.toBe(m2.id);
    expect(m1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(m1.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('preserves discriminated narrowing — every annotation type round-trips', async () => {
    const drafts: DraftAnnotation[] = [
      mintEntryAnnotation({
        type: 'comment',
        workflowId: ENTRY_A,
        version: 1,
        range: { start: 0, end: 5 },
        text: 'a comment',
      }),
      mintEntryAnnotation({
        type: 'edit',
        workflowId: ENTRY_A,
        beforeVersion: 1,
        afterMarkdown: '# new',
        diff: '- old\n+ new',
      }),
      mintEntryAnnotation({
        type: 'approve',
        workflowId: ENTRY_A,
        version: 2,
      }),
      mintEntryAnnotation({
        type: 'reject',
        workflowId: ENTRY_A,
        version: 2,
        reason: 'needs work',
      }),
      mintEntryAnnotation({
        type: 'resolve',
        workflowId: ENTRY_A,
        commentId: 'some-comment-id',
        resolved: true,
      }),
      mintEntryAnnotation({
        type: 'address',
        workflowId: ENTRY_A,
        commentId: 'some-comment-id',
        version: 3,
        disposition: 'addressed',
      }),
    ];
    for (const d of drafts) {
      await addEntryAnnotation(projectRoot, ENTRY_A, d);
    }
    const out = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(out.map((x) => x.type).sort()).toEqual(
      ['address', 'approve', 'comment', 'edit', 'reject', 'resolve'].sort(),
    );
  });
});

describe('entry-keyed edit-comment / delete-comment folding (issue #199)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-annotations-fold-'));
    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('an edit-comment replaces the named comment text in the folded view', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'orginal'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const edit: DraftAnnotation = {
      type: 'edit-comment',
      workflowId: ENTRY_A,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      commentId: comment.id,
      text: 'original',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded).toHaveLength(1);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    expect(folded[0].text).toBe('original');
    expect(folded[0].id).toBe(comment.id);
    // Raw view preserves both events.
    const raw = await listEntryAnnotationsRaw(projectRoot, ENTRY_A);
    expect(raw.map((a) => a.type).sort()).toEqual(['comment', 'edit-comment']);
  });

  it('multiple edit-comments apply in chronological order (latest wins)', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'v0'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const edit1: DraftAnnotation = {
      type: 'edit-comment',
      workflowId: ENTRY_A,
      id: 'e1111111-1111-4111-8111-111111111111',
      commentId: comment.id,
      text: 'v1',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    const edit2: DraftAnnotation = {
      type: 'edit-comment',
      workflowId: ENTRY_A,
      id: 'e2222222-2222-4222-8222-222222222222',
      commentId: comment.id,
      text: 'v2',
      createdAt: '2026-04-01T12:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit1);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit2);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded).toHaveLength(1);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    expect(folded[0].text).toBe('v2');
  });

  it('partial edit payloads preserve unspecified fields', async () => {
    const comment: DraftAnnotation = {
      type: 'comment',
      workflowId: ENTRY_A,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      version: 1,
      range: { start: 5, end: 12 },
      text: 'orig',
      category: 'voice-drift',
      anchor: 'hello',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    // Edit only text — range/category/anchor preserved.
    const edit: DraftAnnotation = {
      type: 'edit-comment',
      workflowId: ENTRY_A,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      commentId: comment.id,
      text: 'fixed',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded).toHaveLength(1);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    expect(folded[0].text).toBe('fixed');
    expect(folded[0].range).toEqual({ start: 5, end: 12 });
    expect(folded[0].category).toBe('voice-drift');
    expect(folded[0].anchor).toBe('hello');
  });

  it('a delete-comment drops the named comment from the folded view', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'mistake'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const tombstone: DraftAnnotation = {
      type: 'delete-comment',
      workflowId: ENTRY_A,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      commentId: comment.id,
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, tombstone);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded).toHaveLength(0);
    // Raw view preserves both events.
    const raw = await listEntryAnnotationsRaw(projectRoot, ENTRY_A);
    expect(raw.map((a) => a.type).sort()).toEqual(['comment', 'delete-comment']);
  });

  it('a delete-comment after one or more edits drops the (would-be-edited) comment', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'v0'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const edit: DraftAnnotation = {
      type: 'edit-comment',
      workflowId: ENTRY_A,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      commentId: comment.id,
      text: 'v1',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    const tombstone: DraftAnnotation = {
      type: 'delete-comment',
      workflowId: ENTRY_A,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      commentId: comment.id,
      createdAt: '2026-04-01T12:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit);
    await addEntryAnnotation(projectRoot, ENTRY_A, tombstone);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded).toHaveLength(0);
  });

  it('rejects an edit-comment whose commentId does not reference an existing comment', async () => {
    const orphan: DraftAnnotation = {
      type: 'edit-comment',
      workflowId: ENTRY_A,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      commentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      text: 'no referent',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await expect(addEntryAnnotation(projectRoot, ENTRY_A, orphan)).rejects.toThrow(
      /unknown commentId/,
    );
  });

  it('rejects a delete-comment whose commentId does not reference an existing comment', async () => {
    const orphan: DraftAnnotation = {
      type: 'delete-comment',
      workflowId: ENTRY_A,
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      commentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await expect(addEntryAnnotation(projectRoot, ENTRY_A, orphan)).rejects.toThrow(
      /unknown commentId/,
    );
  });

  it('rejects an edit-comment that targets a comment in a DIFFERENT entry', async () => {
    const commentOnA: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'note'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, commentOnA);
    // Try to edit the A-entry comment from entry B's stream.
    const crossEntryEdit: DraftAnnotation = {
      type: 'edit-comment',
      workflowId: ENTRY_B,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      commentId: commentOnA.id,
      text: 'sneak',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await expect(addEntryAnnotation(projectRoot, ENTRY_B, crossEntryEdit)).rejects.toThrow(
      /unknown commentId/,
    );
  });

  it('non-comment annotations (resolve / address) pass through the fold unchanged', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'note'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const resolve: DraftAnnotation = {
      type: 'resolve',
      workflowId: ENTRY_A,
      id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      commentId: comment.id,
      resolved: true,
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, resolve);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded.map((a) => a.type).sort()).toEqual(['comment', 'resolve']);
  });
});

// ----- T1 (Issue #200) — archive-comment fold behavior ---------------
describe('entry-keyed archive-comment folding (issue #200)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-annotations-archive-'));
    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('an archive-comment drops the named comment from the folded view', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'prior-stage note'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const archive: DraftAnnotation = {
      type: 'archive-comment',
      workflowId: ENTRY_A,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      commentId: comment.id,
      priorStage: 'Outlining',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, archive);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded).toHaveLength(0);
    // Raw view preserves both events for the audit trail.
    const raw = await listEntryAnnotationsRaw(projectRoot, ENTRY_A);
    expect(raw.map((a) => a.type).sort()).toEqual(['archive-comment', 'comment']);
  });

  it('archive-comment also drops resolve / address annotations targeting the same comment', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'note'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const resolve: DraftAnnotation = {
      type: 'resolve',
      workflowId: ENTRY_A,
      id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      commentId: comment.id,
      resolved: true,
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    const archive: DraftAnnotation = {
      type: 'archive-comment',
      workflowId: ENTRY_A,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      commentId: comment.id,
      priorStage: 'Outlining',
      createdAt: '2026-04-01T12:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, resolve);
    await addEntryAnnotation(projectRoot, ENTRY_A, archive);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    // Both the comment AND its companion resolve should be hidden from
    // the active view.
    expect(folded).toHaveLength(0);
  });

  it('rejects an archive-comment whose commentId does not reference an existing comment', async () => {
    const orphan: DraftAnnotation = {
      type: 'archive-comment',
      workflowId: ENTRY_A,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      commentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await expect(addEntryAnnotation(projectRoot, ENTRY_A, orphan)).rejects.toThrow(
      /unknown commentId/,
    );
  });

  it('priorStage on archive-comment is preserved on read', async () => {
    const comment: DraftAnnotation = {
      ...commentDraft(ENTRY_A, 'note'),
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: '2026-04-01T10:00:00.000Z',
    };
    const archive: DraftAnnotation = {
      type: 'archive-comment',
      workflowId: ENTRY_A,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      commentId: comment.id,
      priorStage: 'Drafting',
      createdAt: '2026-04-01T11:00:00.000Z',
    };
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, archive);
    const raw = await listEntryAnnotationsRaw(projectRoot, ENTRY_A);
    const arch = raw.find((a) => a.type === 'archive-comment');
    expect(arch).toBeDefined();
    if (arch && arch.type === 'archive-comment') {
      expect(arch.priorStage).toBe('Drafting');
    }
  });
});
