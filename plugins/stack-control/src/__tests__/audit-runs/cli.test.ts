// TASK-425 — `stackctl audit-runs <list|prune>` end-to-end over a tmp installation
// with real run dirs on disk (never mock the filesystem — .claude/rules/testing.md).

import { afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** A tmp installation with `.stack-control/config.yaml` + the given run-dir names. */
function installWithRuns(runNames: readonly string[]): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sc-auditruns-')));
  dirs.push(root);
  mkdirSync(join(root, '.stack-control'), { recursive: true });
  writeFileSync(join(root, '.stack-control', 'config.yaml'), 'version: 1\n');
  const runsDir = join(root, '.stack-control', 'audit-runs');
  for (const name of runNames) {
    mkdirSync(join(runsDir, name), { recursive: true });
    writeFileSync(join(runsDir, name, 'INDEX.md'), '# run\n');
  }
  return root;
}

function runDir(iso: string): string {
  const d = iso.replace(/-/g, '').replace(/:/g, '').replace('.', '');
  return `${d.slice(0, 8)}T${d.slice(9, 15)}${d.slice(15, 18)}Z-feat`;
}

const A = runDir('2026-06-22T03:00:00.000Z');
const B = runDir('2026-06-21T03:00:00.000Z');
const C = runDir('2026-06-20T03:00:00.000Z');

describe('audit-runs list', () => {
  it('reports the run-dir count, newest first', () => {
    const root = installWithRuns([C, A, B]);
    const r = runCli(['audit-runs', 'list', '--at', root]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('3 run dirs');
    // Newest (A) is listed before oldest (C).
    expect(r.stdout.indexOf(A)).toBeLessThan(r.stdout.indexOf(C));
  });

  it('reports 0 run dirs when the audit-runs dir is absent', () => {
    const root = installWithRuns([]);
    const r = runCli(['audit-runs', 'list', '--at', root]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 run dirs');
  });
});

describe('audit-runs prune --keep-last', () => {
  it('dry-run names the would-prune dirs and deletes nothing', () => {
    const root = installWithRuns([A, B, C]);
    const r = runCli(['audit-runs', 'prune', '--keep-last', '1', '--at', root]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('would prune 2 run dir(s)');
    // All three still on disk after a dry-run.
    for (const n of [A, B, C]) {
      expect(existsSync(join(root, '.stack-control', 'audit-runs', n))).toBe(true);
    }
  });

  it('--apply deletes all but the N newest', () => {
    const root = installWithRuns([A, B, C]);
    const r = runCli(['audit-runs', 'prune', '--keep-last', '1', '--apply', '--at', root]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('pruned 2 run dir(s)');
    const runsDir = join(root, '.stack-control', 'audit-runs');
    expect(existsSync(join(runsDir, A))).toBe(true); // newest kept
    expect(existsSync(join(runsDir, B))).toBe(false);
    expect(existsSync(join(runsDir, C))).toBe(false);
  });
});

describe('audit-runs prune — usage', () => {
  it('refuses both --keep-last and --older-than-days (exit 2)', () => {
    const root = installWithRuns([A]);
    const r = runCli(['audit-runs', 'prune', '--keep-last', '1', '--older-than-days', '3', '--at', root]);
    expect(r.status).toBe(2);
  });

  it('refuses neither retention flag (exit 2)', () => {
    const root = installWithRuns([A]);
    const r = runCli(['audit-runs', 'prune', '--at', root]);
    expect(r.status).toBe(2);
  });

  it('a foreign directory is never a prune candidate', () => {
    const root = installWithRuns([A]);
    mkdirSync(join(root, '.stack-control', 'audit-runs', 'not-a-run-dir'), { recursive: true });
    const r = runCli(['audit-runs', 'prune', '--keep-last', '0', '--apply', '--at', root]);
    expect(r.status).toBe(0);
    // The valid run dir is gone; the foreign dir survives untouched.
    expect(existsSync(join(root, '.stack-control', 'audit-runs', A))).toBe(false);
    expect(existsSync(join(root, '.stack-control', 'audit-runs', 'not-a-run-dir'))).toBe(true);
  });
});
