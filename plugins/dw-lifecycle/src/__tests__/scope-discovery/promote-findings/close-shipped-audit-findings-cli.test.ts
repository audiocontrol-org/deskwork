/**
 * CLI tests for `dw-lifecycle close-shipped-audit-findings` — Phase 13
 * Task 4 Step 1. Focuses on propose vs. apply + audit-log preservation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runCloseShippedAuditFindings,
  type ShaWalker,
} from '../../../subcommands/close-shipped-audit-findings.js';

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
  workDir = mkdtempSync(join(tmpdir(), 'close-shipped-'));
});
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const AUDIT_LOG_FIXTURE = [
  '# Audit Log',
  '',
  '### AUDIT-20260529-12 — first finding',
  '',
  'Finding-ID: AUDIT-20260529-12',
  'Status: fixed-aabbccd',
  'Severity: low',
  '',
  'Body. SHA in range.',
  '',
  '### AUDIT-20260529-13 — second finding',
  '',
  'Finding-ID: AUDIT-20260529-13',
  'Status: fixed-deadbee',
  'Severity: medium',
  '',
  'Body. SHA NOT in range.',
  '',
  '### AUDIT-20260529-14 — open',
  '',
  'Finding-ID: AUDIT-20260529-14',
  'Status: open',
  '',
  'Body. Not eligible (not fixed).',
].join('\n');

function makeRepo(name: string): {
  repoRoot: string;
  auditLogPath: string;
} {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  const auditLogPath = join(featureDir, 'audit-log.md');
  writeFileSync(auditLogPath, AUDIT_LOG_FIXTURE, 'utf8');
  return { repoRoot, auditLogPath };
}

describe('parseFlags — close-shipped-audit-findings CLI', () => {
  it('rejects without --feature', () => {
    const r = parseFlags(['--from', 'v1']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--feature/);
  });

  it('rejects without --from', () => {
    const r = parseFlags(['--feature', 'demo']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--from/);
  });

  it('parses --feature + --from with defaults', () => {
    const r = parseFlags(['--feature', 'demo', '--from', 'v1']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.featureSlug).toBe('demo');
    expect(r.opts.fromRef).toBe('v1');
    expect(r.opts.toRef).toBeUndefined();
    expect(r.opts.apply).toBe(false);
  });

  it('parses --to + --date + --apply', () => {
    const r = parseFlags([
      '--feature',
      'demo',
      '--from',
      'v1',
      '--to',
      'v2',
      '--date',
      '2026-05-29',
      '--apply',
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.toRef).toBe('v2');
    expect(r.opts.date).toBe('2026-05-29');
    expect(r.opts.apply).toBe(true);
  });
});

describe('runCloseShippedAuditFindings — propose vs. apply', () => {
  it('dry-run proposes verified flips for in-range SHAs only', async () => {
    const { repoRoot, auditLogPath } = makeRepo('dry-run');
    const before = readFileSync(auditLogPath, 'utf8');
    const walker: ShaWalker = () => [
      'aabbccdd00112233445566778899aabbccddee01',
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCloseShippedAuditFindings({
      opts: {
        featureSlug: 'demo',
        fromRef: 'v1',
        date: '2026-05-29',
      },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      shaWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stdout.text()).toContain('fixed-aabbccd → verified-2026-05-29');
    expect(stdout.text()).not.toContain('AUDIT-20260529-13'); // SHA out of range
    expect(stdout.text()).not.toContain('AUDIT-20260529-14'); // status not fixed
    expect(stderr.text()).toContain('dry-run');
    // Audit-log untouched.
    expect(readFileSync(auditLogPath, 'utf8')).toBe(before);
  });

  it('--apply writes the flip + preserves audit-log body', async () => {
    const { repoRoot, auditLogPath } = makeRepo('apply');
    const walker: ShaWalker = () => [
      'aabbccdd00112233445566778899aabbccddee01',
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCloseShippedAuditFindings({
      opts: {
        featureSlug: 'demo',
        fromRef: 'v1',
        date: '2026-05-29',
        apply: true,
      },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      shaWalker: walker,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toContain('Status: verified-2026-05-29');
    expect(written).not.toContain('Status: fixed-aabbccd');
    // Other entries preserved.
    expect(written).toContain('Status: fixed-deadbee');
    expect(written).toContain('Status: open');
    // Body lines preserved verbatim.
    expect(written).toContain('Body. SHA in range.');
    expect(written).toContain('Body. SHA NOT in range.');
  });

  it('reports no proposals when zero SHAs match', async () => {
    const { repoRoot, auditLogPath } = makeRepo('no-matches');
    const before = readFileSync(auditLogPath, 'utf8');
    const walker: ShaWalker = () => [
      'ffffffffffffffffffffffffffffffffffffffff',
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCloseShippedAuditFindings({
      opts: {
        featureSlug: 'demo',
        fromRef: 'v1',
        date: '2026-05-29',
        apply: true,
      },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      shaWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stderr.text()).toContain('no proposals');
    expect(readFileSync(auditLogPath, 'utf8')).toBe(before);
  });

  it('exits 2 when feature root is not found', async () => {
    const repoRoot = join(workDir, 'no-feature');
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCloseShippedAuditFindings({
      opts: { featureSlug: 'nope', fromRef: 'v1' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      shaWalker: () => [],
    });
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/not found/);
  });
});
