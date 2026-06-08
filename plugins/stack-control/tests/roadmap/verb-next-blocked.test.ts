// T020 (RED-first, US1, 006) — the `roadmap` verb emits `next` (ready-list) and
// `blocked` (blockers named); both are read-only (no writes). Per
// contracts/roadmap-cli.md exit codes (parse/validation failure → 2).

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { fixturePath } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'verb-roadmap-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('stackctl roadmap next/blocked verb (T020)', () => {
  it('missing subaction → exit 2', () => {
    expect(runCli(['roadmap']).status).toBe(2);
  });

  it('next lists the ready item and not the blocked one; writes nothing', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'next', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/b');
    expect(r.stdout).not.toContain('impl:feature/c');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('blocked names the blocked item and its non-shipped dependency', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'blocked', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/c');
    expect(r.stdout).toContain('impl:feature/b');
    expect(r.stdout).toContain('planned');
  });

  it('blocked surfaces a deferred-until condition', () => {
    const docPath = tmpCopy('deferred');
    const r = runCli(['roadmap', 'blocked', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/b');
    expect(r.stdout).toMatch(/defer/i);
    expect(r.stdout).toContain('after the migration milestone closes');
  });

  it('a cyclic document fails loud → exit 2, writes nothing', () => {
    const docPath = tmpCopy('cycle');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'next', '--doc', docPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/cycle/i);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('unknown subaction → exit 2', () => {
    const docPath = tmpCopy('chain');
    expect(runCli(['roadmap', 'frobnicate', '--doc', docPath]).status).toBe(2);
  });
});
