// 030 T021 (RED first) — FR-023: inclusion-based committed-diff scoping (the
// successor to the deleted exclusion plumbing). scopeCommittedDiff resolves the
// base..HEAD changed-file set with per-file diffs (non-empty for a real
// committed diff) and folds untracked working-tree files into scope. On-disk git
// fixtures only (real git init/commits), per .claude/rules/testing.md. Watched to
// FAIL while scopeCommittedDiff is a 'not implemented' stub (T021 impl makes it
// pass).

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scopeCommittedDiff } from '../../govern/payload-diff-scope.js';

function git(repo: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return typeof r.stdout === 'string' ? r.stdout.trim() : '';
}
function commitAll(repo: string, message: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync(
    'git',
    ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-gpg-sign', '-m', message],
    { encoding: 'utf8' },
  );
}
function head(repo: string): string {
  return git(repo, 'rev-parse', 'HEAD');
}
function setup(): string {
  const repo = mkdtempSync(join(tmpdir(), 'diff-scope-'));
  git(repo, 'init', '-q');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'README.md'), 'seed\n');
  commitAll(repo, 'chore: seed');
  return repo;
}

describe('030 T021 — payload-diff-scope (FR-023)', () => {
  it('scopes the committed base..HEAD diff to a non-empty file set with per-file diffs', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/app.ts'), 'export const x = 1;\n');
    commitAll(repo, 'feat: add app');
    const h = head(repo);
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      expect(scope.files).toContain('src/app.ts');
      expect(scope.files.length).toBeGreaterThan(0);
      expect(scope.fileDiffs.get('src/app.ts') ?? '').toMatch(/export const x = 1/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('folds an untracked working-tree file into the scope', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/committed.ts'), 'a\n');
    commitAll(repo, 'feat: committed');
    const h = head(repo);
    writeFileSync(join(repo, 'src/untracked.ts'), 'b\n'); // not committed
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      expect(scope.files).toContain('src/committed.ts');
      expect(scope.files).toContain('src/untracked.ts');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // 030 T075 (FR-030, US9) — the untracked-fold must render a STANDARD unified
  // diff (the `git diff --no-index` format the rest of the render arm produces),
  // NOT a hand-synthesized `+`-line-only blob. Today the fold prefixes every
  // content line with `+` and emits NO `diff --git`/`---`/`+++`/`@@` hunk headers,
  // so the folded untracked diff is not a real diff the partitioner/barrage can
  // treat uniformly with the committed-diff arm. This asserts the standard-diff
  // shape (a `@@` hunk header and a `+++ ` file header), which FAILS today.
  it('T075 (FR-030) renders an untracked file as a STANDARD git-diff --no-index unified diff, not a synthetic +-line blob', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/committed.ts'), 'a\n');
    commitAll(repo, 'feat: committed');
    const h = head(repo);
    writeFileSync(join(repo, 'src/untracked.ts'), 'line one\nline two\n'); // not committed
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      const folded = scope.fileDiffs.get('src/untracked.ts') ?? '';
      // The folded untracked diff is a standard unified diff: it carries an `@@`
      // hunk header and a `+++ ` file header (as `git diff --no-index` produces),
      // NOT merely every content line prefixed with `+` and no hunk structure.
      expect(folded, 'untracked fold must contain a @@ hunk header').toMatch(/^@@ .* @@/m);
      expect(folded, 'untracked fold must contain a +++ file header').toMatch(/^\+\+\+ /m);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // Regression: the installation root is a SUBDIR of the git root (the monorepo
  // layout — `.stack-control` lives at plugins/stack-control while the git root is
  // the repo above). `git diff --name-only` emits git-root-relative paths; running
  // the per-file `git diff -- <path>` from the installation subdir resolves the
  // pathspec relative to the subdir and matches NOTHING, yielding empty per-file
  // diffs (~0 bytes) — which silently defeats the chunk partitioner (it measures
  // ~0 bytes, never chunks, and fires a whole over-envelope payload as one barrage).
  it('resolves real per-file diffs when the installation root is a SUBDIR of the git root', () => {
    const repo = setup(); // git root
    const install = join(repo, 'plugins', 'sc'); // installation root (a subdir)
    mkdirSync(join(install, 'src'), { recursive: true });
    const base = head(repo);
    writeFileSync(join(install, 'src/app.ts'), 'export const sub = 1;\n');
    commitAll(repo, 'feat: add app under subdir installation');
    const h = head(repo);
    try {
      const scope = scopeCommittedDiff(install, base, h);
      // The changed file is present and its per-file diff is NON-EMPTY (the bug
      // returned ~0 bytes here). Path base is installation-relative (`--relative`),
      // byte-identical to the render's committed-diff arm.
      const total = [...scope.fileDiffs.values()].reduce((n, d) => n + d.length, 0);
      expect(total).toBeGreaterThan(0);
      const appEntry = [...scope.fileDiffs.entries()].find(([f]) => f.endsWith('src/app.ts'));
      expect(appEntry, 'the committed app.ts must be in scope').toBeDefined();
      expect(appEntry?.[1] ?? '').toMatch(/export const sub = 1/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // Regression: a committed file whose name contains a non-ASCII character (e.g. the
  // em-dash in backlog task filenames). git's default `core.quotePath=true` C-quotes
  // such paths in `--name-only` output ("...\342\200\224...md"); that quoted string
  // does NOT resolve as a pathspec, so the per-file `git diff -- <quoted>` matches
  // nothing and the file lands in scope with an EMPTY diff. 160/255 files in this very
  // repo hit this — silently starving the partition of most of the diff's bytes.
  it('resolves a real per-file diff for a committed file with a non-ASCII (em-dash) name', () => {
    const repo = setup();
    const base = head(repo);
    const name = 'src/task — em-dash.md'; // U+2014 EM DASH in the filename
    writeFileSync(join(repo, name), 'body line one\n');
    commitAll(repo, 'docs: add em-dash named file');
    const h = head(repo);
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      const entry = [...scope.fileDiffs.entries()].find(([f]) => f.includes('em-dash'));
      expect(entry, 'the em-dash file must be in scope').toBeDefined();
      // Path is the literal UTF-8 name, NOT a git-C-quoted string.
      expect(entry?.[0] ?? '').not.toMatch(/\\\d{3}/); // no octal \342 etc.
      expect(entry?.[1] ?? '').toMatch(/body line one/); // per-file diff is non-empty
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
