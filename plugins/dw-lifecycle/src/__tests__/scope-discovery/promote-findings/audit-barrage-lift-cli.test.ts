/**
 * Phase 15 Task 3 — CLI tests for `dw-lifecycle audit-barrage-lift`.
 *
 * Real-fs fixtures: synthesize a docs/<v>/001-IN-PROGRESS/<slug>/
 * tree with an audit-log.md + an audit-runs run-dir containing
 * per-model markdown files in the prompt-template format.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runAuditBarrageLift,
} from '../../../subcommands/audit-barrage-lift.js';

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
  workDir = mkdtempSync(join(tmpdir(), 'barrage-lift-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string, auditLog: string, runDirName: string, runDirFiles: Record<string, string>): {
  repoRoot: string;
  runDirPath: string;
  auditLogPath: string;
} {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  const auditLogPath = join(featureDir, 'audit-log.md');
  writeFileSync(auditLogPath, auditLog, 'utf8');
  const runDirPath = join(repoRoot, '.dw-lifecycle', 'scope-discovery', 'audit-runs', runDirName);
  mkdirSync(runDirPath, { recursive: true });
  for (const [filename, content] of Object.entries(runDirFiles)) {
    writeFileSync(join(runDirPath, filename), content, 'utf8');
  }
  return { repoRoot, runDirPath, auditLogPath };
}

function findingBlock(model: string, nn: string, heading: string, surface: string, severity = 'high'): string {
  return [
    `### ${heading}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    `Severity:   ${severity}`,
    `Surface:    ${surface}`,
    '',
    `Body paragraph for ${model}-${nn}.`,
    '',
  ].join('\n');
}

const EMPTY_AUDIT_LOG = '# Audit Log\n';

describe('parseFlags — audit-barrage-lift', () => {
  it('requires --feature', () => {
    const r = parseFlags(['--run-dir', '/tmp/x']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/--feature/);
  });

  it('requires --run-dir', () => {
    const r = parseFlags(['--feature', 'demo']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/--run-dir/);
  });

  it('happy path: --feature + --run-dir', () => {
    const r = parseFlags(['--feature', 'demo', '--run-dir', '/tmp/x']);
    expect(r.ok).toBe(true);
    if (r.ok && r.opts.help !== true) {
      expect(r.opts.featureSlug).toBe('demo');
      expect(r.opts.runDir).toBe('/tmp/x');
      expect(r.opts.apply).toBe(false);
    }
  });

  it('--apply flips to write mode', () => {
    const r = parseFlags(['--feature', 'demo', '--run-dir', '/tmp/x', '--apply']);
    expect(r.ok).toBe(true);
    if (r.ok && r.opts.help !== true) expect(r.opts.apply).toBe(true);
  });

  it('--date accepts YYYYMMDD', () => {
    const r = parseFlags(['--feature', 'demo', '--run-dir', '/tmp/x', '--date', '20260530']);
    expect(r.ok).toBe(true);
    if (r.ok && r.opts.help !== true) expect(r.opts.date).toBe('20260530');
  });

  it('rejects unknown flags', () => {
    const r = parseFlags(['--feature', 'demo', '--run-dir', '/tmp/x', '--bogus']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/--bogus/);
  });

  it('--help short-circuits', () => {
    const r = parseFlags(['--help']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.opts.help).toBe(true);
  });
});

describe('runAuditBarrageLift — dry-run + apply flows', () => {
  it('dry-run reports proposed IDs without writing', async () => {
    const { repoRoot, runDirPath, auditLogPath } = makeRepo(
      'dry-run',
      EMPTY_AUDIT_LOG,
      '20260601T120000Z-demo',
      {
        'claude.md': findingBlock('claude', '01', 'Validation drops null branch', 'src/v.ts:10'),
      },
    );
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runAuditBarrageLift({
      opts: { featureSlug: 'demo', runDir: runDirPath, date: '20260601', apply: false },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toBe(EMPTY_AUDIT_LOG);
    expect(stdout.text()).toMatch(/AUDIT-20260601-01/);
    expect(stderr.text()).toMatch(/dry-run/i);
  });

  it('--apply writes a new section + entries with sequential AUDIT-IDs', async () => {
    const { repoRoot, runDirPath, auditLogPath } = makeRepo(
      'apply-writes',
      EMPTY_AUDIT_LOG,
      '20260601T120000Z-demo',
      {
        'claude.md': findingBlock('claude', '01', 'Validation drops null branch', 'src/v.ts:10'),
        'codex.md': findingBlock('codex', '01', 'Logger leaks handles on shutdown', 'src/log.ts:200', 'medium'),
      },
    );
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runAuditBarrageLift({
      opts: { featureSlug: 'demo', runDir: runDirPath, date: '20260601', apply: true },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toMatch(/## 2026-06-01 — audit-barrage lift \(20260601T120000Z-demo\)/);
    expect(written).toMatch(/### AUDIT-20260601-01 — /);
    expect(written).toMatch(/### AUDIT-20260601-02 — /);
    expect(written).toMatch(/Finding-ID: AUDIT-20260601-01/);
    expect(written).toMatch(/Finding-ID: AUDIT-20260601-02/);
  });

  it('continues sequential AUDIT-NN from highest existing for the same date', async () => {
    const existing = [
      '# Audit Log',
      '',
      '## 2026-06-01 — earlier lift',
      '',
      '### AUDIT-20260601-07 — earlier finding',
      '',
      'Finding-ID: AUDIT-20260601-07',
      'Status: fixed-deadbee',
      'Severity: low',
      '',
      'Body.',
      '',
    ].join('\n');
    const { repoRoot, runDirPath, auditLogPath } = makeRepo(
      'sequential',
      existing,
      '20260601T180000Z-demo',
      {
        'claude.md': findingBlock('claude', '03', 'Race condition in dispatcher', 'src/d.ts:42'),
      },
    );
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runAuditBarrageLift({
      opts: { featureSlug: 'demo', runDir: runDirPath, date: '20260601', apply: true },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toMatch(/### AUDIT-20260601-08 — /);
    expect(written).toMatch(/Finding-ID: AUDIT-20260601-07/);
    expect(written).toMatch(/Finding-ID: AUDIT-20260601-08/);
  });

  it('renders cross-model agreement with (model-N + model-M; cross-model) suffix', async () => {
    const { repoRoot, runDirPath, auditLogPath } = makeRepo(
      'cross-model-suffix',
      EMPTY_AUDIT_LOG,
      '20260601T120000Z-demo',
      {
        'claude.md': findingBlock('claude', '02', 'Race condition in scrapbook dispatch path', 'src/scrap.ts:42'),
        'codex.md': findingBlock('codex', '05', 'Race condition in scrapbook dispatch path', 'src/scrap.ts:48'),
      },
    );
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runAuditBarrageLift({
      opts: { featureSlug: 'demo', runDir: runDirPath, date: '20260601', apply: true },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toMatch(/Finding-ID: AUDIT-20260601-01 \(claude-02 \+ codex-05; cross-model\)/);
  });

  it('preserves pre-existing audit-log content verbatim (purely additive write)', async () => {
    const existing = [
      '# Audit Log',
      '',
      '## 2026-05-29 — Phase 12 self-dogfood',
      '',
      '### AUDIT-20260529-01 — Existing entry that must not change',
      '',
      'Finding-ID: AUDIT-20260529-01 (claude-X + codex-Y; cross-model)',
      'Status: fixed-08971e4',
      'Severity: high',
      '',
      'Body that the lift must not touch.',
      '',
    ].join('\n');
    const { repoRoot, runDirPath, auditLogPath } = makeRepo(
      'preserve',
      existing,
      '20260601T120000Z-demo',
      {
        'claude.md': findingBlock('claude', '04', 'New finding from lift', 'src/n.ts:10'),
      },
    );
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runAuditBarrageLift({
      opts: { featureSlug: 'demo', runDir: runDirPath, date: '20260601', apply: true },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written.startsWith(existing.trimEnd())).toBe(true);
    expect(written).toMatch(/Body that the lift must not touch\./);
    expect(written).toMatch(/### AUDIT-20260601-01 — New finding from lift/);
  });

  it('feature not found → exit 2', async () => {
    const repoRoot = join(workDir, 'no-feature');
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const runDirPath = join(workDir, 'fake-run-dir');
    mkdirSync(runDirPath, { recursive: true });
    const exit = await runAuditBarrageLift({
      opts: { featureSlug: 'nonexistent', runDir: runDirPath, date: '20260601', apply: false },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/feature.*not found/i);
  });

  it('run-dir not found → exit 2', async () => {
    const { repoRoot } = makeRepo('no-run-dir', EMPTY_AUDIT_LOG, '20260601T120000Z-demo', {});
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runAuditBarrageLift({
      opts: {
        featureSlug: 'demo',
        runDir: join(workDir, 'no-run-dir', 'missing-run-dir-path'),
        date: '20260601',
        apply: false,
      },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/run-dir/i);
  });

  it('reports zero findings when run-dir is empty (exit 0, no audit-log write)', async () => {
    const { repoRoot, runDirPath, auditLogPath } = makeRepo(
      'empty-run-dir',
      EMPTY_AUDIT_LOG,
      '20260601T120000Z-demo',
      {},
    );
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runAuditBarrageLift({
      opts: { featureSlug: 'demo', runDir: runDirPath, date: '20260601', apply: true },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(exit).toBe(0);
    expect(readFileSync(auditLogPath, 'utf8')).toBe(EMPTY_AUDIT_LOG);
  });
});
