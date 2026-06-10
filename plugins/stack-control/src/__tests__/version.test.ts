import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCli, PLUGIN_ROOT } from './_run-helpers.js';

const PLUGIN_JSON = resolve(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');

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
