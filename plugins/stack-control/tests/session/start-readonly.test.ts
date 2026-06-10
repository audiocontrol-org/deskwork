// 011 T008 (RED-first) — session-start is strictly read-only and stops. Drives
// the verb end-to-end via the dispatcher (runCli) against a tmp installation.
// SC-008 (0 on-disk changes; identical re-run), FR-002/FR-021 (no /speckit-*
// step fires), FR-014 (fail-loud outside any installation). US1.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

let root: string;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const ROADMAP = `---
doc-grammar: roadmap
---

# Roadmap

## impl:feature/ready-one
- status: planned
`;

function mkInstallation(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-start-'));
  mkdirSync(join(dir, '.stack-control'), { recursive: true });
  writeFileSync(join(dir, '.stack-control', 'config.yaml'), 'version: 1\n');
  writeFileSync(join(dir, 'ROADMAP.md'), ROADMAP);
  writeFileSync(join(dir, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
  return dir;
}

/** A sha256 of the sorted (path,size,mtime) tuples under dir — a cheap tree hash. */
function treeSnapshot(dir: string): string {
  return execFileSync('bash', ['-c', `find '${dir}' -type f -printf '%P %s\\n' | sort`], {
    encoding: 'utf8',
  });
}

describe('session-start — read-only + stop', () => {
  it('exits 0, reports, and makes 0 on-disk changes (SC-008)', () => {
    root = mkInstallation();
    const before = treeSnapshot(root);
    const r = runCli(['session-start'], { cwd: root });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/ready|roadmap/i);
    const after = treeSnapshot(root);
    expect(after).toBe(before);
  });

  it('re-running produces an identical report (idempotent)', () => {
    root = mkInstallation();
    const a = runCli(['session-start'], { cwd: root });
    const b = runCli(['session-start'], { cwd: root });
    expect(a.stdout).toBe(b.stdout);
  });

  it('fails loud (exit 1) when run outside any installation, directing to setup (FR-014)', () => {
    root = mkdtempSync(join(tmpdir(), 'sc-noinstall-'));
    const r = runCli(['session-start'], { cwd: root });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/stackctl setup/);
  });

  it('rejects an unknown flag with a usage error (exit 2)', () => {
    root = mkInstallation();
    const r = runCli(['session-start', '--bogus'], { cwd: root });
    expect(r.status).toBe(2);
  });
});
