/**
 * Phase 8 Step 8.6.2 — per-comment inline diff-slicing for the
 * "addressed" badge expansion.
 *
 * Two test classes:
 *  - Pure unit tests against `intersectHunksWithLineRange` for the
 *    range-intersection cases the task spec calls out (fully inside,
 *    spans two hunks, outside all hunks, straddles a boundary).
 *  - End-to-end tests against `computeDiffSlice` that drive
 *    `iterateEntry` + `addEntryAnnotation` to produce real journal
 *    events on disk, then verify the slice projects correctly.
 *
 * Mirrors the fixture setup in `iterate-history.test.ts` /
 * `entry-annotations.test.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hunk } from 'diff';
import { iterateEntry } from '@/iterate/iterate';
import {
  addEntryAnnotation,
  mintEntryAnnotation,
} from '@/entry/annotations';
import {
  computeDiffSlice,
  intersectHunksWithLineRange,
} from '@/entry/diff-slice';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';
import type { DraftAnnotation } from '@/review/types';

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';

async function setupProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dw-diff-slice-'));
  await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
  await mkdir(join(root, '.deskwork', 'review-journal', 'history'), {
    recursive: true,
  });
  await writeFile(
    join(root, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'main',
    }),
  );
  return root;
}

async function setupEntry(root: string, slug: string): Promise<void> {
  await mkdir(join(root, 'docs', slug), { recursive: true });
  const e: Entry = {
    uuid: ENTRY_UUID,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1 },
    artifactPath: `docs/${slug}/index.md`,
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
  };
  await writeSidecar(root, e);
}

function hunk(newStart: number, newLines: number): Hunk {
  return {
    oldStart: newStart,
    oldLines: newLines,
    newStart,
    newLines,
    lines: [],
  };
}

describe('intersectHunksWithLineRange', () => {
  it('returns a hunk that fully contains the comment range', () => {
    const hunks = [hunk(10, 5)]; // lines 10..14
    const out = intersectHunksWithLineRange(hunks, 11, 13);
    expect(out).toHaveLength(1);
    expect(out[0].newStart).toBe(10);
  });

  it('returns multiple hunks when the comment range spans them', () => {
    const hunks = [hunk(5, 3), hunk(20, 3), hunk(50, 2)]; // 5..7, 20..22, 50..51
    const out = intersectHunksWithLineRange(hunks, 5, 30);
    expect(out.map((h) => h.newStart)).toEqual([5, 20]);
  });

  it('returns no hunks when the comment range is outside all of them', () => {
    const hunks = [hunk(5, 3), hunk(20, 3)];
    const out = intersectHunksWithLineRange(hunks, 100, 110);
    expect(out).toEqual([]);
  });

  it('includes a hunk whose boundary the comment range straddles', () => {
    const hunks = [hunk(10, 5)]; // 10..14
    const outLeft = intersectHunksWithLineRange(hunks, 8, 12);
    expect(outLeft).toHaveLength(1);
    const outRight = intersectHunksWithLineRange(hunks, 13, 18);
    expect(outRight).toHaveLength(1);
  });

  it('treats a pure-deletion hunk (newLines=0) as a zero-width anchor at newStart', () => {
    const hunks = [{ oldStart: 5, oldLines: 3, newStart: 5, newLines: 0, lines: [] }];
    // Anchor at line 5 only — line 5 overlaps, line 4 and 6 do not.
    expect(intersectHunksWithLineRange(hunks, 5, 5)).toHaveLength(1);
    expect(intersectHunksWithLineRange(hunks, 4, 4)).toHaveLength(0);
    expect(intersectHunksWithLineRange(hunks, 6, 6)).toHaveLength(0);
  });
});

describe('computeDiffSlice — end-to-end against journal', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function iterateBody(slug: string, body: string): Promise<void> {
    const indexPath = join(root, 'docs', slug, 'index.md');
    await writeFile(
      indexPath,
      `---\ndeskwork:\n  id: ${ENTRY_UUID}\n---\n\n${body}`,
    );
    await iterateEntry(root, { uuid: ENTRY_UUID });
  }

  async function appendAddressed(
    commentId: string,
    version: number,
    reason: string,
  ): Promise<void> {
    const draft: Omit<
      Extract<DraftAnnotation, { type: 'address' }>,
      'id' | 'createdAt'
    > = {
      type: 'address',
      workflowId: ENTRY_UUID,
      commentId,
      version,
      disposition: 'addressed',
      reason,
    };
    const minted = mintEntryAnnotation(draft);
    await addEntryAnnotation(root, ENTRY_UUID, minted);
  }

  async function appendComment(
    commentId: string,
    version: number,
    range: { start: number; end: number },
  ): Promise<void> {
    const draft: DraftAnnotation = {
      id: commentId,
      createdAt: '2026-04-30T10:00:00.000Z',
      type: 'comment',
      workflowId: ENTRY_UUID,
      version,
      range,
      text: 'tighten paragraph two',
    };
    await addEntryAnnotation(root, ENTRY_UUID, draft);
  }

  it('returns null when commentId does not resolve to a comment', async () => {
    await setupEntry(root, 'a');
    await iterateBody('a', '# heading\n\nfirst paragraph\n');
    const out = await computeDiffSlice(root, ENTRY_UUID, 'no-such-id', 1);
    expect(out).toBeNull();
  });

  it('returns null when no addressed annotation exists for the comment + revision', async () => {
    await setupEntry(root, 'a');
    const initial = '# heading\n\nfirst paragraph\nsecond paragraph\n';
    await iterateBody('a', initial);
    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await appendComment(commentId, 1, { start: 12, end: 27 });
    // No address annotation on revision 1.
    const out = await computeDiffSlice(root, ENTRY_UUID, commentId, 1);
    expect(out).toBeNull();
  });

  it('returns intersecting hunks + reason when the addressed paragraph changed', async () => {
    await setupEntry(root, 'a');
    // v1 body (after frontmatter is stripped by iterate, but iterate
    // writes the FULL file including frontmatter into the journal —
    // we still get line-level intersection with frontmatter offset).
    const v1Body = [
      '# heading',
      '',
      'first paragraph that needs tightening',
      'second paragraph stays put',
    ].join('\n') + '\n';
    await iterateBody('a', v1Body);
    const v2Body = [
      '# heading',
      '',
      'first paragraph — TIGHTENED via deletion of fluff',
      'second paragraph stays put',
    ].join('\n') + '\n';
    await iterateBody('a', v2Body);

    // Anchor the comment at the first-paragraph line in the v2 body
    // (line 3 in the full file with frontmatter). Find the character
    // offset of "first paragraph" in the FULL v2 file (frontmatter +
    // body, as the journal stores it).
    const fullV2 =
      `---\ndeskwork:\n  id: ${ENTRY_UUID}\n---\n\n${v2Body}`;
    const start = fullV2.indexOf('first paragraph');
    const end = start + 'first paragraph'.length;
    const commentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await appendComment(commentId, 2, { start, end });
    await appendAddressed(commentId, 2, 'tightened by deleting redundant fluff in paragraph one');

    const out = await computeDiffSlice(root, ENTRY_UUID, commentId, 2);
    expect(out).not.toBeNull();
    if (!out) throw new Error('expected slice');
    expect(out.reason).toBe('tightened by deleting redundant fluff in paragraph one');
    expect(out.hunks.length).toBeGreaterThan(0);
    // The hunk's lines should include the changed paragraph.
    const allLines = out.hunks.flatMap((h) => h.lines).join('\n');
    expect(allLines).toContain('first paragraph');
    expect(allLines).toContain('TIGHTENED');
  });

  it('returns empty hunks when the addressed comment anchors a region that did not change', async () => {
    await setupEntry(root, 'a');
    const v1Body = [
      '# heading',
      '',
      'first paragraph — unchanged across iterations',
      '',
      'second paragraph — this one gets edited',
    ].join('\n') + '\n';
    await iterateBody('a', v1Body);
    const v2Body = [
      '# heading',
      '',
      'first paragraph — unchanged across iterations',
      '',
      'second paragraph — DRAMATICALLY REWRITTEN with new copy',
    ].join('\n') + '\n';
    await iterateBody('a', v2Body);

    // Anchor on the UNCHANGED first paragraph.
    const fullV2 =
      `---\ndeskwork:\n  id: ${ENTRY_UUID}\n---\n\n${v2Body}`;
    const start = fullV2.indexOf('first paragraph');
    const end = start + 'first paragraph — unchanged across iterations'.length;
    const commentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await appendComment(commentId, 2, { start, end });
    await appendAddressed(
      commentId,
      2,
      'no local change — see global voice pass in second paragraph',
    );

    const out = await computeDiffSlice(root, ENTRY_UUID, commentId, 2);
    expect(out).not.toBeNull();
    if (!out) throw new Error('expected slice');
    expect(out.reason).toContain('no local change');
    // The diff exists (second paragraph changed) but does not
    // intersect the first paragraph's anchor.
    expect(out.hunks).toEqual([]);
    // No `notes` here — empty slice from non-overlap, not from a
    // surface-level capability gap.
    expect(out.notes).toBeUndefined();
  });

  it('returns empty hunks + a notes marker when revision is the first iteration', async () => {
    await setupEntry(root, 'a');
    await iterateBody('a', '# v1\n');
    const commentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await appendComment(commentId, 1, { start: 0, end: 4 });
    await appendAddressed(commentId, 1, 'first-iteration addressed (no prior revision)');

    const out = await computeDiffSlice(root, ENTRY_UUID, commentId, 1);
    expect(out).not.toBeNull();
    if (!out) throw new Error('expected slice');
    expect(out.hunks).toEqual([]);
    expect(out.notes).toBe('no prior revision to diff against');
  });

  it('returns empty hunks + a notes marker on spatial-anchor comments', async () => {
    await setupEntry(root, 'a');
    await iterateBody('a', '# v1\n');
    await iterateBody('a', '# v2 with body change\n');
    const commentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const draft: DraftAnnotation = {
      id: commentId,
      createdAt: '2026-04-30T10:00:00.000Z',
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 2,
      range: { start: 0, end: 4 },
      text: 'spatial comment',
      spatialAnchor: { kind: 'pixel', x: 120, y: 80 },
    };
    await addEntryAnnotation(root, ENTRY_UUID, draft);
    await appendAddressed(commentId, 2, 'addressed via graphical re-layout');

    const out = await computeDiffSlice(root, ENTRY_UUID, commentId, 2);
    expect(out).not.toBeNull();
    if (!out) throw new Error('expected slice');
    expect(out.hunks).toEqual([]);
    expect(out.notes).toBe(
      'spatial-anchor slicing lands when the graphical review surface ships',
    );
  });

  // Note: the "legacy addressed annotation without reason" case is
  // already covered by `addressed-badge-legacy.test.ts` in the studio
  // workspace (Step 8.5.3). We don't re-test it here because the
  // schema gate (Step 8.1.2, write side) refuses to append an
  // addressed annotation without `reason` — meaning legacy data on
  // disk can ONLY have come from pre-tightening journal events,
  // which exist on real projects but cannot be reconstructed through
  // the schema-gated write path. The diff-slice module's read code
  // path uses `typeof reason === 'string' ? reason : ''`, so legacy
  // data on disk surfaces as `reason === ''` for the client; the
  // studio test exercises the rendering of that case.
});
