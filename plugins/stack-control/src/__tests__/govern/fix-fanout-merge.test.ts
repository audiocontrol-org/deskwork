// 030 T050 (RED first) — FR-010 / US5 Scenarios 2-3: merging fix worktrees back,
// a conflicting pair (two chunks' fixes touching a shared file) SERIALIZES rather
// than merging blindly, and an unresolvable merge is SURFACED to the operator (no
// fabricated resolution, Principle V). Watched to FAIL while mergeFixWorktrees is
// a 'not implemented' stub (T053 makes it pass).

import { describe, expect, it } from 'vitest';
import { mergeFixWorktrees } from '../../govern/fix-fanout/merge-serialize.js';
import type { FixOutcome } from '../../govern/fix-fanout/worktree-dispatch.js';

const outcomes: FixOutcome[] = [
  { chunkId: 'cA', fixCommits: ['a1'], changedFiles: ['shared.ts'], failed: false },
  { chunkId: 'cB', fixCommits: ['b1'], changedFiles: ['shared.ts', 'b.ts'], failed: false }, // shares shared.ts with cA
  { chunkId: 'cC', fixCommits: ['c1'], changedFiles: ['c.ts'], failed: false },
];

describe('030 T050 — merge / serialize (FR-010)', () => {
  it('serializes a shared-file pair and surfaces an unresolvable merge', () => {
    const r = mergeFixWorktrees(outcomes, (id) => id !== 'cC'); // cC merge is unresolvable
    expect(r.serializedPairs).toContainEqual({ a: 'cA', b: 'cB' }); // shared.ts ⇒ serialized, not blind-merged
    expect(r.unresolvableMerges).toContain('cC'); // surfaced, not fabricated
    expect(r.mergedChunkIds).toContain('cA');
    expect(r.mergedChunkIds).toContain('cB');
  });

  it('merges disjoint chunks cleanly with no serialization', () => {
    const disjoint: FixOutcome[] = [
      { chunkId: 'x', fixCommits: ['x1'], changedFiles: ['x.ts'], failed: false },
      { chunkId: 'y', fixCommits: ['y1'], changedFiles: ['y.ts'], failed: false },
    ];
    const r = mergeFixWorktrees(disjoint, () => true);
    expect(r.serializedPairs).toEqual([]);
    expect(r.unresolvableMerges).toEqual([]);
    expect(r.mergedChunkIds.sort()).toEqual(['x', 'y']);
  });
});
