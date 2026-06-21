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
});
