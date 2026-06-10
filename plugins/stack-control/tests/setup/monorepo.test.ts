// 009 T026 (RED-first, US4) — one repo, multiple isolated installations: two
// installations at distinct subtrees operate in isolation; re-setup of one leaves
// the other unchanged; a verb in a subdir resolves nearest-wins; a configured
// location that escapes the root OR reaches into a nested child installation is
// refused (SC-008, FR-021/022/023/024, quickstart Scenarios 4 + 7).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function freshProject(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'sc-mono-')));
}
function sha(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}
function configAt(dir: string, body: string): void {
  mkdirSync(join(dir, '.stack-control'), { recursive: true });
  writeFileSync(join(dir, '.stack-control', 'config.yaml'), body);
}

describe('setup monorepo isolation (US4)', () => {
  it('two installations are isolated — a capture in one reaches none of the other', () => {
    const mono = freshProject();
    const a = join(mono, 'pkgA');
    const b = join(mono, 'pkgB');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    expect(runCli(['setup', '--at', a, '--apply'], { cwd: mono }).status).toBe(0);
    expect(runCli(['setup', '--at', b, '--apply'], { cwd: mono }).status).toBe(0);

    expect(runCli(['inbox', 'capture', 'A-only', '--idea', 'x', '--apply'], { cwd: a }).status).toBe(0);
    expect(readFileSync(join(a, 'DESIGN-INBOX.md'), 'utf8')).toContain('A-only');
    expect(readFileSync(join(b, 'DESIGN-INBOX.md'), 'utf8')).not.toContain('A-only');
  });

  it('re-setup of one installation leaves the other hash-unchanged', () => {
    const mono = freshProject();
    const a = join(mono, 'pkgA');
    const b = join(mono, 'pkgB');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    runCli(['setup', '--at', a, '--apply'], { cwd: mono });
    runCli(['setup', '--at', b, '--apply'], { cwd: mono });
    runCli(['inbox', 'capture', 'B-content', '--idea', 'y', '--apply'], { cwd: b });
    const bBefore = sha(join(b, 'DESIGN-INBOX.md'));

    expect(runCli(['setup', '--at', a, '--apply'], { cwd: mono }).status).toBe(0);
    expect(sha(join(b, 'DESIGN-INBOX.md'))).toBe(bBefore);
  });

  it('a verb in a subdirectory resolves the nearest enclosing installation', () => {
    const mono = freshProject();
    const a = join(mono, 'pkgA');
    mkdirSync(a, { recursive: true });
    runCli(['setup', '--at', a, '--apply'], { cwd: mono });
    const sub = join(a, 'src', 'deep');
    mkdirSync(sub, { recursive: true });
    const r = runCli(['inbox', 'list'], { cwd: sub });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/0 entr/);
  });

  it('refuses a configured location that escapes the installation root', () => {
    const proj = freshProject();
    configAt(proj, 'version: 1\npaths:\n  roadmap: "../escape/ROADMAP.md"\n');
    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/escape/i);
  });

  it('explicit --at into a subdir of an existing installation creates a NEW child there, not the parent', () => {
    // Parent IS an installation.
    const parent = freshProject();
    expect(runCli(['setup', '--at', parent, '--apply'], { cwd: parent }).status).toBe(0);
    expect(existsSync(join(parent, '.stack-control', 'config.yaml'))).toBe(true);

    // Explicit --at into a child subdir, cwd = parent. The named target is
    // authoritative: a fresh child installation is created at parent/child,
    // NOT operating on the enclosing parent (AUDIT-20260610-01).
    const child = join(parent, 'child');
    mkdirSync(child, { recursive: true });
    const r = runCli(['setup', '--at', child, '--apply'], { cwd: parent });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(child);

    // Child has its OWN installation + working files.
    expect(existsSync(join(child, '.stack-control', 'config.yaml'))).toBe(true);
    expect(existsSync(join(child, 'ROADMAP.md'))).toBe(true);
    expect(existsSync(join(child, 'DESIGN-INBOX.md'))).toBe(true);

    // Isolation: a capture in the child reaches the child's inbox, not the parent's.
    expect(runCli(['inbox', 'capture', 'child-only', '--idea', 'z', '--apply'], { cwd: child }).status).toBe(0);
    expect(readFileSync(join(child, 'DESIGN-INBOX.md'), 'utf8')).toContain('child-only');
    expect(readFileSync(join(parent, 'DESIGN-INBOX.md'), 'utf8')).not.toContain('child-only');

    // A verb run in the child then resolves the child (nearest-wins), not the parent.
    const list = runCli(['inbox', 'list'], { cwd: child });
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('child-only');
  });

  it('refuses a parent location that reaches into a nested child installation', () => {
    const parent = freshProject();
    const child = join(parent, 'pkg');
    mkdirSync(child, { recursive: true });
    configAt(child, 'version: 1\n');
    expect(runCli(['setup', '--at', child, '--apply'], { cwd: child }).status).toBe(0);

    // parent configures a location INTO the child's subtree → refuse (FR-024 / D10)
    configAt(parent, 'version: 1\npaths:\n  roadmap: "pkg/ROADMAP.md"\n');
    const r = runCli(['setup', '--at', parent, '--apply'], { cwd: parent });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/nested|installation|collision/i);
  });
});
