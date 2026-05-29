/**
 * CLI tests for `dw-lifecycle apply-audit-flips` — Phase 13 Task 4 Step 2.
 *
 * Use real-fs fixtures for the audit-log + workplan; inject a synthetic
 * commit walker so the tests don't need an actual git history.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runApplyAuditFlips,
} from '../../../subcommands/apply-audit-flips.js';
import type {
  CommitWalker,
} from '../../../subcommands/apply-audit-flips.js';

class CaptureStream extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _encoding: string,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    cb(null);
  }
  text(): string {
    return this.chunks.join('');
  }
}

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'apply-flips-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string, auditLog: string): string {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
  return repoRoot;
}

const OPEN_TWO_ENTRIES = [
  '# Audit Log',
  '',
  '### AUDIT-20260529-12 — first open',
  '',
  'Finding-ID: AUDIT-20260529-12',
  'Status: open',
  'Severity: low',
  '',
  'Body.',
  '',
  '### AUDIT-20260529-13 — second open',
  '',
  'Finding-ID: AUDIT-20260529-13',
  'Status: open',
  'Severity: medium',
  '',
  'Body.',
  '',
  '### AUDIT-20260529-14 — already fixed',
  '',
  'Finding-ID: AUDIT-20260529-14',
  'Status: fixed-deadbeef',
  '',
  'Body.',
].join('\n');

describe('parseFlags — apply-audit-flips CLI', () => {
  it('rejects when --feature is missing', () => {
    const r = parseFlags([]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--feature/);
  });

  it('parses --feature alone (default dry-run)', () => {
    const r = parseFlags(['--feature', 'demo']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.featureSlug).toBe('demo');
    expect(r.opts.apply).toBe(false);
  });

  it('parses --apply', () => {
    const r = parseFlags(['--feature', 'demo', '--apply']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.apply).toBe(true);
  });

  it('parses --since', () => {
    const r = parseFlags(['--feature', 'demo', '--since', 'main']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.sinceRef).toBe('main');
  });

  it('parses --commit', () => {
    const r = parseFlags(['--feature', 'demo', '--commit', 'abc1234']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.commitSha).toBe('abc1234');
  });

  it('rejects --since and --commit together', () => {
    const r = parseFlags([
      '--feature',
      'demo',
      '--since',
      'main',
      '--commit',
      'abc',
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/mutually exclusive/);
  });

  it('rejects unknown flags', () => {
    const r = parseFlags(['--feature', 'demo', '--bogus']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/unknown|bogus/);
  });
});

describe('runApplyAuditFlips — dry-run + apply flows', () => {
  it('dry-run reports proposed flips without writing', async () => {
    const repoRoot = makeRepo('dry-run', OPEN_TWO_ENTRIES);
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    const before = readFileSync(auditLogPath, 'utf8');
    const walker: CommitWalker = () => [
      { sha: 'abc1234', message: 'feat: Closes AUDIT-20260529-12' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: false },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stdout.text()).toContain('open → fixed-abc1234  AUDIT-20260529-12');
    expect(stderr.text()).toContain('dry-run');
    // Audit-log untouched.
    expect(readFileSync(auditLogPath, 'utf8')).toBe(before);
  });

  it('--apply writes the audit-log + flips Status', async () => {
    const repoRoot = makeRepo('apply', OPEN_TWO_ENTRIES);
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    const walker: CommitWalker = () => [
      { sha: 'cafebabe', message: 'feat: Closes AUDIT-20260529-12' },
      { sha: 'deadbeef', message: 'feat: Closes AUDIT-20260529-13' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toContain('Status: fixed-cafebabe');
    expect(written).toContain('Status: fixed-deadbeef');
    expect(written).not.toMatch(/Status: open/);
  });

  it('skips already-dispositioned findings (reports without erroring)', async () => {
    const repoRoot = makeRepo('already-fixed', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      { sha: 'newshac1', message: 'feat: Closes AUDIT-20260529-14' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stdout.text()).toContain(
      'skip  (already fixed-deadbeef)  AUDIT-20260529-14',
    );
    // The original audit-log file's fixed-deadbeef entry stays put.
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    expect(readFileSync(auditLogPath, 'utf8')).toContain(
      'Status: fixed-deadbeef',
    );
  });

  it('reports unknown Finding-IDs without erroring', async () => {
    const repoRoot = makeRepo('unknown-id', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      { sha: 'abcd123', message: 'feat: Closes AUDIT-20260529-99' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stdout.text()).toContain(
      'skip  (no such Finding-ID in audit-log)  AUDIT-20260529-99',
    );
  });

  it('handles a commit with no Closes-AUDIT references (no-op)', async () => {
    const repoRoot = makeRepo('no-refs', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      { sha: 'docsonly', message: 'docs: README polish' },
    ];
    const stderr = new CaptureStream();
    const stdout = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stderr.text()).toContain('no Closes-AUDIT references');
  });

  it('flips multiple AUDIT ids from a single multi-finding commit', async () => {
    const repoRoot = makeRepo('multi-cite', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      {
        sha: 'multif1',
        message: [
          'feat: combo fix',
          '',
          'Closes: AUDIT-20260529-12, AUDIT-20260529-13',
        ].join('\n'),
      },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toContain('Status: fixed-multif1');
    expect(written.match(/Status: fixed-multif1/g)?.length).toBe(2);
  });

  it('exits 2 when the feature root is not found', async () => {
    const repoRoot = join(workDir, 'no-feature');
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'nope', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: () => [],
    });
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/not found/);
  });
});
