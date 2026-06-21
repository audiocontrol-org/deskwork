// 030 T044/T045 (RED first) — SC-004 / US4 Scenarios 1-2 + R5/R6: the bounded
// re-audit loop re-audits ONLY the touched set (strictly smaller than the full
// chunk set when ≥1 chunk is untouched) and reaches a graduation decision in
// bounded rounds; a coupling-cycle that prevents the touched set from shrinking
// hits the hard round cap and surfaces (round-cap-surfaced), never looping
// forever. Watched to FAIL while the pipeline has no loop (T047/T048 add it).

import { describe, expect, it } from 'vitest';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';

// Three files in three distinct dirs ⇒ three singleton chunks (no coupling).
const scope: DiffScope = {
  base: 'b',
  head: 'h',
  files: ['adir/a.ts', 'bdir/b.ts', 'cdir/c.ts'],
  fileDiffs: new Map<string, string>([
    ['adir/a.ts', 'x'.repeat(100)],
    ['bdir/b.ts', 'x'.repeat(100)],
    ['cdir/c.ts', 'x'.repeat(100)],
  ]),
};

function baseDeps(overrides: Partial<EndGovernDeps>): EndGovernDeps {
  return {
    scopeDiff: () => scope,
    resolveEnvelope: () => 150, // each chunk 100 ≤ 150; 200 > 150 ⇒ three separate chunks
    auditChunk: async () => ({ findings: [], degraded: false }),
    planContext: () => 'PLAN',
    ...overrides,
  };
}

describe('030 T044 — bounded re-audit shrinks the touched set (SC-004)', () => {
  it('re-audits only the fix-touched chunk in round 2, then converges', async () => {
    const audited: string[] = [];
    const seen = new Set<string>();
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({
        auditChunk: async (payload, chunkId) => {
          const isA = payload.includes('adir/a.ts');
          audited.push(isA ? 'A' : 'other');
          if (isA && !seen.has(chunkId)) {
            seen.add(chunkId);
            return { findings: [{ id: 'F1', title: 'bug in A', severity: 'HIGH' }], degraded: false };
          }
          return { findings: [], degraded: false };
        },
        applyFixes: async () => ({ changedFiles: ['adir/a.ts'], fixCommits: ['fix1'] }),
      }),
    );
    expect(result.record.outcome).toBe('converged');
    expect(result.record.rounds).toBe(2);
    // round 1 audited all 3, round 2 audited only A ⇒ 4 audit calls total (NOT 6 = full re-audit)
    expect(audited.length).toBe(4);
  });
});

describe('030 T045 — round-cap backstop (FR-013, R5/R6)', () => {
  it('a non-shrinking coupling cycle hits the hard cap and surfaces (never loops)', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({
        maxRounds: 3,
        auditChunk: async (payload) => {
          if (payload.includes('adir/a.ts')) return { findings: [{ id: 'F', title: 'stuck', severity: 'HIGH' }], degraded: false };
          return { findings: [], degraded: false };
        },
        applyFixes: async () => ({ changedFiles: ['adir/a.ts'], fixCommits: ['loopfix'] }), // never resolves A
      }),
    );
    expect(result.record.outcome).toBe('round-cap-surfaced');
    expect(result.record.rounds).toBe(3);
  });
});
