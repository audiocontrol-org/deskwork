// T032 (RED-first, US4, 006) — `roadmap blocks <id>` / `order` / `graph` are
// read-only query subactions (contracts/roadmap-cli.md).

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { fixturePath } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'verb-q-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('stackctl roadmap query verbs (T032)', () => {
  it('blocks <id> lists items that depend on it', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'blocks', 'design:feature/a', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/b');
    expect(r.stdout).not.toContain('impl:feature/c');
  });

  it('blocks with no <id> → exit 2', () => {
    const docPath = tmpCopy('chain');
    expect(runCli(['roadmap', 'blocks', '--doc', docPath]).status).toBe(2);
  });

  it('order emits a dependency-respecting order', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'order', '--doc', docPath]);
    expect(r.status).toBe(0);
    const out = r.stdout;
    expect(out.indexOf('design:feature/a')).toBeLessThan(out.indexOf('impl:feature/b'));
    expect(out.indexOf('impl:feature/b')).toBeLessThan(out.indexOf('impl:feature/c'));
  });

  it('graph emits a mermaid flowchart; writes nothing', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'graph', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^flowchart/m);
    expect(r.stdout).toMatch(/-->/);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
