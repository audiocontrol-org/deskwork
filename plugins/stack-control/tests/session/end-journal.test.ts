// 011 T015 (RED-first) — journal entry assembly: auto-derive the mechanical /
// quantitative sections (commit count + subjects, files-changed, backlog items
// touched) from `git log <boundary>..HEAD`, and emit EMPTY narrative slots for
// the agent to compose (FR-006, research D5). An honest sparse entry is still
// produced on a no-op session. Follows a configured template, else the default
// (FR-013). US2.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildJournalEntry } from '../../src/session/journal.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
function commit(cwd: string, file: string, msg: string): void {
  writeFileSync(join(cwd, file), `${msg}\n`);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', msg);
}
function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-journal-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.t');
  git(dir, 'config', 'user.name', 'T');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('buildJournalEntry', () => {
  it('auto-derives mechanical sections + empty narrative slots from the commit range', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'base'); // boundary
    const boundary = git(dir, 'rev-parse', 'HEAD');
    commit(dir, 'b.txt', 'feat: thing one (TASK-1)');
    commit(dir, 'c.txt', 'fix: thing two');

    const entry = buildJournalEntry({
      cwd: dir,
      boundary,
      backlogTouched: [{ id: 'TASK-1', title: 'thing one' }],
      date: '2026-06-10',
    });

    // mechanical (auto-derived, never fabricated)
    expect(entry).toContain('2026-06-10');
    expect(entry).toMatch(/Commits.*2/s);
    expect(entry).toContain('feat: thing one (TASK-1)');
    expect(entry).toContain('fix: thing two');
    expect(entry).toMatch(/Files changed.*2/s);
    expect(entry).toContain('TASK-1');
    // narrative slots present but left for the agent (empty)
    expect(entry).toMatch(/Goal/);
    expect(entry).toMatch(/Accomplished/);
    expect(entry).toMatch(/Insights/);
  });

  it('writes an honest sparse entry on a no-op session (0 commits)', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'base');
    const boundary = git(dir, 'rev-parse', 'HEAD'); // boundary == HEAD → empty range
    const entry = buildJournalEntry({ cwd: dir, boundary, backlogTouched: [], date: '2026-06-10' });
    expect(entry).toMatch(/Commits.*0/s);
    expect(entry).toMatch(/Goal/); // structure still present
    expect(entry.length).toBeGreaterThan(0);
  });

  it('uses a provided template (placeholder substitution) over the default', () => {
    dir = initRepo();
    commit(dir, 'a.txt', 'base');
    const boundary = git(dir, 'rev-parse', 'HEAD');
    commit(dir, 'b.txt', 'only commit');
    const entry = buildJournalEntry({
      cwd: dir,
      boundary,
      backlogTouched: [],
      date: '2026-06-10',
      template: '## {date}\nCOMMITS={commit_count}\nFILES={files_changed}\n',
    });
    expect(entry).toContain('## 2026-06-10');
    expect(entry).toContain('COMMITS=1');
    expect(entry).toContain('FILES=1');
  });
});
