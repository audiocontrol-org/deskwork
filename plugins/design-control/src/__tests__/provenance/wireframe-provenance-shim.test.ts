/**
 * Repo-root smoke for `bin/wireframe-provenance` (AUDIT round-3 claude-01
 * sibling). Same defect class as the other two shims: tsx resolves the `@/*`
 * alias from the cwd's tsconfig, so the documented repo-root invocation
 * crashed with ERR_MODULE_NOT_FOUND before any CLI code ran. A bare
 * invocation must reach the tested CLI core and return its usage contract
 * (exit 2 + usage lines on stderr) — never a loader stack with exit 1.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(testDir, '..', '..', '..');
const repoRoot = resolve(pluginRoot, '..', '..');
const shim = join(pluginRoot, 'bin', 'wireframe-provenance');

describe('bin/wireframe-provenance — documented repo-root invocation', () => {
  it('reaches the CLI core: exit 2 + usage on stderr, never a loader stack', () => {
    const result = spawnSync(shim, [], { cwd: repoRoot, encoding: 'utf8' });
    if (result.error) throw result.error;
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.status, `stderr: ${result.stderr}`).toBe(2);
    expect(result.stderr).toContain('usage: wireframe-provenance');
  }, 30_000);
});
