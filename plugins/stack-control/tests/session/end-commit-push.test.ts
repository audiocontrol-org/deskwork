// 011 T017 (RED-first) — session-end commits the doc changes AND pushes them
// (an unpushed record is lost on container reclaim — pushing is the final mile,
// FR-010). Warns (not blocks) on uncommitted non-doc changes (FR-011). A push
// failure surfaces as exit 3 with the record committed locally (FR-010). Driven
// end-to-end via the dispatcher against a real bare remote. US2.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const ROADMAP = `---
doc-grammar: roadmap
---

# Roadmap

## impl:feature/x
- status: planned
`;

interface Setup {
  repo: string;
  bare: string;
}

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(withRemote = true): Setup {
  const repo = mkdtempSync(join(tmpdir(), 'sc-end-'));
  made.push(repo);
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n');
  writeFileSync(join(repo, 'ROADMAP.md'), ROADMAP);
  writeFileSync(join(repo, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@t.t');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'initial');

  const bare = mkdtempSync(join(tmpdir(), 'sc-bare-'));
  made.push(bare);
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  if (withRemote) {
    git(repo, 'remote', 'add', 'origin', bare);
    git(repo, 'push', '-q', '-u', 'origin', 'main');
  }
  return { repo, bare };
}

describe('session-end — commit + push', () => {
  it('appends the journal entry, commits doc-only, and pushes to the bare remote', () => {
    const { repo } = setup();
    // a session commit, so there is work to record
    writeFileSync(join(repo, 'work.txt'), 'work\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'feat: did work');

    const r = runCli(['session-end'], { cwd: repo });
    expect(r.status).toBe(0);

    // journal entry appended at the configured path
    const journal = readFileSync(join(repo, 'DEVELOPMENT-NOTES.md'), 'utf8');
    expect(journal).toMatch(/## /);
    // committed AND pushed: origin/main now equals HEAD
    expect(git(repo, 'rev-parse', 'origin/main')).toBe(git(repo, 'rev-parse', 'HEAD'));
    // the doc commit's subject is doc-scoped
    expect(git(repo, 'log', '-1', '--format=%s')).toMatch(/session-end|journal|docs/i);
  });

  it('warns (does not block) on uncommitted non-doc changes and does not commit them', () => {
    const { repo } = setup();
    writeFileSync(join(repo, 'dirty.txt'), 'uncommitted non-doc\n'); // not staged/committed

    const r = runCli(['session-end'], { cwd: repo });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/uncommitted|non-doc|warn/i);
    // the non-doc file is NOT in the session-end commit
    expect(git(repo, 'log', '-1', '--name-only', '--format=')).not.toContain('dirty.txt');
  });

  it('exits 3 when the push fails, leaving the record committed locally (FR-010)', () => {
    const { repo } = setup(false);
    git(repo, 'remote', 'add', 'origin', join(repo, 'no-such-remote.git')); // bad remote
    git(repo, 'config', 'branch.main.remote', 'origin');
    git(repo, 'config', 'branch.main.merge', 'refs/heads/main');

    const before = git(repo, 'rev-parse', 'HEAD');
    const r = runCli(['session-end'], { cwd: repo });
    expect(r.status).toBe(3);
    // record is committed locally despite the push failure
    expect(git(repo, 'rev-parse', 'HEAD')).not.toBe(before);
    expect(readFileSync(join(repo, 'DEVELOPMENT-NOTES.md'), 'utf8')).toMatch(/## /);
  });

  it('--no-push commits but does not push', () => {
    const { repo } = setup();
    const remoteBefore = git(repo, 'rev-parse', 'origin/main');
    const r = runCli(['session-end', '--no-push'], { cwd: repo });
    expect(r.status).toBe(0);
    // local advanced, remote unchanged
    expect(git(repo, 'rev-parse', 'origin/main')).toBe(remoteBefore);
    expect(git(repo, 'rev-parse', 'HEAD')).not.toBe(remoteBefore);
  });

  it('commits the doc without a spurious non-doc warning when the installation root is a SUBDIR of the git repo (H1)', () => {
    // git repo at <repo>; installation nested at <repo>/proj.
    const repo = mkdtempSync(join(tmpdir(), 'sc-nested-'));
    made.push(repo);
    const proj = join(repo, 'proj');
    mkdirSync(join(proj, '.stack-control'), { recursive: true });
    writeFileSync(join(proj, '.stack-control', 'config.yaml'), 'version: 1\n');
    writeFileSync(join(proj, 'ROADMAP.md'), ROADMAP);
    writeFileSync(join(proj, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 't@t.t');
    git(repo, 'config', 'user.name', 'T');
    git(repo, 'config', 'commit.gpgsign', 'false');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'initial');

    const r = runCli(['session-end', '--no-push'], { cwd: proj });
    expect(r.status).toBe(0);
    // the journal IS committed at its nested path
    expect(git(repo, 'log', '-1', '--name-only', '--format=')).toContain('proj/DEVELOPMENT-NOTES.md');
    // and it is NOT falsely flagged as an uncommitted non-doc change
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/DEVELOPMENT-NOTES\.md.*non-doc|non-doc.*DEVELOPMENT-NOTES\.md/);
  });

  it('fails loud (exit 1) outside any installation', () => {
    const bare = mkdtempSync(join(tmpdir(), 'sc-noinst-'));
    made.push(bare);
    git(bare, 'init', '-q', '-b', 'main');
    const r = runCli(['session-end'], { cwd: bare });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/stackctl setup/);
  });
});
