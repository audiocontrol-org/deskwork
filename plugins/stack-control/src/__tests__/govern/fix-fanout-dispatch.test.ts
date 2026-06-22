// 030 T049/T051 (RED first) — FR-009/FR-011 / Principle IX / US5 Scenarios 1+4:
// fix-fanout dispatches one fix-subagent per chunk through a CAPABILITY PORT
// (injected runFix — in-session sub-agent OR batch CLI, never branching on vendor
// identity), concurrency-capped with queueing (worktree exhaustion), autonomous
// apply+commit; a fix-subagent failure isolates its chunk while the others
// continue and is reported. Watched to FAIL while dispatchFixSubagents is a 'not
// implemented' stub (T052 makes it pass).

import { describe, expect, it } from 'vitest';
import { dispatchFixSubagents, type FixJob, type FixRunner } from '../../govern/fix-fanout/worktree-dispatch.js';
import type { Chunk } from '../../govern/chunk-artifacts.js';

function job(id: string): FixJob {
  const chunk: Chunk = { id, files: [`${id}.ts`], splitCluster: false, renderedBytes: 1 };
  return { chunk, findings: [{ id: `find-${id}`, title: 'x', severity: 'HIGH' }] };
}

describe('030 T049 — concurrency-capped worktree dispatch (FR-009, Principle IX)', () => {
  it('runs N chunks under the cap (queues excess), autonomous commits, all complete', async () => {
    let active = 0;
    let maxActive = 0;
    const runFix: FixRunner = async (j) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { chunkId: j.chunk.id, fixCommits: [`commit-${j.chunk.id}`], changedFiles: [...j.chunk.files], failed: false };
    };
    const out = await dispatchFixSubagents(['c1', 'c2', 'c3', 'c4'].map(job), 2, runFix);
    expect(maxActive).toBeLessThanOrEqual(2); // cap respected; excess queued (worktree exhaustion)
    expect(out.length).toBe(4);
    expect(out.every((o) => o.failed === false && o.fixCommits.length > 0)).toBe(true); // autonomous apply+commit
  });
});

describe('030 T051 — fix-failure isolation (FR-011, US5 Scenario 4)', () => {
  it('isolates a failing chunk; others continue and the failure is reported', async () => {
    const runFix: FixRunner = async (j) => {
      if (j.chunk.id === 'bad') throw new Error('fix-subagent crashed');
      return { chunkId: j.chunk.id, fixCommits: [`c-${j.chunk.id}`], changedFiles: [...j.chunk.files], failed: false };
    };
    const out = await dispatchFixSubagents(['ok1', 'bad', 'ok2'].map(job), 4, runFix);
    expect(out.find((o) => o.chunkId === 'bad')?.failed).toBe(true);
    expect(out.filter((o) => o.failed === false).length).toBe(2); // the other two continued
  });
});
