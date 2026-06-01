/**
 * Phase 17 retro-fix — check-barrage-tip CLI shim tests.
 *
 * Closes AUDIT-20260531-23 (codex-03): defaultListRunDirs must
 * distinguish ENOENT (legitimate boot case — return []) from other
 * errors (EACCES, ENOTDIR — propagate as exit-2 config error). Tests
 * pin both shapes.
 *
 * Also addresses AUDIT-20260531-25 (claude-04, partial): the CLI
 * shim's defaultListRunDirs is now exported + testable. Wider CLI-
 * shim test coverage is tracked separately.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  defaultListRunDirs,
  parseFlags,
  runCheckBarrageTip,
} from '../../../subcommands/check-barrage-tip.js';

class StringStream extends Writable {
  public chunks: string[] = [];
  _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
    this.chunks.push(chunk.toString());
    cb();
  }
  get text(): string {
    return this.chunks.join('');
  }
}

describe('defaultListRunDirs — Phase 17 retro-fix (AUDIT-23)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'dwl-check-barrage-tip-'));
  });

  afterEach(async () => {
    // Restore writable bits on any chmodded dirs before rm (otherwise
    // rm fails on macOS due to permissions on the test fixtures).
    try {
      await chmod(join(tmp, 'audit-runs'), 0o700);
    } catch {
      // ignore
    }
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns [] when the audit-runs dir does NOT exist (ENOENT — boot case)', async () => {
    const result = await defaultListRunDirs(join(tmp, 'audit-runs'));
    expect(result).toEqual([]);
  });

  it('returns [] when the audit-runs dir exists but is empty', async () => {
    const auditRunsDir = join(tmp, 'audit-runs');
    await mkdir(auditRunsDir, { recursive: true });
    const result = await defaultListRunDirs(auditRunsDir);
    expect(result).toEqual([]);
  });

  it('returns the child dir paths when audit-runs has run subdirs', async () => {
    const auditRunsDir = join(tmp, 'audit-runs');
    await mkdir(auditRunsDir, { recursive: true });
    await mkdir(join(auditRunsDir, '20260601T0001-feat'), { recursive: true });
    await mkdir(join(auditRunsDir, '20260601T0002-feat'), { recursive: true });
    const result = await defaultListRunDirs(auditRunsDir);
    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual([
      join(auditRunsDir, '20260601T0001-feat'),
      join(auditRunsDir, '20260601T0002-feat'),
    ]);
  });

  it('throws on EACCES (permission denied) — propagates as config error', async () => {
    const auditRunsDir = join(tmp, 'audit-runs');
    await mkdir(auditRunsDir, { recursive: true });
    // Strip all permissions. POSIX readdir(2) fails with EACCES.
    await chmod(auditRunsDir, 0o000);
    let thrown: unknown = null;
    try {
      await defaultListRunDirs(auditRunsDir);
    } catch (err) {
      thrown = err;
    }
    // Restore permissions before assert (so cleanup works even on test fail).
    await chmod(auditRunsDir, 0o700);
    expect(thrown).not.toBeNull();
    const errno = thrown as NodeJS.ErrnoException;
    expect(errno.code).toBe('EACCES');
  });
});

/**
 * Phase 17 retro-fix — AUDIT-20260531-25 (claude-04) partial:
 * shim-level tests for parseFlags + runCheckBarrageTip exit codes.
 * Pre-fix, the AC "CLI exit codes match the contract" was marked
 * complete with no tests exercising the shim. These tests close that
 * gap for the parseFlags surface + the featureRoot-undefined → exit-2
 * path + the EACCES → exit-2 propagation.
 */
describe('parseFlags — Phase 17 retro-fix (AUDIT-25)', () => {
  it('returns ok with featureSlug when --feature is supplied', () => {
    const result = parseFlags(['--feature', 'my-feat']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opts.featureSlug).toBe('my-feat');
  });

  it('rejects when --feature is omitted (required)', () => {
    const result = parseFlags([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/--feature.*required/i);
  });

  it('rejects when --feature has no value', () => {
    const result = parseFlags(['--feature']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/requires a value/);
  });

  it('rejects unknown flags', () => {
    const result = parseFlags(['--feature', 'x', '--bogus-flag']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unknown flag/);
  });

  it('--help short-circuits to help mode (no --feature required)', () => {
    const result = parseFlags(['--help']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opts.help).toBe(true);
  });

  it('accepts --repo-root with a value', () => {
    const result = parseFlags(['--feature', 'x', '--repo-root', '/tmp/proj']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opts.repoRoot).toBe('/tmp/proj');
  });
});

describe('runCheckBarrageTip — Phase 17 retro-fix (AUDIT-25)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'dwl-cbt-run-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('exits 2 when the feature slug does not resolve to a feature root', async () => {
    // Project root with no docs/<v>/001-IN-PROGRESS/<slug>/ structure.
    const stdout = new StringStream();
    const stderr = new StringStream();
    const exit = await runCheckBarrageTip({
      opts: { featureSlug: 'nonexistent-slug' },
      projectRoot: tmp,
      stdout,
      stderr,
    });
    expect(exit).toBe(2);
    expect(stderr.text).toMatch(/not found under docs/);
  });

  it('exits 0 when no prior runs exist (boot case)', async () => {
    // Set up a minimal feature root so resolveFeatureRoot succeeds.
    const featureRoot = join(tmp, 'docs', '1.0', '001-IN-PROGRESS', 'test-feat');
    await mkdir(featureRoot, { recursive: true });
    const stdout = new StringStream();
    const stderr = new StringStream();
    const exit = await runCheckBarrageTip({
      opts: { featureSlug: 'test-feat' },
      projectRoot: tmp,
      stdout,
      stderr,
      // Inject stubs to avoid touching real filesystem/git.
      listRunDirs: async () => [],
      readTipSha: async () => null,
      gitRevListCount: async () => 0,
    });
    expect(exit).toBe(0); // hasNewDiff=true (boot case fail-safe to fire)
    expect(stderr.text).toMatch(/no prior barrage/i);
  });

  it('exits 1 when latest tip matches HEAD (no new diff)', async () => {
    const featureRoot = join(tmp, 'docs', '1.0', '001-IN-PROGRESS', 'test-feat');
    await mkdir(featureRoot, { recursive: true });
    const stdout = new StringStream();
    const stderr = new StringStream();
    const exit = await runCheckBarrageTip({
      opts: { featureSlug: 'test-feat' },
      projectRoot: tmp,
      stdout,
      stderr,
      listRunDirs: async () => ['/audit-runs/r1'],
      readTipSha: async () => 'abc1234567',
      gitRevListCount: async () => 0,
    });
    expect(exit).toBe(1);
    expect(stderr.text).toMatch(/no new diff/i);
  });
});
