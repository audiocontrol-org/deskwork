// 030 fix-fanout — per-chunk fix-subagent dispatch via the capability port
// (Principle IX). Findings grouped by chunk are fixed by worktree-isolated
// fix-subagents running in parallel under a concurrency cap (queueing excess);
// fixing is autonomous (apply + commit). Selection is by declared capability,
// never vendor identity; fail loud when no backend declares the capability
// (FR-009). Phase 1 stub (T001); implemented in Phase 7 (T052).

import type { Chunk, Finding } from '../chunk-artifacts.js';

/** A unit of fix work: one chunk plus the findings to fix in it. */
export interface FixJob {
  readonly chunk: Chunk;
  readonly findings: readonly Finding[];
}

/** The outcome of one chunk's fix-subagent run. */
export interface FixResult {
  readonly chunkId: string;
  readonly fixCommits: readonly string[];
  readonly failed: boolean;
}

/** Dispatch fix-subagents per chunk (capped, queued, worktree-isolated, autonomous apply+commit). */
export function dispatchFixSubagents(_jobs: readonly FixJob[], _concurrency: number): Promise<readonly FixResult[]> {
  throw new Error('not implemented (030 worktree-dispatch stub — Phase 7 T052)');
}
