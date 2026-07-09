// 035 T003 (RED-first) — the pure bucket-binding ranking function.
//
// Asserts the EXACT {cheapest, mid, mostCapable} for every worked example in
// specs/035-model-tier-task-annotation/data-model.md § Tier ranking, plus that
// the result is independent of tier_map key insertion order (determinism, D3).

import { describe, expect, it } from 'vitest';
import { bucketBindings } from '../../workflow/tier-requirement.js';
import type { TierMap } from '../../config/types.js';

describe('bucketBindings — worked examples (data-model.md § Tier ranking)', () => {
  it('Example A — three-label fast/balanced/powerful', () => {
    const tierMap: TierMap = { fast: 'haiku', balanced: 'sonnet', powerful: 'opus' };
    expect(bucketBindings(tierMap)).toEqual({
      cheapest: 'fast',
      mid: 'balanced',
      mostCapable: 'powerful',
    });
  });

  it('Example B — two-label collapse (mid collapses onto the cheaper label)', () => {
    const tierMap: TierMap = { cheap: 'haiku', frontier: 'opus' };
    expect(bucketBindings(tierMap)).toEqual({
      cheapest: 'cheap',
      mid: 'cheap',
      mostCapable: 'frontier',
    });
  });

  it('Example C — four-label map, lower-middle picks b over c', () => {
    const tierMap: TierMap = { a: 'haiku', b: 'sonnet', c: 'opus', d: 'fable' };
    expect(bucketBindings(tierMap)).toEqual({
      cheapest: 'a',
      mid: 'b',
      mostCapable: 'd',
    });
  });

  it('Example D — tie: two labels resolve to the same model, tie-break by label ascending', () => {
    const tierMap: TierMap = { quick: 'haiku', snappy: 'haiku', deep: 'opus' };
    expect(bucketBindings(tierMap)).toEqual({
      cheapest: 'quick',
      mid: 'snappy',
      mostCapable: 'deep',
    });
  });

  it('Example E — single label collapses all three buckets onto it', () => {
    const tierMap: TierMap = { only: 'sonnet' };
    expect(bucketBindings(tierMap)).toEqual({
      cheapest: 'only',
      mid: 'only',
      mostCapable: 'only',
    });
  });
});

describe('bucketBindings — determinism (independent of key insertion order)', () => {
  it('same map built with a different key order yields the same buckets', () => {
    const forward: TierMap = { fast: 'haiku', balanced: 'sonnet', powerful: 'opus' };
    const reversed: TierMap = { powerful: 'opus', balanced: 'sonnet', fast: 'haiku' };
    expect(bucketBindings(reversed)).toEqual(bucketBindings(forward));
  });

  it('tie case is deterministic regardless of insertion order', () => {
    const orderA: TierMap = { quick: 'haiku', snappy: 'haiku', deep: 'opus' };
    const orderB: TierMap = { snappy: 'haiku', deep: 'opus', quick: 'haiku' };
    expect(bucketBindings(orderB)).toEqual(bucketBindings(orderA));
  });
});
