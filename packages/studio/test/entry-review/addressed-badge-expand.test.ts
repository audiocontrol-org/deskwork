/**
 * @vitest-environment jsdom
 *
 * Phase 8 Step 8.6.1 + 8.6.3 — clicking the "addressed" badge expands
 * inline to show the disposition reason as a header AND a side-by-side
 * mini-diff body.
 *
 * Per `.claude/rules/affordance-placement.md`, the affordance lives ON
 * the component it affects — the diff slice IS the thing the badge
 * addresses, so the click-to-expand control belongs on the badge, not
 * in a sibling toolbar. This test asserts the on-component placement
 * AND the round-trip behavior (toggle on → fetcher fires → expansion
 * rendered → toggle off → expansion removed).
 *
 * The fetcher is injected via the `fetchDiffSlice` dep (matches the
 * `onResolve` / `onEdit` / `onDelete` callback pattern) so the test
 * can stub it without touching `fetch()`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildAddressStamp,
  type DiffSliceFetcher,
  type DiffSlicePayload,
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
    reason: 'tightened paragraph two — removed the redundant "obviously"',
    ...over,
  };
}

function makePayload(over: Partial<DiffSlicePayload> = {}): DiffSlicePayload {
  return {
    reason: 'tightened paragraph two — removed the redundant "obviously"',
    hunks: [
      {
        oldStart: 12,
        oldLines: 1,
        newStart: 12,
        newLines: 1,
        lines: [
          '-obviously, the answer is unambiguous',
          '+the answer is unambiguous',
        ],
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('addressed-badge inline diff expansion (Step 8.6.1 + 8.6.3)', () => {
  it('marks the stamp as interactive when a fetcher is wired', () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() => Promise.resolve(makePayload()));

    const stamp = buildAddressStamp('c1', map, fetcher);
    expect(stamp).not.toBeNull();
    if (!stamp) throw new Error('stamp should not be null');
    document.body.appendChild(stamp);

    // role=button so a screen reader announces it correctly.
    expect(stamp.getAttribute('role')).toBe('button');
    expect(stamp.getAttribute('tabindex')).toBe('0');
    expect(stamp.getAttribute('aria-pressed')).toBe('false');
    expect(stamp.dataset.expandable).toBe('true');
  });

  it('does NOT mark the stamp as interactive when no fetcher is wired (back-compat)', () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const stamp = buildAddressStamp('c1', map);
    expect(stamp).not.toBeNull();
    if (!stamp) throw new Error('stamp should not be null');
    // No role, no tabindex, no expandable marker — same shape as the
    // pre-8.6 stamp so legacy tests pass unchanged.
    expect(stamp.getAttribute('role')).toBeNull();
    expect(stamp.dataset.expandable).toBeUndefined();
  });

  it('does NOT mark deferred or wontfix stamps as interactive — only addressed', () => {
    const deferredMap = new Map<string, AddressAnnotation>([
      ['c1', addr({ disposition: 'deferred' })],
    ]);
    const wontfixMap = new Map<string, AddressAnnotation>([
      ['c1', addr({ disposition: 'wontfix' })],
    ]);
    const fetcher: DiffSliceFetcher = vi.fn(() => Promise.resolve(makePayload()));

    const deferredStamp = buildAddressStamp('c1', deferredMap, fetcher);
    const wontfixStamp = buildAddressStamp('c1', wontfixMap, fetcher);

    expect(deferredStamp?.getAttribute('role')).toBeNull();
    expect(wontfixStamp?.getAttribute('role')).toBeNull();
  });

  it('starts collapsed — no expansion in the DOM until the badge is clicked', () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() => Promise.resolve(makePayload()));
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    expect(document.querySelector('.er-marginalia-diff-expansion')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('expands on click — fires fetcher, renders reason header + diff body', async () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() => Promise.resolve(makePayload()));
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    // Wait one microtask tick for the async fetch + render.
    await new Promise((r) => setTimeout(r, 0));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('c1', 3);

    const expansion = document.querySelector('.er-marginalia-diff-expansion');
    expect(expansion).not.toBeNull();
    expect(stamp.getAttribute('aria-pressed')).toBe('true');

    // Reason header rendered.
    const reason = expansion?.querySelector('.er-marginalia-diff-reason');
    expect(reason?.textContent).toBe(
      'tightened paragraph two — removed the redundant "obviously"',
    );

    // Diff body rendered with two lines.
    const hunkBlock = expansion?.querySelector('.er-marginalia-diff-hunk');
    expect(hunkBlock).not.toBeNull();
    const lines = expansion?.querySelectorAll('.er-marginalia-diff-line');
    expect(lines?.length).toBe(2);
    // Per-line `data-kind` lets CSS color them differently.
    expect((lines?.[0] as HTMLElement).dataset.kind).toBe('del');
    expect((lines?.[1] as HTMLElement).dataset.kind).toBe('add');
  });

  it('toggles off on second click — removes the expansion and resets aria-pressed', async () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() => Promise.resolve(makePayload()));
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.er-marginalia-diff-expansion')).not.toBeNull();

    stamp.click();
    expect(document.querySelector('.er-marginalia-diff-expansion')).toBeNull();
    expect(stamp.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders an inline error marker when the fetcher rejects', async () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() =>
      Promise.reject(new Error('HTTP 500')),
    );
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    await new Promise((r) => setTimeout(r, 0));

    const err = document.querySelector('.er-marginalia-diff-expansion--error');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('Could not load diff slice');
    expect(err?.textContent).toContain('HTTP 500');
  });

  it('places the expansion DIRECTLY after the stamp in the DOM (on-component placement)', async () => {
    // Affordance-placement rule: the expansion lives next to the
    // badge it expands FROM, not in a side panel / toolbar / modal.
    // Verify the expansion is the stamp's IMMEDIATE next sibling so
    // CSS can style them as a single visual unit.
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() => Promise.resolve(makePayload()));
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    // Wrap the stamp in a real container — mimics the sidebar item
    // layout where the stamp lives inside an <li>.
    const li = document.createElement('li');
    li.appendChild(stamp);
    const trailingActions = document.createElement('div');
    trailingActions.className = 'er-marginalia-actions';
    li.appendChild(trailingActions);
    document.body.appendChild(li);

    stamp.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(stamp.nextElementSibling?.classList.contains('er-marginalia-diff-expansion')).toBe(true);
    // The actions div is now AFTER the expansion (i.e., the expansion
    // was inserted between stamp and actions, not at the bottom of li).
    expect(stamp.nextElementSibling?.nextElementSibling).toBe(trailingActions);
  });

  it('responds to keyboard Enter / Space activation (role=button accessibility)', async () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    const fetcher: DiffSliceFetcher = vi.fn(() => Promise.resolve(makePayload()));
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.er-marginalia-diff-expansion')).not.toBeNull();

    // Space toggles off.
    stamp.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(document.querySelector('.er-marginalia-diff-expansion')).toBeNull();
  });

  it('debounces double-clicks while a fetch is in flight (no duplicate network calls)', async () => {
    const map = new Map<string, AddressAnnotation>([['c1', addr()]]);
    let resolveFetch: ((value: DiffSlicePayload) => void) | null = null;
    const fetcher: DiffSliceFetcher = vi.fn(
      () => new Promise<DiffSlicePayload>((r) => { resolveFetch = r; }),
    );
    const stamp = buildAddressStamp('c1', map, fetcher);
    if (!stamp) throw new Error('stamp');
    document.body.appendChild(stamp);

    stamp.click();
    stamp.click();
    stamp.click();
    // Three clicks, but fetcher hasn't resolved yet — only the first
    // click should have fired the fetch. The other two are dropped
    // because dataset.fetching === '1'.
    expect(fetcher).toHaveBeenCalledTimes(1);

    if (!resolveFetch) throw new Error('fetch should be in flight');
    (resolveFetch as (value: DiffSlicePayload) => void)(makePayload());
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('.er-marginalia-diff-expansion')).not.toBeNull();
  });
});
