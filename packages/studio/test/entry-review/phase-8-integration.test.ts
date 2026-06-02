/**
 * @vitest-environment jsdom
 *
 * Phase 8 Task 8.8 — end-to-end integration test.
 *
 * The per-step Phase 8 tests cover each surface in isolation:
 *
 *   - `addressed-badge-expand.test.ts`     — Task 8.6 click toggle.
 *   - `addressed-badge-empty-diff.test.ts` — Step 8.6.4 fallback.
 *   - `addressed-badge-legacy.test.ts`     — Step 8.5.3 legacy marker.
 *   - `thread-render.test.ts`              — Task 8.2 reply rendering.
 *   - `threads-grouping.test.ts`           — Task 8.2 grouping helper.
 *   - `thread-permalink.test.ts`           — Step 8.2.3 hash permalinks.
 *   - `screenshot-attach.test.ts`          — Step 8.4.1 client attach.
 *   - `screenshot-attach-route.test.ts`    — Step 8.4.1 server attach.
 *   - `screenshot-promote-route.test.ts`   — Step 8.4.2 promote-to-entry.
 *   - `markdown-benefits-phase-8.test.ts`  — Task 8.7 cross-cutting render.
 *
 * Those tests pin individual contracts. This test drives the FULL
 * Phase 8 flow against a real project tree on disk — sidecar, journal,
 * markdown file, real `iterateEntry` writing a real iteration event,
 * real `addEntryAnnotation` writing real comment + address annotations,
 * real `listEntryAnnotations` folding the journal back into the
 * displayable annotation stream, real `computeDiffSlice` deriving the
 * diff-slice payload from the journal's two recorded revisions, and
 * the marginalia sidebar render reproducing what the operator sees.
 *
 * Scope:
 *   1. Create a markdown entry with a real sidecar + index.md.
 *   2. Iterate to revision 1 (the prior-version baseline).
 *   3. Add a root comment with `attachments: [screenshot.png]`
 *      (Step 8.1.1 + Step 8.4 schema field).
 *   4. Add 2 reply comments with `replyTo` pointing at the root
 *      (Step 8.2 threading + Step 8.1.1 schema field).
 *   5. Modify the markdown + iterate to revision 2 (the addressed
 *      version that the diff-slice fires against).
 *   6. Record an `addressed` disposition on the root with a non-empty
 *      `reason` (Step 8.1.2 required-reason gate + Step 8.5 contract).
 *   7. Verify the journal contains every expected event.
 *   8. Verify `listEntryAnnotations` folds the events into the expected
 *      `CommentAnnotation` + `AddressAnnotation` shapes.
 *   9. Verify `computeDiffSlice` returns a non-empty hunk set
 *      intersecting the root comment's range against the revision-1 vs.
 *      revision-2 diff.
 *  10. Drive the marginalia sidebar render (`groupCommentsIntoThreads`
 *      + `buildSidebarThread`) with the same data + a fetcher that
 *      returns the real `computeDiffSlice` output. Assert:
 *        - The thread renders with a reply-count badge ("2 replies").
 *        - The addressed badge surfaces the reason + the diff
 *          expansion fires on click with the hunk lines marked
 *          `data-kind="add"` / `data-kind="del"`.
 *        - The attached screenshot path renders as a thumbnail.
 *
 * The cross-cutting assertion that ties this test to Task 8.7 is the
 * markdown-surface inheritance: NONE of the Phase 8 affordances
 * required a separate markdown render path; everything renders against
 * the existing sidebar by virtue of the additive schema delta.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import {
  addEntryAnnotation,
  listEntryAnnotations,
  mintEntryAnnotation,
} from '@deskwork/core/entry/annotations';
import { iterateEntry } from '@deskwork/core/iterate';
import { getEntryIteration } from '@deskwork/core/iterate/history';
import { computeDiffSlice } from '@deskwork/core/entry/diff-slice';
import type { DraftAnnotation } from '@deskwork/core/review/types';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { groupCommentsIntoThreads } from '../../../../plugins/deskwork-studio/public/src/entry-review/threads.ts';
import { buildSidebarThread } from '../../../../plugins/deskwork-studio/public/src/entry-review/thread-render.ts';
import {
  type DiffSliceFetcher,
  type DiffSlicePayload,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts';
import type {
  AddressAnnotation as ClientAddressAnnotation,
  CommentAnnotation as ClientCommentAnnotation,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/state.ts';

type CommentDraft = Omit<
  Extract<DraftAnnotation, { type: 'comment' }>,
  'id' | 'createdAt'
>;

type AddressDraft = Omit<
  Extract<DraftAnnotation, { type: 'address' }>,
  'id' | 'createdAt'
>;

const ENTRY_UUID = '22222222-2222-4222-8222-222222222222';
const ATTACHMENT_PATH =
  'docs/phase8/scrapbook/screenshots/22222222-2222-4222-8222-222222222222-A.png';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/cal.md' } },
    defaultSite: 'main',
  };
}

function entryFixture(): Entry {
  return {
    uuid: ENTRY_UUID,
    slug: 'phase8',
    title: 'Phase 8 Integration Entry',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1 },
    artifactPath: 'docs/phase8/index.md',
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
  };
}

async function appendComment(
  projectRoot: string,
  draft: CommentDraft,
): Promise<string> {
  const minted = mintEntryAnnotation(draft);
  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted);
  return minted.id;
}

async function appendAddressed(
  projectRoot: string,
  draft: AddressDraft,
): Promise<string> {
  const minted = mintEntryAnnotation(draft);
  await addEntryAnnotation(projectRoot, ENTRY_UUID, minted);
  return minted.id;
}

/**
 * Convert a folded `DraftAnnotation` (server-source-of-truth shape) into
 * the client-side `CommentAnnotation` type the renderer accepts. The
 * client and server share the same wire-shape; this helper exists
 * because the test imports the client-side type from `state.ts`
 * (renderer's input contract) but produces folded annotations from
 * `listEntryAnnotations` (server-side type). The helper validates the
 * type-narrowing without an `as` cast: it throws if the input is not a
 * `comment`.
 */
function asClientComment(draft: DraftAnnotation): ClientCommentAnnotation {
  if (draft.type !== 'comment') throw new Error('expected comment annotation');
  return {
    id: draft.id,
    type: 'comment',
    workflowId: draft.workflowId,
    version: draft.version,
    range: draft.range,
    text: draft.text,
    createdAt: draft.createdAt,
    ...(draft.category !== undefined ? { category: draft.category } : {}),
    ...(draft.anchor !== undefined ? { anchor: draft.anchor } : {}),
    ...(draft.replyTo !== undefined ? { replyTo: draft.replyTo } : {}),
    ...(draft.attachments !== undefined ? { attachments: draft.attachments } : {}),
    ...(draft.spatialAnchor !== undefined ? { spatialAnchor: draft.spatialAnchor } : {}),
  };
}

function asClientAddress(draft: DraftAnnotation): ClientAddressAnnotation {
  if (draft.type !== 'address') throw new Error('expected address annotation');
  return {
    id: draft.id,
    type: 'address',
    workflowId: draft.workflowId,
    commentId: draft.commentId,
    version: draft.version,
    disposition: draft.disposition,
    createdAt: draft.createdAt,
    ...(draft.reason !== undefined ? { reason: draft.reason } : {}),
  };
}

describe('Phase 8 end-to-end integration (Task 8.8)', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;
  const revision1Markdown =
    '# Phase 8\n\nfirst paragraph stays unchanged\n\nobviously, the answer is unambiguous\n\ntail paragraph stays unchanged\n';
  const revision2Markdown =
    '# Phase 8\n\nfirst paragraph stays unchanged\n\nthe answer is unambiguous\n\ntail paragraph stays unchanged\n';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-phase8-int-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'history'), {
      recursive: true,
    });
    await mkdir(join(projectRoot, 'docs', 'phase8'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
    // Revision-1 baseline — iterate will read this for revision 1.
    await writeFile(
      join(projectRoot, 'docs', 'phase8', 'index.md'),
      revision1Markdown,
    );
    await writeSidecar(projectRoot, entryFixture());
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    document.body.innerHTML = '';
  });

  it('threads + attachments + iterate + addressed + diff-slice flow on a markdown entry', async () => {
    // Step (2): iterate to revision 1 — captures the baseline markdown
    // into the journal so the diff-slice on revision 2 has a prior to
    // diff against.
    const r1 = await iterateEntry(projectRoot, { uuid: ENTRY_UUID });
    expect(r1.version).toBe(1);
    expect(r1.stage).toBe('Drafting');

    // Step (3): root comment with attachment. The character range
    // [56, 86] in revision-2 markdown spans the "the answer is
    // unambiguous" line — overlapping the diff hunk so the slice
    // intersects.
    const rootId = await appendComment(projectRoot, {
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 1,
      range: { start: 56, end: 86 },
      text: 'this paragraph still drifts from the voice guide',
      attachments: [ATTACHMENT_PATH],
    });

    // Step (4): two replies pointing at the root.
    const reply1Id = await appendComment(projectRoot, {
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 1,
      range: { start: 56, end: 86 },
      text: 'agreed — paragraph three is the worst offender',
      replyTo: rootId,
    });
    const reply2Id = await appendComment(projectRoot, {
      type: 'comment',
      workflowId: ENTRY_UUID,
      version: 1,
      range: { start: 56, end: 86 },
      text: 'lifted the "obviously" — cleaner now',
      replyTo: rootId,
    });

    // Step (5): rewrite the markdown (removing "obviously, ") and
    // iterate to revision 2.
    await writeFile(
      join(projectRoot, 'docs', 'phase8', 'index.md'),
      revision2Markdown,
    );
    const r2 = await iterateEntry(projectRoot, { uuid: ENTRY_UUID });
    expect(r2.version).toBe(2);

    // Step (6): addressed disposition on the root with a non-empty
    // reason (Step 8.1.2 schema gate requires non-empty `reason` on
    // `addressed`). Recording against revision 2 — the diff is
    // revision 1 → revision 2.
    const addressedReason =
      'tightened paragraph three — removed the redundant "obviously"';
    await appendAddressed(projectRoot, {
      type: 'address',
      workflowId: ENTRY_UUID,
      commentId: rootId,
      version: 2,
      disposition: 'addressed',
      reason: addressedReason,
    });

    // Step (7): verify the journal contains both iteration events
    // (via `getEntryIteration` lookup), with the right markdown
    // captured per revision. The annotation events are verified
    // implicitly by Step (8)'s `listEntryAnnotations` fold below
    // (it reads the journal stream and folds it back into the
    // displayable annotation set).
    const iter1 = await getEntryIteration(projectRoot, ENTRY_UUID, 1);
    expect(iter1).not.toBeNull();
    if (!iter1) throw new Error('iter1 expected');
    expect(iter1.markdown).toBe(revision1Markdown);
    expect(iter1.stage).toBe('Drafting');
    const iter2 = await getEntryIteration(projectRoot, ENTRY_UUID, 2);
    expect(iter2).not.toBeNull();
    if (!iter2) throw new Error('iter2 expected');
    expect(iter2.markdown).toBe(revision2Markdown);
    expect(iter2.stage).toBe('Drafting');

    // Step (8): verify `listEntryAnnotations` folds the events into
    // the expected `CommentAnnotation` + `AddressAnnotation` shapes.
    const folded = await listEntryAnnotations(projectRoot, ENTRY_UUID);
    expect(folded).toHaveLength(4);
    const foldedComments = folded.filter((a) => a.type === 'comment');
    expect(foldedComments).toHaveLength(3);
    const foldedRoot = foldedComments.find((c) => c.id === rootId);
    if (!foldedRoot || foldedRoot.type !== 'comment') {
      throw new Error('expected folded root');
    }
    expect(foldedRoot.attachments).toEqual([ATTACHMENT_PATH]);
    expect(foldedRoot.replyTo).toBeUndefined();
    const foldedReplies = foldedComments.filter((c) => c.id !== rootId);
    expect(foldedReplies).toHaveLength(2);
    const replyIds = new Set<string>();
    for (const r of foldedReplies) {
      if (r.type !== 'comment') throw new Error('expected comment');
      expect(r.replyTo).toBe(rootId);
      replyIds.add(r.id);
    }
    expect(replyIds.has(reply1Id)).toBe(true);
    expect(replyIds.has(reply2Id)).toBe(true);
    const foldedAddress = folded.find((a) => a.type === 'address');
    if (!foldedAddress || foldedAddress.type !== 'address') {
      throw new Error('expected folded address');
    }
    expect(foldedAddress.disposition).toBe('addressed');
    expect(foldedAddress.reason).toBe(addressedReason);
    expect(foldedAddress.commentId).toBe(rootId);
    expect(foldedAddress.version).toBe(2);

    // Step (9): verify `computeDiffSlice` returns a non-empty hunk set
    // intersecting the root comment's range against the revision-1 vs.
    // revision-2 diff. The diff is the single "obviously, " removal +
    // its line replacement.
    const slice = await computeDiffSlice(projectRoot, ENTRY_UUID, rootId, 2);
    expect(slice).not.toBeNull();
    if (!slice) throw new Error('diff slice expected');
    expect(slice.reason).toBe(addressedReason);
    expect(slice.notes).toBeUndefined();
    expect(slice.hunks.length).toBeGreaterThan(0);
    const allLines = slice.hunks.flatMap((h) => h.lines);
    expect(allLines.some((l) => l.startsWith('-obviously'))).toBe(true);
    expect(allLines.some((l) => l.startsWith('+the answer'))).toBe(true);

    // Step (10): drive the marginalia sidebar render with the same
    // data + a fetcher that returns the real diff-slice payload. This
    // closes the cross-cutting loop: a real journal-on-disk → real
    // folded annotations → real diff-slice → real DOM render.
    const clientComments = foldedComments.map(asClientComment);
    const clientAddress = asClientAddress(foldedAddress);

    const threads = groupCommentsIntoThreads(clientComments);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe(rootId);
    expect(threads[0].replies).toHaveLength(2);
    expect(threads[0].isOrphan).toBe(false);

    // The fetcher closes over the real `computeDiffSlice` result so
    // the click-to-expand path uses the same payload the server route
    // would have served. The shape alignment between `DiffSliceResult`
    // (server) and `DiffSlicePayload` (client) is the cross-cutting
    // invariant.
    const diffPayload: DiffSlicePayload = {
      reason: slice.reason,
      hunks: slice.hunks.map((h) => ({
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        lines: [...h.lines],
      })),
    };
    const fetchDiffSlice: DiffSliceFetcher = vi.fn(() => Promise.resolve(diffPayload));

    const addressByCommentId = new Map<string, ClientAddressAnnotation>([
      [rootId, clientAddress],
    ]);

    const draftBody = document.createElement('div');
    draftBody.textContent = revision2Markdown;
    document.body.appendChild(draftBody);
    const li = buildSidebarThread(threads[0], 'current', {
      draftBody,
      addressByCommentId,
      onResolve: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onHoverEnter: vi.fn(),
      onHoverLeave: vi.fn(),
      onScrollTo: vi.fn(),
      fetchDiffSlice,
    });
    document.body.appendChild(li);

    // ---- Threads + reply-count badge (Task 8.2) ----
    const badge = li.querySelector<HTMLButtonElement>(
      '.er-marginalia-thread-toggle',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('2 replies');
    expect(badge?.getAttribute('aria-pressed')).toBe('false');
    expect(li.dataset.hasReplies).toBe('true');
    expect(li.dataset.replyCount).toBe('2');

    // ---- Addressed badge with reason (Step 8.5.3) ----
    const stamp = li.querySelector<HTMLElement>('.er-marginalia-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp?.dataset.disposition).toBe('addressed');
    const reasonNode = stamp?.querySelector<HTMLElement>(
      '.er-marginalia-stamp-reason',
    );
    expect(reasonNode).not.toBeNull();
    expect(reasonNode?.textContent).toBe(addressedReason);
    expect(reasonNode?.dataset.legacyMissingReason).toBeUndefined();

    // ---- Inline diff expansion (Task 8.6) ----
    expect(stamp?.getAttribute('role')).toBe('button');
    stamp?.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchDiffSlice).toHaveBeenCalledTimes(1);
    expect(fetchDiffSlice).toHaveBeenCalledWith(rootId, 2);

    const expansion = li.querySelector<HTMLElement>(
      '.er-marginalia-diff-expansion',
    );
    expect(expansion).not.toBeNull();
    expect(stamp?.getAttribute('aria-pressed')).toBe('true');
    const expansionReason = expansion?.querySelector('.er-marginalia-diff-reason');
    expect(expansionReason?.textContent).toBe(addressedReason);
    const diffLines = expansion?.querySelectorAll<HTMLElement>(
      '.er-marginalia-diff-line',
    );
    expect(diffLines?.length ?? 0).toBeGreaterThan(0);
    const kinds = Array.from(diffLines ?? []).map((el) => el.dataset.kind);
    expect(kinds).toContain('del');
    expect(kinds).toContain('add');

    // ---- Attached screenshot (Task 8.4 render) ----
    const strip = li.querySelector<HTMLElement>('.er-marginalia-attachments');
    expect(strip).not.toBeNull();
    const thumb = strip?.querySelector<HTMLImageElement>(
      '.er-marginalia-attachment-thumb',
    );
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute('src')).toBe(ATTACHMENT_PATH);
    expect(thumb?.getAttribute('loading')).toBe('lazy');
  });
});
