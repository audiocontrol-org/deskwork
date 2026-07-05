// 034 T007 — RED integration test: the code-scope filter (T004, `applyCodeScope`)
// must be applied AT THE RUNTIME `scopeDiff` SEAM (`makeEndGovernRuntime`'s
// `deps.scopeDiff`), not merely as a standalone pure function. Today `scopeDiff`
// is `filterDiffScope(scopeCommittedDiff(...), excludeDiffPaths)` — it does NOT
// compose `applyCodeScope`, so documentation files currently SURVIVE. This test
// fails for that reason (assertion-level RED): docs are present when the test
// expects them dropped. T009 wires `applyCodeScope` into the seam to green it.
//
// Mirrors the established runtime-test harness in `end-govern-runtime.test.ts`
// (describe block "runtime scopeDiff honors excludeDiffPaths"): a REAL git repo
// built on disk (never a mocked filesystem), `makeEndGovernRuntime(...)`, then
// `runtime.deps.scopeDiff(repo, base, head)` invoked directly — the exact seam
// `runEndGovern` drives for both the INITIAL scope (end-govern-pipeline.ts:98)
// and the MID-FIX RE-SCOPE (end-govern-pipeline.ts:192, same closure, same
// symbolic `head: 'HEAD'` per govern-arms.ts:281/286 + the gh-502 comment there —
// re-invoking with the same base/'HEAD' after a new commit lands is exactly how
// the pipeline's re-scope observes fix-created files).
//
// Does NOT wire the seam (that's T008/T009) — this only proves the RED.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEndGovernRuntime } from '../../govern/end-govern-runtime.js';
import { filterDiffScope, scopeCommittedDiff } from '../../govern/payload-diff-scope.js';
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

/** A real on-disk git repo: seed commit, then a mixed code+docs commit (the initial
 * implement-time diff), then a "fix" commit that adds a NEW doc file alongside new
 * code (simulating a fix round that incidentally creates documentation). */
function gitRepoWithMixedCommits(): { repo: string; base: string } {
  const repo = mkdtempSync(join(tmpdir(), 'code-scope-integ-'));
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

  // Commit 2: the "initial scope" — mixed code + docs.
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'plugins/x/skills/y'), { recursive: true });
  mkdirSync(join(repo, 'docs'), { recursive: true });
  writeFileSync(join(repo, 'src/foo.ts'), 'export const foo = 1;\n');
  writeFileSync(join(repo, 'plugins/x/skills/y/SKILL.md'), '---\nname: y\n---\nbody\n');
  writeFileSync(join(repo, 'docs/PRD.md'), '# PRD\n');
  writeFileSync(join(repo, 'README.md'), 'seed\nupdated\n');
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'feat: mixed code + docs');

  // Commit 3: the "fix" round — a fix that creates a new code file AND (incidentally,
  // or as part of documenting the fix) a new doc file. This is the mid-fix re-scope
  // fixture: the pipeline re-invokes `scopeDiff(repo, base, 'HEAD')` after such a
  // commit lands, and 'HEAD' now resolves here.
  writeFileSync(join(repo, 'src/bar.ts'), 'export const bar = 2;\n');
  writeFileSync(join(repo, 'docs/NOTES.md'), '# fix notes\n');
  g('add', '-A');
  g('commit', '-q', '--no-gpg-sign', '-m', 'fix: bar.ts + fix notes');

  return { repo, base };
}

function makeRuntime(repo: string, base: string) {
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
    laneCapabilities: [viableLane()],
    requireModels: 1,
    envelope: 100_000,
    planContext: 'ctx',
    base,
    head: 'HEAD',
    stderr: () => {},
  });
}

describe('034 T007 — code-scope filter applied at the runtime scopeDiff seam (FR-002/FR-003)', () => {
  it('initial scope: keeps code + SKILL.md, drops docs/PRD.md and README.md', () => {
    const { repo, base } = gitRepoWithMixedCommits();
    try {
      const runtime = makeRuntime(repo, base);
      // Scope ONLY over commit 2 (base..commit2) so this assertion is about the
      // INITIAL scope, independent of the later fix commit.
      const commit2 = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' }).stdout.trim();
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      expect(scope.files, 'code survives the default code-only policy').toContain('src/foo.ts');
      expect(scope.files, 'SKILL.md is runtime-defining markdown, re-included by default').toContain(
        'plugins/x/skills/y/SKILL.md',
      );
      expect(
        scope.files,
        'docs/PRD.md is documentation and must be dropped by the default code-only policy',
      ).not.toContain('docs/PRD.md');
      expect(
        scope.files,
        'root README.md is documentation and must be dropped by the default code-only policy',
      ).not.toContain('README.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('per-file diffs are preserved byte-for-byte for surviving files', () => {
    const { repo, base } = gitRepoWithMixedCommits();
    try {
      const runtime = makeRuntime(repo, base);
      const commit2 = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' }).stdout.trim();
      const scope = runtime.deps.scopeDiff(repo, base, commit2);

      // The expected diff text is whatever the underlying committed-diff scoping
      // produces for this file — the seam must not mutate a survivor's diff body.
      const expected = filterDiffScope(scopeCommittedDiff(repo, base, commit2), []);
      expect(scope.fileDiffs.get('src/foo.ts')).toBe(expected.fileDiffs.get('src/foo.ts'));
      expect(scope.fileDiffs.get('src/foo.ts')).toContain('export const foo = 1;');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('mid-fix re-scope inherits the SAME filter: a doc added by a fix does not leak into scope', () => {
    const { repo, base } = gitRepoWithMixedCommits();
    try {
      const runtime = makeRuntime(repo, base);
      // Re-invoke the SAME closure with the SAME symbolic head, mirroring the
      // pipeline's mid-fix re-scope call (end-govern-pipeline.ts:192) — 'HEAD' now
      // resolves to commit 3 (the fix commit), exactly as it would mid-loop after
      // a fix-fanout round lands a new commit.
      const rescoped = runtime.deps.scopeDiff(repo, base, 'HEAD');

      expect(rescoped.files, 'the fix-created code file must be re-scoped in').toContain('src/bar.ts');
      expect(rescoped.files, 'earlier code stays in scope across the re-scope').toContain('src/foo.ts');
      expect(
        rescoped.files,
        'a doc file introduced by the FIX round must be dropped too — docs introduced by a fix ' +
          'do not leak into a later audit round',
      ).not.toContain('docs/NOTES.md');
      expect(rescoped.files, 'the earlier doc stays dropped across the re-scope').not.toContain('docs/PRD.md');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
