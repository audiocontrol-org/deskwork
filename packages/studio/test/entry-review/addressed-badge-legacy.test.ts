/**
 * @vitest-environment jsdom
 *
 * Phase 8 Task 8.5 Step 8.5.3 — back-compat read path for addressed
 * annotations that lack a `reason` field (legacy data pre-Step-8.1.2).
 *
 * Per Step 8.1.2's schema tightening (commit 91954561), every NEW
 * addressed annotation must carry a non-empty `reason`. Existing
 * journal entries written BEFORE the schema cutover can still have
 * reasonless `addressed` annotations; the studio's read-side renderer
 * must handle them gracefully.
 *
 * Step 8.5.3 contract: when the marginalia renderer builds an
 * addressed stamp for an annotation whose `reason` is missing or
 * empty, it surfaces the inline text "no reason recorded" near the
 * stamp's label rather than silently omitting the reason span. The
 * label keeps operators oriented while they triage legacy data; new
 * data always renders the substantive reason.
 *
 * Targets `plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts`,
 * the client-side stamp-rendering helper invoked from the
 * editorial-review boot path.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildAddressStamp } from '../../../../plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts';
import type { AddressAnnotation } from '../../../../plugins/deskwork-studio/public/src/entry-review/state.ts';

function addr(over: Partial<AddressAnnotation> = {}): AddressAnnotation {
  return {
    id: 'a-' + (over.commentId ?? 'c1'),
    type: 'address',
    workflowId: 'entry-uuid',
    commentId: 'c1',
    version: 3,
    disposition: 'addressed',
    createdAt: '2026-05-31T12:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('addressed-badge legacy read path (Step 8.5.3)', () => {
  it('renders "no reason recorded" when an addressed annotation has no reason field (legacy data)', () => {
    const map = new Map<string, AddressAnnotation>([
      ['c1', addr()],
    ]);

    const stamp = buildAddressStamp('c1', map);
    expect(stamp).not.toBeNull();
    if (!stamp) throw new Error('stamp should not be null');

    // The reason span is always present so the operator sees the
    // legacy-data marker rather than a silent omission.
    const reason = stamp.querySelector('.er-marginalia-stamp-reason');
    expect(reason).not.toBeNull();
    expect(reason?.textContent).toBe('no reason recorded');
  });

  it('renders "no reason recorded" when reason is an empty string (defensive read against malformed legacy data)', () => {
    const map = new Map<string, AddressAnnotation>([
      ['c1', addr({ reason: '' })],
    ]);

    const stamp = buildAddressStamp('c1', map);
    expect(stamp).not.toBeNull();
    const reason = stamp?.querySelector('.er-marginalia-stamp-reason');
    expect(reason?.textContent).toBe('no reason recorded');
  });

  it('renders the substantive reason verbatim when present (new data — Step 8.1.2 contract)', () => {
    const map = new Map<string, AddressAnnotation>([
      ['c1', addr({ reason: 'addressed by adding § Migration Notes at line 142' })],
    ]);

    const stamp = buildAddressStamp('c1', map);
    const reason = stamp?.querySelector('.er-marginalia-stamp-reason');
    expect(reason?.textContent).toBe(
      'addressed by adding § Migration Notes at line 142',
    );
  });

  it('does NOT render "no reason recorded" for deferred annotations missing a reason — only addressed is gated by the Step 8.1.2 contract', () => {
    // `deferred` and `wontfix` have always had optional reason. The
    // legacy-data marker is scoped to `addressed` because that's the
    // disposition whose contract Step 8.1.2 tightened. Surfacing
    // "no reason recorded" on a deferred stamp would be noise — the
    // operator already knows deferred carries no required reason.
    const map = new Map<string, AddressAnnotation>([
      ['c1', addr({ disposition: 'deferred' })],
    ]);

    const stamp = buildAddressStamp('c1', map);
    expect(stamp).not.toBeNull();
    const reason = stamp?.querySelector('.er-marginalia-stamp-reason');
    expect(reason).toBeNull();
  });

  it('does NOT render "no reason recorded" for wontfix annotations missing a reason — only addressed is gated', () => {
    const map = new Map<string, AddressAnnotation>([
      ['c1', addr({ disposition: 'wontfix' })],
    ]);

    const stamp = buildAddressStamp('c1', map);
    const reason = stamp?.querySelector('.er-marginalia-stamp-reason');
    expect(reason).toBeNull();
  });

  it('renders the legacy-marker reason span with the same CSS class as the substantive-reason span (visual continuity)', () => {
    const legacyMap = new Map<string, AddressAnnotation>([
      ['c1', addr()],
    ]);
    const newMap = new Map<string, AddressAnnotation>([
      ['c2', addr({ commentId: 'c2', reason: 'real reason' })],
    ]);

    const legacyStamp = buildAddressStamp('c1', legacyMap);
    const newStamp = buildAddressStamp('c2', newMap);

    const legacyReason = legacyStamp?.querySelector(
      '.er-marginalia-stamp-reason',
    );
    const newReason = newStamp?.querySelector('.er-marginalia-stamp-reason');

    // Both surfaces use the same class so existing CSS rules apply
    // uniformly. The legacy span carries an additional data attribute
    // so any operator-facing diagnostic / triage script can grep for
    // it without text-matching the placeholder string.
    expect(legacyReason?.classList.contains('er-marginalia-stamp-reason')).toBe(
      true,
    );
    expect(newReason?.classList.contains('er-marginalia-stamp-reason')).toBe(
      true,
    );
    expect(
      (legacyReason as HTMLElement | null)?.dataset.legacyMissingReason,
    ).toBe('true');
    expect(
      (newReason as HTMLElement | null)?.dataset.legacyMissingReason,
    ).toBeUndefined();
  });
});
