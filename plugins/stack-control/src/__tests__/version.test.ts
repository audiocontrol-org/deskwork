import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'cli.ts');
const TSX = resolve(here, '..', '..', '..', '..', 'node_modules', '.bin', 'tsx');
const PLUGIN_JSON = resolve(here, '..', '..', '.claude-plugin', 'plugin.json');

function runCli(args: string[]) {
  return spawnSync(TSX, [CLI, ...args], { encoding: 'utf8' });
}

describe('stackctl version (T009)', () => {
  it('prints the version from .claude-plugin/plugin.json and exits 0', () => {
    const parsed: unknown = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
    const expectedVersion =
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      typeof parsed.version === 'string'
        ? parsed.version
        : '';
    expect(expectedVersion).not.toBe('');
    const r = runCli(['version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(expectedVersion);
  });
});
