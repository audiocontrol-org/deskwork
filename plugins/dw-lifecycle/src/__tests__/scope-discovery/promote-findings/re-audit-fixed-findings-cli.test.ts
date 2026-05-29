/**
 * CLI tests for `dw-lifecycle re-audit-fixed-findings` — Phase 13
 * Task 4 Step 3. Uses an in-memory run-dir reader so tests don't need
 * actual audit-runs on disk.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runReAuditFixedFindings,
} from '../../../subcommands/re-audit-fixed-findings.js';

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
  workDir = mkdtempSync(join(tmpdir(), 're-audit-'));
});
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const AUDIT_LOG_FIXTURE = [
  '# Audit Log',
  '',
  '### AUDIT-20260529-12 — orchestrator-turn 3/6 catalog NOTE is constant per-turn noise',
  '',
  'Finding-ID: AUDIT-20260529-12',
  'Status: fixed-245f8ae',
  'Severity: low',
  'Surface: plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts',
  '',
  'Body of finding 12.',
  '',
  '### AUDIT-20260529-13 — dispatch-wrapper grammar false-positives',
  '',
  'Finding-ID: AUDIT-20260529-13',
  'Status: fixed-8365973',
  'Severity: medium',
  'Surface: plugins/dw-lifecycle/src/scope-discovery/dispatch-grammar.ts',
  '',
  'Body of finding 13.',
  '',
  '### AUDIT-20260529-99 — open finding (not eligible)',
  '',
  'Finding-ID: AUDIT-20260529-99',
  'Status: open',
  'Surface: src/some/file.ts',
  '',
  'Body.',
].join('\n');

function makeRepoWithRunDir(name: string, runDirContents: string): {
  repoRoot: string;
  auditLogPath: string;
  runDir: string;
} {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  const auditLogPath = join(featureDir, 'audit-log.md');
  writeFileSync(auditLogPath, AUDIT_LOG_FIXTURE, 'utf8');
  const runDir = join(repoRoot, 'audit-runs', '20260601T120000Z-demo');
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'claude.md'), runDirContents, 'utf8');
  return { repoRoot, auditLogPath, runDir };
}

describe('parseFlags — re-audit-fixed-findings CLI', () => {
  it('rejects without --feature', () => {
    const r = parseFlags(['--run-dir', '/tmp/x']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--feature/);
  });

  it('rejects without --run-dir', () => {
    const r = parseFlags(['--feature', 'demo']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--run-dir/);
  });

  it('parses --feature + --run-dir + --apply + --date', () => {
    const r = parseFlags([
      '--feature',
      'demo',
      '--run-dir',
      '/tmp/x',
      '--date',
      '2026-06-01',
      '--apply',
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.featureSlug).toBe('demo');
    expect(r.opts.runDir).toBe('/tmp/x');
    expect(r.opts.date).toBe('2026-06-01');
    expect(r.opts.apply).toBe(true);
  });
});

describe('runReAuditFixedFindings — dry-run vs apply', () => {
  it('dry-run reports not-surfaced + still-surfaced + unmatchable classes', async () => {
    // Run-dir mentions AUDIT-12's heading but NOT AUDIT-13's.
    const runDirContents = [
      '# claude audit output',
      '',
      'The orchestrator-turn 3/6 catalog NOTE is constant per-turn noise persists.',
      '',
      'plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn.ts has a bug.',
    ].join('\n');
    const { repoRoot, auditLogPath, runDir } = makeRepoWithRunDir(
      'dry',
      runDirContents,
    );
    const before = readFileSync(auditLogPath, 'utf8');
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runReAuditFixedFindings({
      opts: { featureSlug: 'demo', runDir, date: '2026-06-01' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });
    expect(exit).toBe(0);
    const out = stdout.text();
    expect(out).toContain('RE-SURFACED  AUDIT-20260529-12');
    expect(out).toContain('flip → verified-2026-06-01  AUDIT-20260529-13');
    expect(stderr.text()).toContain('dry-run');
    expect(readFileSync(auditLogPath, 'utf8')).toBe(before);
  });

  it('--apply writes verified-<date> for not-surfaced entries only', async () => {
    const runDirContents = 'Nothing about either finding here.';
    const { repoRoot, auditLogPath, runDir } = makeRepoWithRunDir(
      'apply',
      runDirContents,
    );
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runReAuditFixedFindings({
      opts: {
        featureSlug: 'demo',
        runDir,
        date: '2026-06-01',
        apply: true,
      },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toContain('Status: verified-2026-06-01');
    // The Status of AUDIT-20260529-12 + 13 should both flip; the open
    // AUDIT-20260529-99 stays untouched.
    expect(written.match(/Status: verified-2026-06-01/g)?.length).toBe(2);
    expect(written).toContain('Status: open');
    expect(written).not.toContain('Status: fixed-245f8ae');
    expect(written).not.toContain('Status: fixed-8365973');
  });

  it('exits 2 when run-dir is missing', async () => {
    const repoRoot = join(workDir, 'no-run-dir');
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'audit-log.md'), AUDIT_LOG_FIXTURE, 'utf8');
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runReAuditFixedFindings({
      opts: { featureSlug: 'demo', runDir: '/no/such/dir' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/run-dir not found/);
  });

  it('exits 2 when run-dir contains no .md outputs', async () => {
    const repoRoot = join(workDir, 'empty-run-dir');
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'audit-log.md'), AUDIT_LOG_FIXTURE, 'utf8');
    const runDir = join(repoRoot, 'empty-run');
    mkdirSync(runDir, { recursive: true });
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runReAuditFixedFindings({
      opts: { featureSlug: 'demo', runDir },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/no .md outputs/);
  });
});
