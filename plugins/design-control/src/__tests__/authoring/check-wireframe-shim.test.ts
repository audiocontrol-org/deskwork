/**
 * Repo-root smoke for `bin/check-wireframe` (AUDIT round-3 claude-01 sibling).
 *
 * Same defect class as bin/check-design-spec: tsx resolves the `@/*` alias
 * from the cwd's tsconfig, so the documented repo-root invocation crashed with
 * ERR_MODULE_NOT_FOUND (exit 1 — aliasing the findings exit code). This smoke
 * spawns the real shim with cwd = repo root against a real-fs temp fixture
 * seeded with the genuine kit CSS, pinning the green path end-to-end.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SKETCH_KIT_CSS_PATH } from '@/wireframe-kit/sketch-kit';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(testDir, '..', '..', '..');
const repoRoot = resolve(pluginRoot, '..', '..');
const shim = join(pluginRoot, 'bin', 'check-wireframe');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const cleanPage =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
  '<h1>Entry list</h1></body></html>';

describe('bin/check-wireframe — documented repo-root invocation', () => {
  it('exits 0 with the lint-green line on a clean wireframe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-wireframe-shim-'));
    dirs.push(dir);
    copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
    const file = join(dir, 'change.html');
    writeFileSync(file, cleanPage);
    const result = spawnSync(shim, [file], { cwd: repoRoot, encoding: 'utf8' });
    if (result.error) throw result.error;
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('lint green — 0 findings');
  }, 30_000);
});
