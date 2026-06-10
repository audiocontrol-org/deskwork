// 009 T009 (RED-first, US1) — fresh-adopter setup: `stackctl setup --apply`
// scaffolds config + roadmap + inbox + backlog + program audit log, all
// parser-valid; the report lists created items + locations; every consuming verb
// then resolves the project-local file with NO --doc (read-side wiring, FR-003).
// (quickstart Scenario 1; SC-001/SC-004.)

import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function freshProject(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'sc-fresh-')));
}

describe('stackctl setup — fresh project (US1)', () => {
  it('--apply scaffolds the full managed set, parser-valid, ready, with a located report', () => {
    const proj = freshProject();
    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(existsSync(join(proj, '.stack-control', 'config.yaml'))).toBe(true);
    expect(existsSync(join(proj, 'ROADMAP.md'))).toBe(true);
    expect(existsSync(join(proj, 'DESIGN-INBOX.md'))).toBe(true);
    expect(existsSync(join(proj, '.stack-control', 'backlog', 'config.yml'))).toBe(true);
    expect(existsSync(join(proj, '.stack-control', 'audit-log.md'))).toBe(true);
    expect(r.stdout).toMatch(/created/i);
    expect(r.stdout).toContain('ROADMAP.md');
    expect(r.stdout).toMatch(/ready/i);
  });

  it('verbs resolve the project-local files with no --doc (read-side wiring)', () => {
    const proj = freshProject();
    expect(runCli(['setup', '--apply'], { cwd: proj }).status).toBe(0);

    const next = runCli(['roadmap', 'next'], { cwd: proj });
    expect(next.status).toBe(0);

    const inbox = runCli(['inbox', 'list'], { cwd: proj });
    expect(inbox.status).toBe(0);
    expect(inbox.stdout).toMatch(/0 entr/);

    const bl = runCli(['backlog', 'list'], { cwd: proj });
    expect(bl.status).toBe(0);
  });

  it('a verb run from a subdirectory resolves the enclosing installation (nearest-wins)', () => {
    const proj = freshProject();
    expect(runCli(['setup', '--apply'], { cwd: proj }).status).toBe(0);
    const sub = join(proj, 'a', 'b');
    mkdirSync(sub, { recursive: true });
    const inbox = runCli(['inbox', 'list'], { cwd: sub });
    expect(inbox.status).toBe(0);
    expect(inbox.stdout).toMatch(/0 entr/);
  });

  it('dry-run (no --apply) writes nothing and reports the plan', () => {
    const proj = freshProject();
    const r = runCli(['setup'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(existsSync(join(proj, '.stack-control', 'config.yaml'))).toBe(false);
    expect(existsSync(join(proj, 'ROADMAP.md'))).toBe(false);
    expect(r.stdout).toMatch(/dry|would/i);
  });

  it('unknown flag / stray positional → exit 2', () => {
    const proj = freshProject();
    expect(runCli(['setup', '--bogus'], { cwd: proj }).status).toBe(2);
    expect(runCli(['setup', 'stray'], { cwd: proj }).status).toBe(2);
  });
});
