/**
 * plugins/stack-control/src/__tests__/scope-discovery/validate-scope-discovery.test.ts
 *
 * Tests for the validate-scope-discovery CLI wrapper. The wrapper
 * spawns vitest under the hood; we DO NOT recursively run vitest from
 * inside vitest. Instead, the tests cover:
 *
 *   - flag parsing (--quiet, --help, unknown args)
 *   - programmatic main() exit-2 paths
 *   - CLI subprocess shows --help correctly
 *
 * The full spawn path is exercised in practice by every
 * `npm --workspace ... test -- scope-discovery` run; this file's job
 * is to lock the CLI contract, not to verify vitest itself.
 */

import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../scope-discovery/validate-scope-discovery.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

describe('validate-scope-discovery — flag parsing', () => {
  it('unknown flag returns 2', async () => {
    const code = await main(['--bogus']);
    expect(code).toBe(2);
  });
});

describe('validate-scope-discovery — CLI surface', () => {
  it('--help exits 0 with usage banner', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['validate-scope-discovery', '--help']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('validate-scope-discovery');
    expect(run.stdout).toContain('--quiet');
  });

  it('unknown flag exits 2', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, [
      'validate-scope-discovery',
      '--bogus',
    ]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('unknown argument');
  });
});
