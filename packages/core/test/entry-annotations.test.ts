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
