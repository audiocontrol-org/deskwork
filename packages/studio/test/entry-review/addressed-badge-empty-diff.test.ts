/**
 * @vitest-environment jsdom
 *
 * Phase 8 Step 8.6.4 — empty-diff-slice fallback.
 *
 * When the operator addresses a comment by changing a region OTHER
 * than the comment's anchor (e.g. voice-pass on paragraph 5 fixes a
 * voice comment on paragraph 2), the diff between revisions has hunks
 * but NONE of them intersect the comment's anchor — the server
 * returns `{ reason, hunks: [], notes: undefined }`.
 *
 * The client renders the inline message
 *   "addressed without local diff — see the disposition reason"
 * so the operator's expectation ("I clicked the badge; I should see
 * what changed") is met with explicit text instead of a blank
 * expansion. The reason header above remains the authoritative
 * pointer to where the fix actually landed.
 *
 * The fallback is distinct from the `notes` case (handled by the
 * primary expansion test): `notes` is the server-side explanation
 * for "no diff to slice" (first iteration; spatial-anchor not
 * sliceable yet); the empty-diff fallback is "diff exists, just
 * doesn't intersect this anchor."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildAddressStamp,
  type DiffSliceFetcher,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts';
import type { AddressAnnotation } from '../../../../plugins/deskwork-studio/public/src/entry-review/state.ts';

function addr(over: Partial<AddressAnnotation> = {}): AddressAnnotation {
  return {
    id: 'a-c1',
    type: 'address',
    workflowId: 'entry-uuid',
    commentId: 'c1',
    version: 3,
    disposition: 'addressed',
    createdAt: '2026-05-31T12:00:00.000Z',
    reason: 'addressed by rewriting paragraph 5 (see § Voice notes)',
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('addressed-badge empty-diff-slice fallback (Step 8.6.4)', () => {
  it('renders the inline fallback message when hunks is empty and no notes value', async () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() =>
      Promise.resolve({
        reason: 'addressed by rewriting paragraph 5 (see § Voice notes)',
        hunks: [],
      }),
    );
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    await new Promise((r) => setTimeout(r, 0));

    const expansion = document.querySelector('.er-marginalia-diff-expansion');
    expect(expansion).not.toBeNull();
    // Reason header still rendered.
    const reason = expansion?.querySelector('.er-marginalia-diff-reason');
    expect(reason?.textContent).toBe(
      'addressed by rewriting paragraph 5 (see § Voice notes)',
    );
    // Empty-slice fallback present in the body.
    const fallback = expansion?.querySelector('.er-marginalia-diff-empty');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toBe(
      'addressed without local diff — see the disposition reason',
    );
    // Marker attribute lets diagnostic tools / triage scripts find
    // the case without text-matching the placeholder string.
    expect((fallback as HTMLElement | null)?.dataset.emptySlice).toBe('true');
  });

  it('does NOT render the empty-slice fallback when hunks are present', async () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() =>
      Promise.resolve({
        reason: 'tightened paragraph two',
        hunks: [
          {
            oldStart: 12,
            oldLines: 1,
            newStart: 12,
            newLines: 1,
            lines: ['-fluff', '+'],
          },
        ],
      }),
    );
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('.er-marginalia-diff-empty')).toBeNull();
    expect(document.querySelector('.er-marginalia-diff-hunk')).not.toBeNull();
  });

  it('does NOT render the empty-slice fallback when notes is set (notes wins)', async () => {
    // The `notes` branch is the SERVER explaining why there's no
    // slice (first iteration, spatial anchor, etc.). That explanation
    // is operator-readable on its own and replaces the generic
    // empty-slice fallback. Verify the notes text shows AND the
    // fallback marker does not appear.
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() =>
      Promise.resolve({
        reason: 'addressed in v1 (no prior revision)',
        hunks: [],
        notes: 'no prior revision to diff against',
      }),
    );
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('.er-marginalia-diff-empty')).toBeNull();
    const notes = document.querySelector('.er-marginalia-diff-notes');
    expect(notes?.textContent).toBe('no prior revision to diff against');
  });

  it('keeps the reason header visible alongside the fallback message (Step 8.6.4 semantic — reason is the pointer)', async () => {
    // The fallback's whole point is "see the disposition reason" —
    // that reason MUST be rendered above the fallback so the
    // operator can act on the pointer without scrolling or
    // re-clicking. This test pins both being present in the same
    // expansion DOM.
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() =>
      Promise.resolve({
        reason: 'addressed by rewriting paragraph 5',
        hunks: [],
      }),
    );
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    await new Promise((r) => setTimeout(r, 0));

    const expansion = document.querySelector('.er-marginalia-diff-expansion');
    const reason = expansion?.querySelector('.er-marginalia-diff-reason');
    const fallback = expansion?.querySelector('.er-marginalia-diff-empty');
    expect(reason).not.toBeNull();
    expect(fallback).not.toBeNull();
    // Reason header appears BEFORE the fallback in DOM order, so
    // the operator reads it first.
    const children = Array.from(expansion?.children ?? []);
    const reasonIdx = children.indexOf(reason as Element);
    const reasonBelowExpansion = reasonIdx === 0;
    expect(reasonBelowExpansion).toBe(true);
  });
});
