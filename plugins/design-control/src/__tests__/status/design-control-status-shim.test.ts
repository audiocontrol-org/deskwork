import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(testDir, '..', '..', '..');
const repoRoot = resolve(pluginRoot, '..', '..');
const shim = join(pluginRoot, 'bin', 'design-control-status');

describe('bin/design-control-status — documented repo-root invocation', () => {
  it('reaches the CLI core and returns usage, never a loader stack', () => {
    const result = spawnSync(shim, [], { cwd: repoRoot, encoding: 'utf8' });
    if (result.error) throw result.error;
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.status, `stderr: ${result.stderr}`).toBe(2);
    expect(result.stderr).toContain('usage: design-control-status');
  }, 30_000);
});
