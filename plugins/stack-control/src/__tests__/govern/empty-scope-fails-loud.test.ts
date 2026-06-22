// 030 govern dogfood — AUDIT-20260622-23 (RED first). `runEndGovern` partitioned
// the scoped diff but never rejected an EMPTY scope / empty chunk set: with no
// chunks, the audit loop breaks immediately with openFindings==[] and reconciles
// to `converged` — a converged whole-feature record written WITHOUT firing any
// barrage. A bad diff base, an exclusion filter that removes the whole surface, or
// a feature with no scoped files would then graduate on a zero-audit record. The
// fix fails loud before the audit loop, naming the base/head. Watched to FAIL while
// the empty-scope guard is absent (it would otherwise return a `converged` record).

import { describe, expect, it } from 'vitest';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';

const emptyScope: DiffScope = { base: 'base0', head: 'head0', files: [], fileDiffs: new Map() };

function baseDeps(o: Partial<EndGovernDeps>): EndGovernDeps {
  return {
    scopeDiff: () => emptyScope,
    resolveEnvelope: () => 1000,
    auditChunk: async () => ({ findings: [], degraded: false }),
    planContext: () => 'P',
    ...o,
  };
}

describe('030 AUDIT-20260622-23 — empty scope fails loud (no zero-audit converged record)', () => {
  it('throws naming the base/head when the scoped diff has no files', async () => {
    await expect(
      runEndGovern({ installationRoot: '/x', item: 'multi:feature/x', base: 'base0', head: 'head0' }, baseDeps({})),
    ).rejects.toThrow(/base0/);
    await expect(
      runEndGovern({ installationRoot: '/x', item: 'multi:feature/x', base: 'base0', head: 'head0' }, baseDeps({})),
    ).rejects.toThrow(/empty|no.*file|no.*chunk/i);
  });

  it('a non-empty scope still governs (no false fail-loud)', async () => {
    const scope: DiffScope = {
      base: 'b',
      head: 'h',
      files: ['a.ts'],
      fileDiffs: new Map([['a.ts', 'x'.repeat(50)]]),
    };
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({ scopeDiff: () => scope }),
    );
    expect(result.record.outcome).toBe('converged');
  });
});
