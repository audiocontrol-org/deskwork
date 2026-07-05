// 034 T012 (US3, FR-011) — RED: a documentation-only diff that code-only filtering
// reduces to empty must graduate as a "nothing to govern — no code in scope"
// SUCCESS, never the AUDIT-20260622-23 empty-scope FATAL (see
// empty-scope-fails-loud.test.ts). That guard exists to catch a GENUINELY empty
// diff (bad base, over-broad exclusion, no scoped files) — a zero-audit
// `converged` record there would be a silent graduation defect. This is the
// opposite case: the diff was real and non-empty BEFORE code-only filtering; the
// filter itself, by design, dropped every file because none of them were code.
// That is not a defect to surface — it is the feature working as intended
// (US3 acceptance scenarios 1-2) — and it must satisfy the SAME graduation
// precondition (`isImplFeatureConverged`) a real convergence does.
//
// The two cases are distinguished via `scopeDiff`'s `emptiedByCodeScope` signal,
// which the runtime seam (end-govern-runtime.ts) sets from `code-scope.ts`'s
// `summarizeCodeScope` when an ACTIVE policy reduces a non-empty pre-filter scope
// to empty. This test drives `runEndGovern` directly through injected
// `EndGovernDeps` (mirroring empty-scope-fails-loud.test.ts's deps-injection
// harness) — the pipeline's own contract, independent of the runtime/git plumbing
// already covered by code-scope-integration.test.ts (T007). The
// `EmptiedByCodeScope` shape below is declared LOCALLY (test-only): a function
// returning this narrower, more-specific shape is assignable wherever
// `EndGovernDeps.scopeDiff`'s (wider) declared return type is expected, so this
// test does not require any production type change to compile.
//
// RED at write time: `runEndGovern` does not yet read `emptiedByCodeScope` — an
// empty `scope.files` always hits the fail-loud guard, so scenarios 1/2 below
// throw instead of succeeding. T013 greens this.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import { isImplFeatureConverged, writeWholeFeatureConvergenceRecord } from '../../govern/chunk-artifacts.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';

/** The 034 FR-011 signal: `scopeDiff`'s return, augmented with the code-scope-emptied
 * flag the runtime seam sets when an active policy emptied a non-empty scope. */
interface EmptiedByCodeScope extends DiffScope {
  readonly emptiedByCodeScope: true;
}

const genuinelyEmptyScope: DiffScope = { base: 'base0', head: 'head0', files: [], fileDiffs: new Map() };

const docsOnlyEmptiedScope: EmptiedByCodeScope = {
  base: 'base1',
  head: 'head1',
  files: [],
  fileDiffs: new Map(),
  emptiedByCodeScope: true,
};

function baseDeps(o: Partial<EndGovernDeps>): EndGovernDeps {
  return {
    scopeDiff: () => genuinelyEmptyScope,
    resolveEnvelope: () => 1000,
    auditChunk: async () => ({ findings: [], degraded: false }),
    planContext: () => 'P',
    ...o,
  };
}

describe('034 T012 (US3/FR-011) — empty code-scope graduates as a success, not a FATAL', () => {
  it('scenario 1: a documentation-only diff (emptied by code-only filtering) is a "nothing to govern" success', async () => {
    const result = await runEndGovern(
      { installationRoot: '/x', item: 'multi:feature/docs-only', base: 'base1', head: 'head1' },
      baseDeps({ scopeDiff: () => docsOnlyEmptiedScope }),
    );

    expect(result.record.outcome).toBe('converged');
    expect(result.record.chunkIds).toEqual([]);
    expect(result.reason, 'a reason naming the no-code-in-scope success').toMatch(/no code in scope/i);
  });

  it('scenario 2: the "nothing to govern" success satisfies the graduation precondition', async () => {
    const installationRoot = mkdtempSync(join(tmpdir(), 'code-scope-empty-grad-'));
    try {
      const item = 'multi:feature/docs-only-grad';
      const result = await runEndGovern(
        { installationRoot, item, base: 'base1', head: 'head1' },
        baseDeps({ scopeDiff: () => docsOnlyEmptiedScope }),
      );

      // Mirror govern-arms.ts's persist step: the pipeline result is written as the
      // ONE record the impl graduate gate (`isImplFeatureConverged`) reads.
      writeWholeFeatureConvergenceRecord(installationRoot, result.record);

      expect(
        isImplFeatureConverged(installationRoot, item),
        'graduation gate must open on the empty-code-scope success',
      ).toBe(true);
    } finally {
      rmSync(installationRoot, { recursive: true, force: true });
    }
  });

  it('scenario 3 (regression guard): a GENUINELY empty diff still hits the existing fail-loud guard unchanged', async () => {
    await expect(
      runEndGovern(
        { installationRoot: '/x', item: 'multi:feature/x', base: 'base0', head: 'head0' },
        baseDeps({}),
      ),
    ).rejects.toThrow(/base0/);
    await expect(
      runEndGovern(
        { installationRoot: '/x', item: 'multi:feature/x', base: 'base0', head: 'head0' },
        baseDeps({}),
      ),
    ).rejects.toThrow(/empty|no.*file|no.*chunk/i);
  });
});
