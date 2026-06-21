// 030 fix-fanout — merge fix worktrees back to the feature branch; serialize a
// conflicting pair (two chunks' fixes touching a shared file) rather than merge
// blindly; surface an unresolvable merge to the operator without fabricating a
// resolution (FR-010, Principle V). Implemented in Phase 7 (T053).

import type { FixOutcome } from './worktree-dispatch.js';

/** The merge outcome: which chunks merged, which pairs serialized, which merges were unresolvable. */
export interface MergeResult {
  readonly mergedChunkIds: readonly string[];
  readonly serializedPairs: readonly { a: string; b: string }[];
  readonly unresolvableMerges: readonly string[];
}

/** Capability port: attempt to merge a chunk's worktree back; returns false when unresolvable. */
export type MergeAttempt = (chunkId: string) => boolean;

/** Merge fix worktrees back; serialize a shared-file pair; surface an unresolvable merge. */
export function mergeFixWorktrees(outcomes: readonly FixOutcome[], canMerge: MergeAttempt): MergeResult {
  const ordered = outcomes.filter((o) => o.failed === false).sort((a, b) => a.chunkId.localeCompare(b.chunkId));
  const mergedFileOwner = new Map<string, string>();
  const mergedChunkIds: string[] = [];
  const serializedPairs: { a: string; b: string }[] = [];
  const unresolvableMerges: string[] = [];

  for (const o of ordered) {
    // Detect a shared-file conflict with an already-merged chunk → serialize (apply after), don't blind-merge.
    for (const f of o.changedFiles) {
      const owner = mergedFileOwner.get(f);
      if (owner !== undefined && owner !== o.chunkId) {
        const pair = { a: owner, b: o.chunkId };
        if (!serializedPairs.some((p) => p.a === pair.a && p.b === pair.b)) serializedPairs.push(pair);
      }
    }
    if (canMerge(o.chunkId) === false) {
      unresolvableMerges.push(o.chunkId); // surfaced, not fabricated (Principle V)
      continue;
    }
    for (const f of o.changedFiles) mergedFileOwner.set(f, o.chunkId);
    mergedChunkIds.push(o.chunkId);
  }

  return { mergedChunkIds, serializedPairs, unresolvableMerges };
}
