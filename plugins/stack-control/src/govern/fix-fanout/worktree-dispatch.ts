// 030 fix-fanout — per-chunk fix-subagent dispatch via the capability port
// (Principle IX). Findings grouped by chunk are fixed by fix-subagents running in
// parallel under a concurrency cap (excess queued — worktree exhaustion); fixing
// is autonomous (apply + commit). Selection is by declared capability via the
// injected runFix port, NEVER vendor identity; a fix-subagent failure isolates
// its chunk and is reported (FR-009/FR-011). Implemented in Phase 7 (T052).

import type { Chunk, Finding } from '../chunk-artifacts.js';

/** A unit of fix work: one chunk plus the findings to fix in it. */
export interface FixJob {
  readonly chunk: Chunk;
  readonly findings: readonly Finding[];
}

/** The outcome of one chunk's fix-subagent run (autonomous apply+commit). */
export interface FixOutcome {
  readonly chunkId: string;
  readonly fixCommits: readonly string[];
  readonly changedFiles: readonly string[];
  readonly failed: boolean;
}

/** The capability port: fix one chunk (in-session sub-agent OR batch CLI; never branches on vendor). */
export type FixRunner = (job: FixJob) => Promise<FixOutcome>;

/** Dispatch fix-subagents per chunk (capped + queued, worktree-isolated, autonomous; failures isolated). */
export async function dispatchFixSubagents(
  jobs: readonly FixJob[],
  concurrency: number,
  runFix: FixRunner,
): Promise<FixOutcome[]> {
  const results: FixOutcome[] = new Array<FixOutcome>(jobs.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= jobs.length) return;
      const job = jobs[i];
      if (job === undefined) return;
      try {
        results[i] = await runFix(job);
      } catch {
        // FR-011: isolate the failing chunk — the other workers keep going.
        results[i] = { chunkId: job.chunk.id, fixCommits: [], changedFiles: [], failed: true };
      }
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, jobs.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}
