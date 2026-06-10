// 009 T024 (RED-first, US3) — configurable locations: a custom per-file location
// is honored + recorded; an unset key falls back to the audience-split default;
// an existing file at a non-default location is recorded, not duplicated
// (SC-007, FR-018/019/020, quickstart Scenario 3).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function freshProject(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'sc-cfg-')));
}
function sha(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}
function withConfig(proj: string, body: string): void {
  mkdirSync(join(proj, '.stack-control'), { recursive: true });
  writeFileSync(join(proj, '.stack-control', 'config.yaml'), body);
}

describe('setup configurable locations (US3)', () => {
  it('a custom per-file location is honored, reported, and resolved by verbs', () => {
    const proj = freshProject();
    withConfig(proj, 'version: 1\npaths:\n  roadmap: "docs/ROADMAP.md"\n  inbox: "notes/DESIGN-INBOX.md"\n');
    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(existsSync(join(proj, 'docs', 'ROADMAP.md'))).toBe(true);
    expect(existsSync(join(proj, 'notes', 'DESIGN-INBOX.md'))).toBe(true);
    expect(existsSync(join(proj, 'ROADMAP.md'))).toBe(false); // not at the default
    expect(r.stdout).toMatch(/docs\/ROADMAP\.md/);
    expect(runCli(['roadmap', 'next'], { cwd: proj }).status).toBe(0);
  });

  it('an unset key falls back to the audience-split default (reported)', () => {
    const proj = freshProject();
    withConfig(proj, 'version: 1\npaths:\n  roadmap: "docs/ROADMAP.md"\n');
    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(existsSync(join(proj, 'DESIGN-INBOX.md'))).toBe(true); // default at root
    expect(r.stdout).toMatch(/DESIGN-INBOX\.md/);
  });

  it('an existing file at a non-default location is recorded, not duplicated', () => {
    const proj = freshProject();
    mkdirSync(join(proj, 'docs'), { recursive: true });
    withConfig(proj, 'version: 1\npaths:\n  roadmap: "docs/ROADMAP.md"\n');
    writeFileSync(join(proj, 'docs', 'ROADMAP.md'), '---\ndoc-grammar: roadmap\n---\n\n# Roadmap\n\nkeep.\n');
    const before = sha(join(proj, 'docs', 'ROADMAP.md'));

    const r = runCli(['setup', '--apply'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(existsSync(join(proj, 'ROADMAP.md'))).toBe(false); // no duplicate at default
    expect(sha(join(proj, 'docs', 'ROADMAP.md'))).toBe(before);
    expect(r.stdout).toMatch(/already-present[^\n]*roadmap/);
  });
});
