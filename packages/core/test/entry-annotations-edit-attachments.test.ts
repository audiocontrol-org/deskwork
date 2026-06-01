/**
 * Phase 8 Step 8.4.1 — fold-time behavior of the `attachments` patch
 * field on `edit-comment` annotations.
 *
 * Mirrors the existing `partial edit payloads preserve unspecified
 * fields` test in `entry-annotations.test.ts` but covers the new
 * `attachments` field's specific semantics:
 *
 *   - Present → REPLACES the prior value in the folded comment.
 *   - Absent → PRESERVES the prior value.
 *   - Empty array → explicit clear (folds to `[]`, not `undefined`).
 *   - Multiple edits with attachments → latest-wins (full-replacement).
 *
 * The raw journal preserves both the original comment and the edit, as
 * expected of an append-only store; only the FOLDED active-comment view
 * shows the post-edit attachment list.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  listEntryAnnotationsRaw,
} from '@/entry/annotations';
import type { DraftAnnotation } from '@/review/types';

const ENTRY_A = '11111111-1111-4111-8111-111111111111';

const COMMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function rootComment(over: Partial<DraftAnnotation> = {}): DraftAnnotation {
  return {
    type: 'comment',
    workflowId: ENTRY_A,
    id: COMMENT_ID,
    version: 1,
    range: { start: 0, end: 5 },
    text: 'comment',
    createdAt: '2026-06-01T10:00:00.000Z',
    ...over,
  };
}

function attachEdit(
  attachments: string[] | undefined,
  over: Partial<DraftAnnotation> = {},
): DraftAnnotation {
  const base = {
    type: 'edit-comment' as const,
    workflowId: ENTRY_A,
    commentId: COMMENT_ID,
    createdAt: '2026-06-01T11:00:00.000Z',
    ...(attachments !== undefined ? { attachments } : {}),
  };
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ...base,
    ...over,
  } as DraftAnnotation;
}

describe('entry-annotations fold — edit-comment attachments (Step 8.4.1)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-attach-fold-'));
    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('a present attachments array on edit-comment replaces the prior value', async () => {
    const comment = rootComment({
      attachments: ['scrapbook/screenshots/old.png'],
    });
    const edit = attachEdit([
      'scrapbook/screenshots/old.png',
      'scrapbook/screenshots/new.png',
    ]);
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    expect(folded).toHaveLength(1);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    expect(folded[0].attachments).toEqual([
      'scrapbook/screenshots/old.png',
      'scrapbook/screenshots/new.png',
    ]);
  });

  it('absent attachments on edit-comment preserves the prior attachments', async () => {
    const comment = rootComment({
      attachments: ['scrapbook/screenshots/keep.png'],
    });
    const edit = attachEdit(undefined, {
      text: 'edited text but attachments preserved',
    } as Partial<DraftAnnotation>);
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    expect(folded[0].attachments).toEqual([
      'scrapbook/screenshots/keep.png',
    ]);
    expect(folded[0].text).toBe('edited text but attachments preserved');
  });

  it('empty attachments array on edit-comment explicitly clears the list', async () => {
    const comment = rootComment({
      attachments: ['scrapbook/screenshots/x.png'],
    });
    const edit = attachEdit([]);
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    // Empty array is the explicit clear — distinct from `undefined`
    // which preserves the prior value.
    expect(folded[0].attachments).toEqual([]);
  });

  it('latest-wins when multiple edit-comments carry attachments', async () => {
    const comment = rootComment();
    const editA = attachEdit(['scrapbook/screenshots/A.png'], {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea',
      createdAt: '2026-06-01T11:00:00.000Z',
    });
    const editB = attachEdit(
      ['scrapbook/screenshots/A.png', 'scrapbook/screenshots/B.png'],
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeeb',
        createdAt: '2026-06-01T12:00:00.000Z',
      },
    );
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, editA);
    await addEntryAnnotation(projectRoot, ENTRY_A, editB);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    expect(folded[0].attachments).toEqual([
      'scrapbook/screenshots/A.png',
      'scrapbook/screenshots/B.png',
    ]);
    // Raw view shows every event.
    const raw = await listEntryAnnotationsRaw(projectRoot, ENTRY_A);
    expect(raw.map((a) => a.type)).toEqual([
      'comment',
      'edit-comment',
      'edit-comment',
    ]);
  });

  it('attachments on edit-comment defensively copies the array (read-side immutability)', async () => {
    const comment = rootComment();
    const edit = attachEdit(['scrapbook/screenshots/A.png']);
    await addEntryAnnotation(projectRoot, ENTRY_A, comment);
    await addEntryAnnotation(projectRoot, ENTRY_A, edit);
    const folded = await listEntryAnnotations(projectRoot, ENTRY_A);
    if (folded[0].type !== 'comment') throw new Error('expected comment');
    const list = folded[0].attachments;
    if (!list) throw new Error('expected attachments after edit');
    // Mutating the returned array must NOT leak into a second read.
    list.push('scrapbook/screenshots/leaked.png');
    const folded2 = await listEntryAnnotations(projectRoot, ENTRY_A);
    if (folded2[0].type !== 'comment') throw new Error('expected comment');
    expect(folded2[0].attachments).toEqual(['scrapbook/screenshots/A.png']);
  });
});
