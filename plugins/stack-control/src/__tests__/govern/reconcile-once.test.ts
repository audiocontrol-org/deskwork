// 030 T055/T056 (RED first) — FR-015/FR-016 / SC-005 / US6: the run reconciles
// EXACTLY ONCE into a single whole-feature record per feature; findings fixed
// within the bounded re-audit loop are CLOSED before the lift step (NOT lifted to
// the backlog), while findings still open at graduation ARE lifted. closedInLoop
// and lifted are disjoint. Watched to FAIL while the writer is absent and the
// pipeline does not partition findings (T057/T058 make it pass).

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeWholeFeatureConvergenceRecord,
  readWholeFeatureConvergenceRecord,
  type WholeFeatureConvergenceRecord,
} from '../../govern/chunk-artifacts.js';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';

const rec: WholeFeatureConvergenceRecord = {
  version: 1,
  mode: 'impl',
  item: 'multi:feature/x',
  governedShaBase: 'base0',
  headSha: 'head0',
  chunkIds: ['c1'],
  rounds: 1,
  liftedFindings: [],
  closedInLoopFindings: [],
  seamResult: { boundaryPairs: [], findings: [], suppressedCompatible: 0 },
  splitClusterRefs: [],
  outcome: 'converged',
  anchorRoot: '/root',
};

describe('030 T055 — reconcile exactly once (FR-015)', () => {
  it('writes exactly ONE record per feature (overwrite, not append) and round-trips', () => {
    const root = mkdtempSync(join(tmpdir(), 'reconcile-'));
    try {
      writeWholeFeatureConvergenceRecord(root, rec);
      const dir = writeWholeFeatureConvergenceRecord(root, { ...rec, rounds: 3 }).replace(/\/[^/]+$/, '');
      expect(readdirSync(dir).filter((f) => f.includes('impl') && f.endsWith('.json')).length).toBe(1);
      expect(readWholeFeatureConvergenceRecord(root, 'multi:feature/x').rounds).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
  return { scopeDiff: () => scope, resolveEnvelope: () => 150, auditChunk: async () => ({ findings: [], degraded: false }), planContext: () => 'P', ...o };
}

describe('030 T056 — close-in-loop before lift (FR-016, SC-005)', () => {
  it('closes an in-loop-fixed finding (NOT lifted); disjoint from lifted', async () => {
    const seen = new Set<string>();
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({
        auditChunk: async (payload, chunkId) => {
          if (payload.includes('adir/a.ts') && !seen.has(chunkId)) {
            seen.add(chunkId);
            return { findings: [{ id: 'F', title: 'fixed-in-loop', severity: 'HIGH' }], degraded: false };
          }
          return { findings: [], degraded: false };
        },
        applyFixes: async () => ({ changedFiles: ['adir/a.ts'], fixCommits: ['fix'] }),
      }),
    );
    expect(result.record.outcome).toBe('converged');
    expect(result.record.closedInLoopFindings.some((f) => f.id === 'F')).toBe(true);
    expect(result.record.liftedFindings.some((f) => f.id === 'F')).toBe(false); // closed, not lifted
    const liftedIds = new Set(result.record.liftedFindings.map((f) => f.id));
    expect(result.record.closedInLoopFindings.every((f) => !liftedIds.has(f.id))).toBe(true); // disjoint
  });

  it('lifts a still-open finding when no autonomous fix exists', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'i', base: 'b', head: 'h' },
      baseDeps({
        auditChunk: async (payload) =>
          payload.includes('adir/a.ts') ? { findings: [{ id: 'G', title: 'still-open', severity: 'HIGH' }], degraded: false } : { findings: [], degraded: false },
      }),
    );
    expect(result.record.outcome).toBe('override-eligible');
    expect(result.record.liftedFindings.some((f) => f.id === 'G')).toBe(true);
    expect(result.record.closedInLoopFindings).toEqual([]);
  });
});
