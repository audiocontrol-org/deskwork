// 009 T022 (RED-first, US2) — non-destructive idempotent re-run: pre-existing
// content byte-for-byte unchanged (content hash); partial project completes only
// the missing items; a full re-run is a no-op; the report distinguishes created
// vs already-present (SC-002, FR-004/FR-005, quickstart Scenario 2).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function freshProject(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'sc-idem-')));
}
function sha(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

describe('setup idempotence + non-destructive (US2)', () => {
  it('a re-run leaves pre-existing real content byte-for-byte unchanged', () => {
    const proj = freshProject();
    expect(runCli(['setup', '--apply'], { cwd: proj }).status).toBe(0);
    expect(
      runCli(['inbox', 'capture', 'Keep me', '--idea', 'do not clobber', '--apply'], { cwd: proj }).status,
    ).toBe(0);
    const before = sha(join(proj, 'DESIGN-INBOX.md'));

    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(sha(join(proj, 'DESIGN-INBOX.md'))).toBe(before);
    expect(r.stdout).toMatch(/already-present/);
  });

  it('a partial project completes only the missing items, leaving the present one untouched', () => {
    const proj = freshProject();
    mkdirSync(join(proj, '.stack-control'), { recursive: true });
    writeFileSync(join(proj, '.stack-control', 'config.yaml'), 'version: 1\n');
    writeFileSync(join(proj, 'ROADMAP.md'), '---\ndoc-grammar: roadmap\n---\n\n# Roadmap\n\nkeep.\n');
    const roadmapBefore = sha(join(proj, 'ROADMAP.md'));

    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(existsSync(join(proj, 'DESIGN-INBOX.md'))).toBe(true);
    expect(existsSync(join(proj, '.stack-control', 'backlog', 'config.yml'))).toBe(true);
    expect(sha(join(proj, 'ROADMAP.md'))).toBe(roadmapBefore);
    expect(r.stdout).toMatch(/\[created\][^\n]*inbox/);
    expect(r.stdout).toMatch(/already-present[^\n]*roadmap/);
  });

  it('a full re-run is a no-op (all already-present, nothing created)', () => {
    const proj = freshProject();
    expect(runCli(['setup', '--apply'], { cwd: proj }).status).toBe(0);
    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/\[created\]/);
    expect(r.stdout).toMatch(/already-present/);
  });
});
