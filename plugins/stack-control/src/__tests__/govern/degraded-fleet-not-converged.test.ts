// 030 govern dogfood — AUDIT-20260622-10 (RED first). A degraded chunk barrage
// (fewer lanes than the configured fleet produced a quiet round) must NOT yield a
// `converged` whole-feature record. `auditChunk` reports `degraded` per chunk, but
// `runEndGovern` discarded it: every degraded chunk returning zero HIGH findings
// broke the loop with openFindings==0 and reconciled to `converged`, graduating
// work on a weakened audit. The fix threads degradation through and reconciles to
// a non-converged `degraded-fleet-surfaced` outcome. Watched to FAIL while the
// pipeline drops the field.

import { describe, expect, it } from 'vitest';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
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

function baseDeps(o: Partial<EndGovernDeps>): EndGovernDeps {
  return {
    scopeDiff: () => scope,
    resolveEnvelope: () => 150,
    auditChunk: async () => ({ findings: [], degraded: false }),
    planContext: () => 'P',
    ...o,
  };
}

describe('030 AUDIT-20260622-10 — a degraded fleet cannot converge', () => {
  it('a clean-but-degraded chunk round does NOT reconcile to converged', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({ auditChunk: async () => ({ findings: [], degraded: true }) }),
    );
    expect(result.record.outcome).not.toBe('converged');
    expect(result.record.outcome).toBe('degraded-fleet-surfaced');
  });

  it('a full (non-degraded) clean round still converges (no false positive)', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({ auditChunk: async () => ({ findings: [], degraded: false }) }),
    );
    expect(result.record.outcome).toBe('converged');
  });

  it('one degraded chunk among otherwise-clean chunks still blocks convergence', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({
        // adir clean+full, bdir clean+degraded — the run as a whole was weakened.
        auditChunk: async (payload) => ({ findings: [], degraded: payload.includes('bdir/b.ts') }),
      }),
    );
    expect(result.record.outcome).toBe('degraded-fleet-surfaced');
  });
});
