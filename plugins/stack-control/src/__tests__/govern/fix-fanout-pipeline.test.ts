// 030 T054 (RED first) — US5: the pipeline FIX step groups findings by chunk,
// dispatches the fix-fanout, and flows fix-subagent failures + unresolvable merges
// to the reconcile surface as terminal outcomes (fix-failure-surfaced /
// unresolvable-merge-surfaced). makeFixFanout ties dispatch+merge into the
// injected applyFixes. Watched to FAIL while the pipeline ignores those signals.

import { describe, expect, it } from 'vitest';
import { runEndGovern, makeFixFanout, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';

const scope: DiffScope = {
  base: 'b',
  head: 'h',
  files: ['adir/a.ts', 'bdir/b.ts'],
  fileDiffs: new Map<string, string>([
    ['adir/a.ts', 'x'.repeat(100)],
    ['bdir/b.ts', 'x'.repeat(100)],
  ]),
};

function baseDeps(overrides: Partial<EndGovernDeps>): EndGovernDeps {
  return {
    scopeDiff: () => scope,
    resolveEnvelope: () => 150,
    auditChunk: async () => ({ findings: [{ id: 'F', title: 'bug', severity: 'HIGH' }], degraded: false }),
    planContext: () => 'PLAN',
    ...overrides,
  };
}

describe('030 T054 — pipeline FIX step surfaces failures + unresolvable merges (US5)', () => {
  it('flows an unresolvable merge to the reconcile surface', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({ applyFixes: async () => ({ changedFiles: [], fixCommits: ['c'], unresolvableMerges: ['adir-chunk'] }) }),
    );
    expect(result.record.outcome).toBe('unresolvable-merge-surfaced');
  });

  it('flows a fix-subagent failure to the reconcile surface', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({ applyFixes: async () => ({ changedFiles: [], fixCommits: [], failedChunks: ['adir-chunk'] }) }),
    );
    expect(result.record.outcome).toBe('fix-failure-surfaced');
  });

  it('makeFixFanout maps a crashing runFix into a fix-failure-surfaced terminal', async () => {
    const applyFixes = makeFixFanout({
      concurrency: 2,
      runFix: async () => {
        throw new Error('subagent crashed');
      },
      canMerge: () => true,
    });
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({ applyFixes }),
    );
    expect(result.record.outcome).toBe('fix-failure-surfaced');
  });
});
