/**
 * Repo-root smoke for `bin/check-design-spec` (AUDIT round-3 claude-01).
 *
 * The skill documents invoking the shim from the REPOSITORY ROOT
 * (`plugins/design-control/bin/check-design-spec <spec.md>`), but tsx resolves
 * tsconfig.json — and therefore the `@/*` path alias — from the cwd, so the
 * documented direction crashed with ERR_MODULE_NOT_FOUND and exit 1: the same
 * exit code the contract assigns to "findings present". This smoke spawns the
 * real shim as a child process with cwd = repo root against real-fs temp
 * fixtures, pinning both the green path and that a red verdict is a findings
 * line, never a loader stack.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(testDir, '..', '..', '..');
const repoRoot = resolve(pluginRoot, '..', '..');
const shim = join(pluginRoot, 'bin', 'check-design-spec');

const tempDirs: string[] = [];

function makeFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'design-spec-shim-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runShimFromRepoRoot(specPath: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(shim, [specPath], { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('bin/check-design-spec — documented repo-root invocation', () => {
  it('exits 0 with the green line on a passing spec', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: ink-primary
- kind: palette
- css: studio.css .btn-primary
- example: dashboard compose button
- do: Use the ink palette for primary actions.
`,
    );
    const { status, stdout, stderr } = runShimFromRepoRoot(specPath);
    expect(stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(status, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toContain('0 findings');
  }, 30_000);

  it('exits 1 with a findings line — not a loader stack — on a dead css link', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real { color: ink; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: dead
- kind: palette
- css: studio.css .ghost
- example: somewhere
- do: x
`,
    );
    const { status, stderr } = runShimFromRepoRoot(specPath);
    expect(stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(status).toBe(1);
    expect(stderr).toContain('dead-link-selector');
    expect(stderr).toContain('finding(s)');
  }, 30_000);
});
