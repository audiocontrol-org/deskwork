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
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import { isImplFeatureConverged, writeWholeFeatureConvergenceRecord } from '../../govern/chunk-artifacts.js';
import { makeEndGovernRuntime } from '../../govern/end-govern-runtime.js';
import { resolveCodeScopePolicy, type CodeScopePolicy } from '../../govern/code-scope.js';
import type { LaneCapabilityProfile } from '../../govern/lane-capabilities.js';
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

// --- T023 (AUDIT-20260705-01): the empty-scope SUCCESS must be driven by the REAL
// runtime seam (makeEndGovernRuntime.deps.scopeDiff), which decides emptiedByCodeScope
// from the actual removed files — not by a hand-injected flag. An over-broad operator
// custom exclude that empties the scope by removing real CODE must NOT graduate: it
// must fall through to the AUDIT-20260622-23 empty-scope FATAL. Only a genuinely
// documentation-only emptying (default classification) is the success path.

function viableLane(): LaneCapabilityProfile {
  return {
    name: 'model-claude',
    model: 'claude',
    binary: 'claude',
    availability: 'available',
    outputMode: 'text',
    enforcement: 'enforced',
    liveness: 'monitored',
    envelope: { maxPromptBytes: 100_000, source: 'fleet-knowledge' },
    timeoutBasis: { mode: 'override', timeoutSeconds: 300 },
  };
}

/** A real on-disk git repo: seed commit, then one commit whose files are all under
 * the given subdir with the given extension (code-only, or docs-only). */
function gitRepoWithCommit(
  prefix: string,
  files: ReadonlyArray<readonly [string, string]>,
): { repo: string; base: string; head: string } {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  const g = (...a: string[]): void => {
    const r = spawnSync(
      'git',
      ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`git ${a.join(' ')} failed: ${r.stderr}`);
  };
  g('init', '-q');
  writeFileSync(join(repo, '.gitkeep'), '');
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'seed');
  const base = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  for (const [rel, body] of files) {
    const abs = join(repo, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  }
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'change');
  const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  return { repo, base, head };
}

function makeRuntime(repo: string, base: string, head: string, codeScopePolicy: CodeScopePolicy) {
  return makeEndGovernRuntime({
    barrageBin: '/bin/true',
    installationRoot: repo,
    slug: 'feat',
    checkpoint: 'after_implement',
    varsBase: {
      feature_slug: 'feat',
      audit_log_excerpt: '',
      commit_subjects: '',
      audit_lens: 'L',
      artifact_framing: 'F',
    },
    excludeDiffPaths: [],
    codeScopePolicy,
    laneCapabilities: [viableLane()],
    requireModels: 1,
    envelope: 100_000,
    planContext: 'ctx',
    base,
    head,
    stderr: () => {},
  });
}

describe('034 T023 (AUDIT-20260705-01) — over-broad custom exclude that empties CODE must NOT silently graduate', () => {
  it('bug: a custom exclude ["src/**"] emptying a code-only diff FATALs (refuses to graduate), never converges', async () => {
    const { repo, base, head } = gitRepoWithCommit('code-scope-empty-bug-', [
      ['src/foo.ts', 'export const foo = 1;\n'],
      ['src/bar.ts', 'export const bar = 2;\n'],
    ]);
    try {
      const policy = resolveCodeScopePolicy({ codeOnly: true, codeScope: { exclude: ['src/**'], include: [] } });
      const runtime = makeRuntime(repo, base, head, policy);

      // Sanity: the seam really does empty the scope for this fixture.
      const scope = runtime.deps.scopeDiff(repo, base, head);
      expect(scope.files.length).toBe(0);
      // The removed files were CODE, not documentation — so the seam must NOT flag it
      // as a documentation-only emptying (the flag that graduates without a barrage).
      expect(scope.emptiedByCodeScope).not.toBe(true);

      // The pipeline must therefore hit the empty-scope FATAL, never a converged record.
      await expect(
        runEndGovern({ installationRoot: repo, item: 'multi:feature/code-emptied', base, head }, runtime.deps),
      ).rejects.toThrow(/empty scope/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('regression: a genuinely documentation-only diff (default policy) STILL graduates as "nothing to govern"', async () => {
    const { repo, base, head } = gitRepoWithCommit('code-scope-empty-docs-', [
      ['docs/PRD.md', '# PRD\n'],
      ['docs/DESIGN.md', '# Design\n'],
    ]);
    try {
      const policy = resolveCodeScopePolicy(undefined);
      const runtime = makeRuntime(repo, base, head, policy);

      const scope = runtime.deps.scopeDiff(repo, base, head);
      expect(scope.files.length).toBe(0);
      expect(scope.emptiedByCodeScope).toBe(true);

      const result = await runEndGovern(
        { installationRoot: repo, item: 'multi:feature/docs-only-real', base, head },
        runtime.deps,
      );
      expect(result.record.outcome).toBe('converged');
      expect(result.reason).toMatch(/no code in scope/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
