// 011 T030 (RED-first) — CLI-first / surface-agnostic parity (SC-007): both verbs
// run to completion in a plain shell with NO Claude Code surface, producing the
// report / record; the skills are pure adapters that quote the verb and add no
// behavior the CLI lacks (FR-018/FR-019). US5.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../src/__tests__/_run-helpers.js';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const ROADMAP = `---
doc-grammar: roadmap
---

# RM

## impl:feature/x
- status: planned
`;

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function mkInstallation(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-clifirst-'));
  made.push(dir);
  mkdirSync(join(dir, '.stack-control'), { recursive: true });
  writeFileSync(join(dir, '.stack-control', 'config.yaml'), 'version: 1\n');
  writeFileSync(join(dir, 'ROADMAP.md'), ROADMAP);
  writeFileSync(join(dir, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.t');
  git(dir, 'config', 'user.name', 'T');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  return dir;
}

// A clean env with NO Claude Code surface markers — proves the verb needs none.
const PLAIN_ENV: Record<string, string> = { CLAUDE_CODE: '', CLAUDECODE: '', CLAUDE_PLUGIN_ROOT: '' };

describe('CLI-first parity (SC-007)', () => {
  it('session-start runs in a plain shell with no Claude Code surface', () => {
    const dir = mkInstallation();
    const r = runCli(['session-start'], { cwd: dir, env: PLAIN_ENV });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Roadmap:/);
  });

  it('session-end runs in a plain shell with no Claude Code surface', () => {
    const dir = mkInstallation();
    const r = runCli(['session-end', '--no-push'], { cwd: dir, env: PLAIN_ENV });
    expect(r.status).toBe(0);
    expect(readFileSync(join(dir, 'DEVELOPMENT-NOTES.md'), 'utf8')).toMatch(/## /);
  });

  it('both skills are thin adapters that quote the CLI verb (no behavior beyond it)', () => {
    for (const [skill, verb] of [
      ['session-start', 'session-start'],
      ['session-end', 'session-end'],
    ] as const) {
      const path = join(PLUGIN_ROOT, 'skills', skill, 'SKILL.md');
      expect(existsSync(path)).toBe(true);
      const body = readFileSync(path, 'utf8');
      expect(body).toContain(`stackctl ${verb}`);
      expect(body).toMatch(/CLI-first/);
    }
  });
});
