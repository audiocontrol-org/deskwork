/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/check-deprecations.test.ts
 *
 * Subcommand-shell tests for check-deprecations. The deprecation-scan
 * port itself is pending — see
 * https://github.com/audiocontrol-org/deskwork/issues/287. These tests
 * lock the CLI contract (flag parsing, exit codes, empty-registry
 * happy-path) so the subcommand can be wired into skill prose, hooks
 * scaffold, and documentation NOW without churning the contract when
 * the scan logic lands.
 *
 * The shell asserts:
 *   - help (`--help` / `-h`) exits 0.
 *   - default invocation reports an empty-registry line and exits 0.
 *   - `--quiet` suppresses the stdout line.
 *   - `--json` emits parseable JSON with the documented shape.
 *   - unknown flags exit 2 with an actionable error message.
 *   - `--write` is accepted (no-op until #287).
 */

import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, parseCli } from '../../scope-discovery/check-deprecations.js';
import { runScannerSubprocess } from './util/run-scanner.js';
import { isPlainObject } from '../../scope-discovery/util/typeguards.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

describe('check-deprecations — flag parsing', () => {
  it('default options', () => {
    const opts = parseCli([]);
    expect(opts.scanRoot).toBe('.');
    expect(opts.writeArtifact).toBe(false);
    expect(opts.quiet).toBe(false);
    expect(opts.json).toBe(false);
  });

  it('--write toggles writeArtifact', () => {
    expect(parseCli(['--write']).writeArtifact).toBe(true);
  });

  it('--artifact accepts a path', () => {
    expect(parseCli(['--artifact', 'tmp/x.md']).artifactPath).toBe('tmp/x.md');
  });

  it('--quiet + --json flags', () => {
    expect(parseCli(['--quiet']).quiet).toBe(true);
    expect(parseCli(['--json']).json).toBe(true);
  });

  it('--root requires a path', () => {
    expect(() => parseCli(['--root'])).toThrow(/--root requires a path/);
  });

  it('--artifact requires a path', () => {
    expect(() => parseCli(['--artifact'])).toThrow(/--artifact requires a path/);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/unknown argument/);
  });
});

describe('check-deprecations — programmatic main', () => {
  it('returns 0 on default invocation (empty-registry no-op)', async () => {
    const code = await main([]);
    expect(code).toBe(0);
  });

  it('returns 2 on unknown flag', async () => {
    const code = await main(['--bogus']);
    expect(code).toBe(2);
  });
});

describe('check-deprecations — CLI surface', () => {
  it('default invocation prints empty-registry line and exits 0', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations']);
    expect(run.code, `stderr=${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('registry empty');
    expect(run.stdout).toContain('issues/287');
  });

  it('--quiet suppresses the stdout status line', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations', '--quiet']);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe('');
  });

  it('--json emits parseable JSON with the documented shape', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations', '--json']);
    expect(run.code).toBe(0);
    const parsed: unknown = JSON.parse(run.stdout);
    expect(isPlainObject(parsed)).toBe(true);
    if (!isPlainObject(parsed)) return;
    expect(parsed['blocked']).toEqual([]);
    expect(parsed['safeToDelete']).toEqual([]);
    expect(parsed['deprecation_count']).toBe(0);
  });

  it('--help exits 0', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations', '--help']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('check-deprecations');
    expect(run.stdout).toContain('--write');
  });

  it('unknown flag exits 2 with actionable stderr', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations', '--bogus']);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('unknown argument');
  });

  it('--write accepted (no-op until #287)', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['check-deprecations', '--write']);
    expect(run.code).toBe(0);
  });
});
