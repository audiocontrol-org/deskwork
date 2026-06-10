// 009 T028 (RED-first, US5) — setup proves usability: a present-but-malformed
// required file fails loud (exit 1), is named, ready=false, and is NOT overwritten
// (drift surfaced, FR-010); a malformed config itself fails loud; an all-valid
// project reports ready; drift is surfaced in dry-run too (SC-005, FR-009/010,
// quickstart Scenario 5).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function freshProject(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'sc-verify-')));
}
function sha(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}
function configAt(dir: string, body: string): void {
  mkdirSync(join(dir, '.stack-control'), { recursive: true });
  writeFileSync(join(dir, '.stack-control', 'config.yaml'), body);
}

describe('setup verify / fail-loud on drift (US5)', () => {
  it('a present-but-malformed required file → exit 1, named, ready=false, not overwritten', () => {
    const proj = freshProject();
    configAt(proj, 'version: 1\n');
    writeFileSync(join(proj, 'ROADMAP.md'), 'this is not a governed roadmap\n');
    const before = sha(join(proj, 'ROADMAP.md'));

    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/MALFORMED[^\n]*roadmap/);
    expect(r.stdout).toMatch(/ready: no/);
    expect(sha(join(proj, 'ROADMAP.md'))).toBe(before); // drift surfaced, not clobbered
  });

  it('surfaces drift in dry-run too (never a false-clean plan)', () => {
    const proj = freshProject();
    configAt(proj, 'version: 1\n');
    writeFileSync(join(proj, 'ROADMAP.md'), 'not governed\n');
    const r = runCli(['setup'], { cwd: proj }); // dry-run
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/ready: no/);
  });

  it('a malformed config itself fails loud (named)', () => {
    const proj = freshProject();
    configAt(proj, 'version: 0\n'); // invalid version
    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toMatch(/version/);
  });

  it('an all-valid project reports ready', () => {
    const proj = freshProject();
    expect(runCli(['setup', '--apply'], { cwd: proj }).status).toBe(0);
    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/ready: yes/);
  });
});
