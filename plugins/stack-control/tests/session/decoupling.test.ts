// 011 T024 (RED-first) — the #122 decoupling: both verbs read/write every working
// file at its CONFIGURED location (no hardcoded path/branch/slug), and fail loud
// outside any installation with NO bundled-copy fallback (FR-012/FR-014/SC-003/
// SC-004). US3.

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

# RM

## impl:feature/custom-located
- status: planned
`;

const JOURNAL = `# Journal

---

## 2026-06-10: a custom-located entry
body
`;

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An installation whose working files live at NON-default configured locations. */
function mkCustomInstallation(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-decouple-'));
  made.push(dir);
  mkdirSync(join(dir, '.stack-control'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, '.stack-control', 'config.yaml'),
    'version: 1\npaths:\n  roadmap: docs/RM.md\n  journal: docs/J.md\n  clone_scope: src\n',
  );
  writeFileSync(join(dir, 'docs', 'RM.md'), ROADMAP);
  writeFileSync(join(dir, 'docs', 'J.md'), JOURNAL);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.t');
  git(dir, 'config', 'user.name', 'T');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  return dir;
}

describe('decoupling — configured locations honored', () => {
  it('session-start reads roadmap + journal at their configured (non-default) paths', () => {
    const dir = mkCustomInstallation();
    const r = runCli(['session-start'], { cwd: dir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/custom-located'); // custom roadmap
    expect(r.stdout).toContain('a custom-located entry'); // custom journal
  });

  it('session-end appends the journal entry at the configured (non-default) path', () => {
    const dir = mkCustomInstallation();
    const before = readFileSync(join(dir, 'docs', 'J.md'), 'utf8');
    const r = runCli(['session-end', '--no-push'], { cwd: dir });
    expect(r.status).toBe(0);
    const after = readFileSync(join(dir, 'docs', 'J.md'), 'utf8');
    expect(after.length).toBeGreaterThan(before.length);
    // default-location journal was NOT created
    expect(() => readFileSync(join(dir, 'DEVELOPMENT-NOTES.md'), 'utf8')).toThrow();
  });
});

describe('decoupling — fail loud outside any installation (no bundled fallback)', () => {
  it('session-start outside an installation exits 1 and emits no report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-noinst-'));
    made.push(dir);
    const r = runCli(['session-start'], { cwd: dir });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/stackctl setup/);
    expect(r.stdout).not.toMatch(/Roadmap:/); // no fabricated/bundled report
  });
});
