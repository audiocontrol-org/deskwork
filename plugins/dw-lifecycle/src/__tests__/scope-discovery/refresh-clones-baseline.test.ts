/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/refresh-clones-baseline.test.ts
 *
 * Tests for the refresh-clones-baseline wrapper. The wrapper's contract
 * is small:
 *
 *   - inject `--refresh-baseline` into the forwarded arg list unless
 *     already present
 *   - surface --help / -h with the refresh-specific banner
 *   - forward --baseline / --quiet verbatim
 *
 * We test the pure helpers (`forwardedArgs`, `wantsHelp`) directly to
 * lock the arg-translation contract without spawning jscpd. The CLI
 * subprocess test covers --help (which doesn't invoke jscpd).
 */

import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  forwardedArgs,
  wantsHelp,
} from '../../scope-discovery/refresh-clones-baseline.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

describe('refresh-clones-baseline — forwardedArgs', () => {
  it('injects --refresh-baseline at the head when absent', () => {
    expect(forwardedArgs([])).toEqual(['--refresh-baseline']);
  });

  it('forwards --baseline and --quiet verbatim with --refresh-baseline prepended', () => {
    expect(
      forwardedArgs(['--baseline', '/tmp/x.yaml', '--quiet']),
    ).toEqual(['--refresh-baseline', '--baseline', '/tmp/x.yaml', '--quiet']);
  });

  it('does not duplicate --refresh-baseline if the caller already passed it', () => {
    expect(forwardedArgs(['--refresh-baseline', '--quiet'])).toEqual([
      '--refresh-baseline',
      '--quiet',
    ]);
  });

  it('preserves ordering of forwarded flags', () => {
    expect(
      forwardedArgs(['--quiet', '--baseline', '/tmp/x.yaml']),
    ).toEqual(['--refresh-baseline', '--quiet', '--baseline', '/tmp/x.yaml']);
  });
});

describe('refresh-clones-baseline — wantsHelp', () => {
  it('detects --help', () => {
    expect(wantsHelp(['--help'])).toBe(true);
  });

  it('detects -h', () => {
    expect(wantsHelp(['-h'])).toBe(true);
  });

  it('detects --help anywhere in the arg list', () => {
    expect(wantsHelp(['--baseline', '/tmp/x.yaml', '--help'])).toBe(true);
  });

  it('returns false when no help flag is present', () => {
    expect(wantsHelp(['--baseline', '/tmp/x.yaml', '--quiet'])).toBe(false);
  });
});

describe('refresh-clones-baseline — CLI surface', () => {
  it('--help exits 0 with refresh-specific usage banner', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, [
      'refresh-clones-baseline',
      '--help',
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('refresh-clones-baseline');
    expect(run.stdout).toContain('--baseline');
    expect(run.stdout).toContain('--quiet');
  });

  it('-h exits 0 with the same banner', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['refresh-clones-baseline', '-h']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('refresh-clones-baseline');
  });
});
