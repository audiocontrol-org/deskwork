// 030 fix-fanout — merge fix worktrees back to the feature branch; serialize a
// conflicting pair (two chunks' fixes touching a shared file) rather than
// merge blindly; surface an unresolvable merge to the operator without
// fabricating a resolution (FR-010, Principle V). Phase 1 stub (T001);
// implemented in Phase 7 (T053).

import type { FixResult } from './worktree-dispatch.js';

/** The merge outcome: committed fixes that landed + any unresolvable merges surfaced. */
export interface MergeResult {
  readonly mergedCommits: readonly string[];
  readonly unresolvableMerges: readonly string[];
}

/** Merge fix worktrees back; serialize a conflicting pair; surface an unresolvable merge. */
export function mergeFixWorktrees(_results: readonly FixResult[]): Promise<MergeResult> {
  throw new Error('not implemented (030 merge-serialize stub — Phase 7 T053)');
}
