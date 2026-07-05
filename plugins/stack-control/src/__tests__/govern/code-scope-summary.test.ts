// 034 T016 — RED: concise code-scope exclusion summary on stderr (FR-014; SC-007)
//
// The runtime emits a concise summary of code-scope filtering to stderr when:
// - An active policy drops ≥1 file: one line naming the COUNT + "code-only" status (not the paths)
// - An active policy reduces a non-empty scope to empty: a line stating the reason (FR-011)
// - No files dropped, or policy inactive: NO summary line
//
// This test is RED — it writes the assertions but the seam (end-govern-runtime.ts
// scopeDiff closure) does NOT yet emit to stderr (T017 adds it).

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEndGovernRuntime } from '../../govern/end-govern-runtime.js';
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

/**
 * A real on-disk git repo: seed commit, then one mixed code+docs commit.
 * Files in the mixed commit:
 *   - src/foo.ts (code, kept)
 *   - plugins/x/skills/y/SKILL.md (doc but in default include, kept)
 *   - docs/PRD.md (doc, dropped)
 *   - test/fixtures/example.md (doc, dropped)
 *   - README.md (doc, dropped)
 * Expected exclusions with default policy: 3 files (docs/PRD.md, test/fixtures/example.md, README.md)
 */
function gitRepoWithMixedCommit(): { repo: string; base: string; commit2: string } {
  const repo = mkdtempSync(join(tmpdir(), 'code-scope-summary-mixed-'));
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

/**
 * A real on-disk git repo: seed commit, then one docs-only commit.
 * Files in the docs commit (all documentation, no code):
 *   - docs/PRD.md
 *   - docs/DESIGN.md
 * With an active code-scope policy, all files are dropped → scope becomes empty.
 */
function gitRepoWithDocsOnlyCommit(): { repo: string; base: string; commit2: string } {
  const repo = mkdtempSync(join(tmpdir(), 'code-scope-summary-docs-'));
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

  mkdirSync(join(repo, 'docs'), { recursive: true });
  writeFileSync(join(repo, 'docs/PRD.md'), '# PRD\n');
  writeFileSync(join(repo, 'docs/DESIGN.md'), '# Design\n');
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'docs: add PRD and design');
  const commit2 = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  return { repo, base, commit2 };
}

/**
 * A real on-disk git repo: seed commit, then one code-only commit.
 * Files in the code commit (only source code, no documentation to drop):
 *   - src/foo.ts
 *   - src/bar.ts
 * With the default code-scope policy, no files are dropped.
 */
function gitRepoWithCodeOnlyCommit(): { repo: string; base: string; commit2: string } {
  const repo = mkdtempSync(join(tmpdir(), 'code-scope-summary-code-'));
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

  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/foo.ts'), 'export const foo = 1;\n');
  writeFileSync(join(repo, 'src/bar.ts'), 'export const bar = 2;\n');
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'feat: add code');
  const commit2 = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  return { repo, base, commit2 };
}

function makeRuntime(repo: string, base: string, codeScopePolicy: CodeScopePolicy, stderrCapture: (s: string) => void) {
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
    stderr: stderrCapture,
  });
}

describe('034 T016 — concise code-scope exclusion summary on stderr (FR-014; SC-007)', () => {
  it('scenario 1: excluded-count summary with mixed code+docs (3 files dropped)', () => {
    const { repo, base, commit2 } = gitRepoWithMixedCommit();
    try {
      const policy = resolveCodeScopePolicy({ codeOnly: true });
      expect(policy.active).toBe(true);

      const lines: string[] = [];
      const runtime = makeRuntime(repo, base, policy, (s) => {
        lines.push(s);
      });
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      // Sanity: the mixed fixture really does have the expected 3 docs to drop
      expect(scope.files).toContain('src/foo.ts');
      expect(scope.files).not.toContain('docs/PRD.md');
      expect(scope.files).not.toContain('test/fixtures/example.md');
      expect(scope.files).not.toContain('README.md');

      // RED ASSERTION: the captured stderr contains a summary line mentioning:
      //   - code-only scoping is ACTIVE
      //   - a NUMERIC COUNT of excluded files (3)
      // And does NOT contain the paths themselves
      const joined = lines.join('\n');
      expect(joined).toMatch(/code.only|code-only/i);
      expect(joined).toMatch(/\b3\b/);
      expect(joined).not.toContain('docs/PRD.md');
      expect(joined).not.toContain('test/fixtures/example.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('scenario 2: empty-scope reason when code-scope filters all files (docs-only commit)', () => {
    const { repo, base, commit2 } = gitRepoWithDocsOnlyCommit();
    try {
      const policy = resolveCodeScopePolicy({ codeOnly: true });
      expect(policy.active).toBe(true);

      const lines: string[] = [];
      const runtime = makeRuntime(repo, base, policy, (s) => {
        lines.push(s);
      });
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      // Sanity: the docs-only fixture gets filtered down to empty
      expect(scope.files.length).toBe(0);
      expect(scope).toHaveProperty('emptiedByCodeScope', true);

      // RED ASSERTION: the captured stderr contains a line mentioning "no code in scope"
      // or similar reason for the empty result (FR-011)
      const joined = lines.join('\n');
      expect(joined).toMatch(/no code|no.*scope|emptied/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('scenario 3: no summary when nothing is excluded (code-only commit)', () => {
    const { repo, base, commit2 } = gitRepoWithCodeOnlyCommit();
    try {
      const policy = resolveCodeScopePolicy({ codeOnly: true });
      expect(policy.active).toBe(true);

      const lines: string[] = [];
      const runtime = makeRuntime(repo, base, policy, (s) => {
        lines.push(s);
      });
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      // Sanity: the code-only fixture has no files dropped
      expect(scope.files).toContain('src/foo.ts');
      expect(scope.files).toContain('src/bar.ts');
      expect(scope.files.length).toBe(2);

      // RED ASSERTION: NO summary line is emitted (captured stderr must not contain
      // keywords that would appear in an exclusion summary)
      const joined = lines.join('\n');
      expect(joined).not.toMatch(/excluded|dropped|code.only|code-only/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
