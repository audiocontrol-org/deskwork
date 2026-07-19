// specs/036-fleet-control-plane — T016 (RED, guard).
//
// data-model.md § Identity (line ~20): "`eventId` is identity, NEVER an
// ordering key. UUIDv7's time-ordering invites illegitimate ordering;
// ordering is `invocationSequence`'s job (PT-013). This rule is pinned by
// a test." research.md § Identifier generation names the same trap: v7's
// payoff is range-eviction by time prefix; its cost is a wall-clock leak
// that TEMPTS illegitimate ordering.
//
// This is a GUARD test, not a feature test: it must genuinely FAIL if a
// future change wires `eventId` into any ordering path. Two independent
// mechanisms, so a fix to one alone doesn't silently satisfy the other:
//
//   1. BEHAVIORAL: envelopes are constructed with `eventId` values whose
//      lexical/time order is the DELIBERATE REVERSE of their
//      `invocationSequence` order. If the sort implementation ever keyed
//      off `eventId` (directly or as a tiebreaker that dominates), sorting
//      by `invocationSequence` would produce the reversed order instead of
//      the correct one — this test would catch that on the very first run,
//      not just in some edge case.
//   2. SOURCE-INSPECTION: the exported comparator/sort functions' own
//      `Function.prototype.toString()` source text must never contain the
//      literal substring "eventId". A comparator rewritten to read
//      `a.eventId` would immediately fail this, independent of whether the
//      behavioral fixture happens to expose a visible symptom.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import {
  compareByInvocationSequence,
  sortByInvocationSequence,
} from '../../src/fleet/event.js';
import type { EventEnvelope } from '../../src/fleet/types.js';

/**
 * A minimal, fully-typed envelope fixture. `eventId` values below are
 * hand-picked (not minted) so their lexical order is the EXACT REVERSE of
 * `invocationSequence` order — the adversarial arrangement that makes the
 * behavioral test below a real discriminator, not a tautology.
 */
function envelope(invocationSequence: number, eventId: string): EventEnvelope {
  return {
    eventId,
    installationId: '11111111-1111-4111-8111-111111111111',
    invocationId: '11111111-1111-7111-8111-111111111111',
    runId: null,
    installationSequence: invocationSequence,
    invocationSequence,
    schemaVersion: 1,
    type: 'run.progress',
    wallClock: '2026-07-17T00:00:00.000Z',
    monotonicOffsetMs: invocationSequence,
    classification: 'aggregated',
  };
}

describe('eventId is identity, never an ordering key (T016 guard, data-model § Identity)', () => {
  // invocationSequence ascending: 1, 2, 3.
  // eventId lexical order:        DESCENDING (ffff... > 8888... > 0000...)
  // A correct sort keys ONLY on invocationSequence and must ignore this.
  const first = envelope(1, 'ffffffff-ffff-7fff-8fff-ffffffffffff');
  const second = envelope(2, '88888888-8888-7888-8888-888888888888');
  const third = envelope(3, '00000000-0000-7000-8000-000000000000');

  it('sortByInvocationSequence orders strictly by invocationSequence, even though eventId lexical order is the exact reverse', () => {
    const shuffled = [third, first, second];
    const sorted = sortByInvocationSequence(shuffled);
    expect(sorted.map((e) => e.invocationSequence)).toEqual([1, 2, 3]);
    // Named explicitly: if this were secretly ordering by eventId, the
    // result would be [third, second, first] (eventId descending reversed
    // to ascending 0000→8888→ffff maps to invocationSequence [3,2,1]).
    expect(sorted).toEqual([first, second, third]);
  });

  it('compareByInvocationSequence(a, b) sign follows invocationSequence, not eventId', () => {
    // first.invocationSequence (1) < second.invocationSequence (2), so this
    // must be negative — even though first.eventId > second.eventId
    // lexically (which would flip the sign under an eventId-keyed
    // comparator).
    expect(compareByInvocationSequence(first, second)).toBeLessThan(0);
    expect(compareByInvocationSequence(second, first)).toBeGreaterThan(0);
    expect(compareByInvocationSequence(first, first)).toBe(0);
  });

  it('sorting is stable/idempotent on an already-correctly-ordered input', () => {
    const alreadySorted = [first, second, third];
    expect(sortByInvocationSequence(alreadySorted)).toEqual([first, second, third]);
  });

  it('sortByInvocationSequence does not mutate its input array', () => {
    const shuffled = [third, first, second];
    const originalOrder = [...shuffled];
    sortByInvocationSequence(shuffled);
    expect(shuffled).toEqual(originalOrder);
  });

  it('SOURCE GUARD: compareByInvocationSequence never references eventId in its own source', () => {
    expect(compareByInvocationSequence.toString()).not.toContain('eventId');
  });

  it('SOURCE GUARD: sortByInvocationSequence never references eventId in its own source', () => {
    expect(sortByInvocationSequence.toString()).not.toContain('eventId');
  });

  it('SOURCE GUARD sanity: the guard itself is not vacuous — the comparator keys off invocationSequence, and sort delegates to it', () => {
    // If a refactor renamed the field the comparator keys off of without
    // updating this guard, this assertion (not the absence-of-eventId
    // assertions) is what would catch the guard going stale/vacuous.
    expect(compareByInvocationSequence.toString()).toContain('invocationSequence');
    // sortByInvocationSequence delegates to compareByInvocationSequence
    // rather than re-implementing the key, so its own source references
    // the comparator's name, not the field literally.
    expect(sortByInvocationSequence.toString()).toContain('compareByInvocationSequence');
  });
});
