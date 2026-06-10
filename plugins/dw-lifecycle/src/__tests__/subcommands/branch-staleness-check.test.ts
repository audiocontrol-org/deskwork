/**
 * Phase 28 Task 2 — CLI subcommand parser tests.
 *
 * The runtime (real-git wrappers, config-load fallback, stdout
 * formatting) is exercised by the live-verify step in the workplan.
 * This file covers the argv parser's contract:
 *   - --threshold N    accepts non-negative integers; rejects others.
 *   - --no-fetch       flips fetch to false.
 *   - --json           flips json to true.
 *   - --remote <ref>   accepts `<remote>/<branch>` shape only.
 *   - unknown flag     throws.
 */

import { describe, it, expect } from 'vitest';
import { parseBranchStalenessCheckArgs } from '../../subcommands/branch-staleness-check.js';

describe('parseBranchStalenessCheckArgs', () => {
  it('returns defaults when no args provided', () => {
    const opts = parseBranchStalenessCheckArgs([]);
    expect(opts.threshold).toBeNull();
    expect(opts.fetch).toBe(true);
    expect(opts.json).toBe(false);
    expect(opts.remoteRef).toBe('origin/main');
  });

  it('--threshold accepts a non-negative integer', () => {
    expect(parseBranchStalenessCheckArgs(['--threshold', '10']).threshold).toBe(10);
    expect(parseBranchStalenessCheckArgs(['--threshold', '0']).threshold).toBe(0);
  });

  it('--threshold rejects a negative integer', () => {
    expect(() => parseBranchStalenessCheckArgs(['--threshold', '-3'])).toThrow(
      /non-negative integer/,
    );
  });

  it('--threshold rejects a fractional value', () => {
    expect(() => parseBranchStalenessCheckArgs(['--threshold', '2.5'])).toThrow(
      /non-negative integer/,
    );
  });

  it('--threshold rejects non-numeric input', () => {
    expect(() => parseBranchStalenessCheckArgs(['--threshold', 'abc'])).toThrow(
      /non-negative integer/,
    );
  });

  it('--threshold requires a value', () => {
    expect(() => parseBranchStalenessCheckArgs(['--threshold'])).toThrow(/requires a value/);
  });

  it('--no-fetch flips fetch to false', () => {
    expect(parseBranchStalenessCheckArgs(['--no-fetch']).fetch).toBe(false);
  });

  it('--json flips json to true', () => {
    expect(parseBranchStalenessCheckArgs(['--json']).json).toBe(true);
  });

  it('--remote accepts a remote/branch ref', () => {
    expect(parseBranchStalenessCheckArgs(['--remote', 'upstream/master']).remoteRef).toBe(
      'upstream/master',
    );
  });

  it('--remote rejects a ref without /', () => {
    expect(() => parseBranchStalenessCheckArgs(['--remote', 'main'])).toThrow(
      /<remote>\/<branch>/,
    );
  });

  it('combines multiple flags', () => {
    const opts = parseBranchStalenessCheckArgs([
      '--threshold',
      '8',
      '--no-fetch',
      '--json',
      '--remote',
      'upstream/develop',
    ]);
    expect(opts).toEqual({
      threshold: 8,
      fetch: false,
      json: true,
      remoteRef: 'upstream/develop',
    });
  });

  it('unknown flag throws', () => {
    expect(() => parseBranchStalenessCheckArgs(['--bogus'])).toThrow(/Unknown flag/);
  });
});
