// 034 T010 — US2 characterization tests (FR-007/FR-008; SC-004; US2 scenarios 1-4):
// the operator-facing `code_only` toggle and `code_scope` override lists, exercised
// END-TO-END THROUGH THE RUNTIME `scopeDiff` seam (`makeEndGovernRuntime`'s
// `deps.scopeDiff`) — the same seam `code-scope-integration.test.ts` (T007) proves the
// default active-filtering behavior at. This file proves the OPERATOR-CONTROL half:
//
//   1. SC-004 identity: `code_only: false` -> the runtime scopeDiff output is
//      BYTE-IDENTICAL to the no-code-scope-filtering path (filterDiffScope +
//      scopeCommittedDiff alone, no applyCodeScope).
//   2. An operator `include` addition rescues a fixture markdown that the default
//      policy would otherwise drop.
//   3. A supplied exclude/include list REPLACES (never merges into) the
//      corresponding default list — two unambiguous sub-cases, one per field.
//
// Real on-disk git repo (never a mocked filesystem), mirroring the established
// runtime-test harness in code-scope-integration.test.ts.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEndGovernRuntime } from '../../govern/end-govern-runtime.js';
import { filterDiffScope, scopeCommittedDiff } from '../../govern/payload-diff-scope.js';
import { resolveCodeScopePolicy, type CodeScopePolicy } from '../../govern/code-scope.js';
import type { LaneCapabilityProfile } from '../../govern/lane-capabilities.js';

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

/** A real on-disk git repo: seed commit, then one mixed code+docs commit — the
 * fixture every test in this file scopes `base..commit2` over. */
function gitRepoWithMixedCommit(): { repo: string; base: string; commit2: string } {
  const repo = mkdtempSync(join(tmpdir(), 'code-scope-toggle-'));
  const g = (...a: string[]): void => {
    const r = spawnSync(
      'git',
      ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`git ${a.join(' ')} failed: ${r.stderr}`);
  };
  g('init', '-q');
  writeFileSync(join(repo, 'README.md'), 'seed\n');
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'seed');
  const base = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'plugins/x/skills/y'), { recursive: true });
  mkdirSync(join(repo, 'docs'), { recursive: true });
  mkdirSync(join(repo, 'test/fixtures'), { recursive: true });
  writeFileSync(join(repo, 'src/foo.ts'), 'export const foo = 1;\n');
  writeFileSync(join(repo, 'plugins/x/skills/y/SKILL.md'), '---\nname: y\n---\nbody\n');
  writeFileSync(join(repo, 'docs/PRD.md'), '# PRD\n');
  writeFileSync(join(repo, 'test/fixtures/example.md'), '# fixture note\n');
  writeFileSync(join(repo, 'README.md'), 'seed\nupdated\n');
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'feat: mixed code + docs');
  const commit2 = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  return { repo, base, commit2 };
}

function makeRuntime(repo: string, base: string, codeScopePolicy: CodeScopePolicy) {
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
    head: 'HEAD',
    stderr: () => {},
  });
}

describe('034 T010 — SC-004 identity: code_only:false is byte-identical to no code-scope filtering', () => {
  it('runtime scopeDiff output equals filterDiffScope(scopeCommittedDiff(...), excludeDiffPaths) alone', () => {
    const { repo, base, commit2 } = gitRepoWithMixedCommit();
    try {
      const policy = resolveCodeScopePolicy({ codeOnly: false });
      expect(policy.active).toBe(false);

      const runtime = makeRuntime(repo, base, policy);
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      const expected = filterDiffScope(scopeCommittedDiff(repo, base, commit2), []);

      expect(scope.files).toEqual(expected.files);
      expect([...scope.fileDiffs.entries()].sort()).toEqual([...expected.fileDiffs.entries()].sort());
      expect(scope).toEqual(expected);

      // Sanity: the unfiltered path really does carry the documentation files this
      // suite elsewhere proves get dropped by an ACTIVE policy — otherwise this
      // "identity" assertion would be vacuously true over an already-doc-free scope.
      expect(scope.files).toContain('docs/PRD.md');
      expect(scope.files).toContain('README.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('034 T010 — operator include rescues a fixture markdown the default policy drops', () => {
  it('adding test/fixtures/**/*.md to include keeps the fixture note in scope', () => {
    const { repo, base, commit2 } = gitRepoWithMixedCommit();
    try {
      const policy = resolveCodeScopePolicy({
        codeOnly: true,
        codeScope: { include: ['test/fixtures/**/*.md'] },
      });
      const runtime = makeRuntime(repo, base, policy);
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      expect(scope.files, 'the rescued fixture markdown survives').toContain('test/fixtures/example.md');
      expect(scope.files, 'code still survives under the default exclude').toContain('src/foo.ts');
      expect(
        scope.files,
        'a doc file NOT matching the operator include stays dropped',
      ).not.toContain('docs/PRD.md');
      expect(scope.files, 'the un-rescued root README.md stays dropped').not.toContain('README.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('034 T010 — supplied exclude/include REPLACE (never merge into) the defaults (FR-008)', () => {
  it('a supplied exclude replaces the default: a plain .md no longer matches the operator-only exclude', () => {
    const { repo, base, commit2 } = gitRepoWithMixedCommit();
    try {
      // Only `exclude` is supplied; the default DOC glob (`**/*.md`) is GONE from
      // the effective policy (not merged alongside the operator's list). If the
      // implementation instead merged, docs/PRD.md would still match the default
      // `**/*.md` and stay dropped — this assertion would then fail.
      const policy = resolveCodeScopePolicy({
        codeOnly: true,
        codeScope: { exclude: ['**/*.ts'] },
      });
      expect(policy.exclude).toEqual(['**/*.ts']);

      const runtime = makeRuntime(repo, base, policy);
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      expect(
        scope.files,
        'docs/PRD.md is no longer excluded once the default doc-glob is replaced away',
      ).toContain('docs/PRD.md');
      expect(
        scope.files,
        'src/foo.ts now matches the OPERATOR exclude and is not rescued by the (still-default) include',
      ).not.toContain('src/foo.ts');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a supplied include replaces the default: SKILL.md is no longer rescued by an empty operator include', () => {
    const { repo, base, commit2 } = gitRepoWithMixedCommit();
    try {
      // Only `include` is supplied (empty); the default rescue list (SKILL.md,
      // CLAUDE.md, ...) is GONE from the effective policy. If the implementation
      // instead merged, SKILL.md would still match the default `**/SKILL.md`
      // include and survive — this assertion would then fail.
      const policy = resolveCodeScopePolicy({
        codeOnly: true,
        codeScope: { include: [] },
      });
      expect(policy.include).toEqual([]);

      const runtime = makeRuntime(repo, base, policy);
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      expect(
        scope.files,
        'SKILL.md is documentation-shaped and, with no include to rescue it, is dropped like any other .md',
      ).not.toContain('plugins/x/skills/y/SKILL.md');
      expect(scope.files, 'code still survives under the (unaffected) default exclude').toContain(
        'src/foo.ts',
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
