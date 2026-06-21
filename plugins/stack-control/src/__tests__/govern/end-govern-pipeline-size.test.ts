// 030 T015 (RED first) — SC-001 / US1 Scenarios 1-2: end-govern on a committed
// diff that EXCEEDS the smallest lane envelope reaches a graduation decision
// (converged / override-eligible), never a boundary-too-large FATAL, and the
// union of all chunk files equals the changed-file set (no file dropped). The
// barrage is injected (stubbed) so the test never spawns models. Watched to FAIL
// while runEndGovern is a 'not implemented' stub (T023 makes it pass).

import { describe, expect, it } from 'vitest';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';

const scope: DiffScope = {
  base: 'base0',
  head: 'head0',
  files: ['a/a.ts', 'b/b.ts', 'c/c.ts', 'd/d.ts'],
  fileDiffs: new Map<string, string>([
    ['a/a.ts', 'x'.repeat(100)],
    ['b/b.ts', 'x'.repeat(100)],
    ['c/c.ts', 'x'.repeat(100)],
    ['d/d.ts', 'x'.repeat(100)],
  ]),
};

function deps(overrides: Partial<EndGovernDeps> = {}): EndGovernDeps {
  return {
    scopeDiff: () => scope,
    resolveEnvelope: () => 250, // total 400 > 250 ⇒ multiple chunks
    auditChunk: async () => ({ findings: [], degraded: false }),
    planContext: () => 'PLAN/SPEC/CONTRACTS context',
    ...overrides,
  };
}

describe('030 T015 — end-govern never FATALs on size (SC-001)', () => {
  it('reaches a graduation decision (not boundary-too-large) on a >envelope diff', async () => {
    const result = await runEndGovern({ installationRoot: '/x', item: 'multi:feature/test', base: 'base0', head: 'head0' }, deps());
    expect(['converged', 'override-eligible']).toContain(result.record.outcome);
    expect(result.chunks.length).toBeGreaterThan(1); // the >envelope diff actually partitioned
  });

  it('drops no file — union of chunk files equals the changed set', async () => {
    const result = await runEndGovern({ installationRoot: '/x', item: 'multi:feature/test', base: 'base0', head: 'head0' }, deps());
    expect(result.chunks.flatMap((c) => [...c.files]).sort()).toEqual([...scope.files].sort());
  });

  it('a clean barrage converges; outstanding findings make it override-eligible', async () => {
    const clean = await runEndGovern({ installationRoot: '/x', item: 'i', base: 'base0', head: 'head0' }, deps());
    expect(clean.record.outcome).toBe('converged');
    const dirty = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'base0', head: 'head0' },
      deps({ auditChunk: async () => ({ findings: [{ id: 'F1', title: 'bug', severity: 'HIGH' }], degraded: false }) }),
    );
    expect(dirty.record.outcome).toBe('override-eligible');
  });
});
