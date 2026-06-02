/**
 * CLI tests for `dw-lifecycle check-open-findings` — the verb the
 * `/dw-lifecycle:implement` skill invokes at task-pickup time to enforce
 * Phase 13's anti-deferral discipline.
 *
 * Per workplan Phase 13 Task 2 Step 4, the verb must:
 *   - exit 0 on zero open findings
 *   - exit 1 on ≥1 open findings, with a refusal message that names
 *     every open finding ID AND points at `/dw-lifecycle:promote-findings`
 *     as the cure
 *   - exit 2 when the feature root cannot be resolved (config error)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runCheckOpenFindings,
} from '../../../subcommands/check-open-findings.js';

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
  workDir = mkdtempSync(join(tmpdir(), 'cof-cli-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string, auditContents: string | null): string {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  if (auditContents !== null) {
    writeFileSync(join(featureDir, 'audit-log.md'), auditContents, 'utf8');
  }
  return repoRoot;
}

describe('parseFlags — check-open-findings CLI', () => {
  it('rejects when --feature is missing', () => {
    const r = parseFlags([]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--feature/);
  });

  it('returns help shape when --help is passed', () => {
    const r = parseFlags(['--help']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.help).toBe(true);
  });

  it('parses --feature alone', () => {
    const r = parseFlags(['--feature', 'demo']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.featureSlug).toBe('demo');
    expect(r.opts.repoRoot).toBeUndefined();
  });

  it('parses --repo-root override', () => {
    const r = parseFlags(['--feature', 'demo', '--repo-root', '/tmp/repo']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.repoRoot).toBe('/tmp/repo');
  });

  it('rejects an unknown flag', () => {
    const r = parseFlags(['--feature', 'demo', '--bogus']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--bogus|unknown/i);
  });
});

describe('runCheckOpenFindings — exit codes + refusal messaging', () => {
  it('exits 0 with a one-line stderr summary when zero open findings', async () => {
    const repoRoot = makeRepo(
      'allowed',
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-01 — fixed',
        '',
        'Finding-ID: AUDIT-20260529-01',
        'Status: fixed-deadbeef',
        '',
        'Body.',
      ].join('\n'),
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(0);
    expect(stderr.text()).toMatch(/zero open findings|proceed/);
  });

  it('exits 0 when the audit-log file is absent (new feature, no findings yet)', async () => {
    const repoRoot = makeRepo('no-auditlog', null);

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(0);
  });

  it('exits 1 with refusal naming the single finding + the cure', async () => {
    const repoRoot = makeRepo(
      'one-open',
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-12 — noise NOTE',
        '',
        'Finding-ID: AUDIT-20260529-12',
        'Status: open',
        'Severity: low',
        '',
        'Body.',
      ].join('\n'),
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(1);
    const msg = stderr.text();
    expect(msg).toContain('AUDIT-20260529-12');
    expect(msg).toMatch(/Cannot advance|refuse|block/i);
    expect(msg).toContain('promote-findings');
    expect(msg).toContain('--feature demo');
  });

  it('exits 1 with refusal naming EVERY open finding when multiple exist', async () => {
    const repoRoot = makeRepo(
      'multi-open',
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-12 — first',
        '',
        'Finding-ID: AUDIT-20260529-12',
        'Status: open',
        '',
        'Body.',
        '',
        '### AUDIT-20260529-13 — second',
        '',
        'Finding-ID: AUDIT-20260529-13',
        'Status: open',
        '',
        'Body.',
        '',
        '### AUDIT-20260529-14 — third',
        '',
        'Finding-ID: AUDIT-20260529-14',
        'Status: open',
        '',
        'Body.',
      ].join('\n'),
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(1);
    const msg = stderr.text();
    expect(msg).toContain('AUDIT-20260529-12');
    expect(msg).toContain('AUDIT-20260529-13');
    expect(msg).toContain('AUDIT-20260529-14');
    expect(msg).toContain('promote-findings');
    // Count line — must reflect actual count.
    expect(msg).toMatch(/3 open/);
  });

  it('exits 2 when the feature root cannot be resolved', async () => {
    const repoRoot = mkdtempSync(join(workDir, 'no-feature-'));
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/not found|feature/i);
  });

  it('honors --repo-root override when supplied via opts.repoRoot', async () => {
    const repoRoot = makeRepo(
      'with-override',
      [
        '# Audit Log',
        '',
        '### AUDIT-20260529-22 — open via override path',
        '',
        'Finding-ID: AUDIT-20260529-22',
        'Status: open',
        '',
        'Body.',
      ].join('\n'),
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    // projectRoot is intentionally wrong; opts.repoRoot supplies the right one.
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo', repoRoot },
      projectRoot: '/nonexistent/path',
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(1);
    expect(stderr.text()).toContain('AUDIT-20260529-22');
  });
});

// Phase 15 Task 1 — CLI-level tests for the workplan-aware refusal modes
// + the new allow-when-scoped-as-next mode. Workplan presence on disk
// determines which mode the gate emits; these tests verify the CLI's
// refusal-message rendering for each.

describe('runCheckOpenFindings — Phase 15 workplan-aware refusal modes', () => {
  function makeRepoWithWorkplan(
    name: string,
    auditLog: string,
    workplan: string,
  ): string {
    const repoRoot = join(workDir, name);
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
    writeFileSync(join(featureDir, 'workplan.md'), workplan, 'utf8');
    return repoRoot;
  }

  function openEntry(id: string): string {
    return [
      `### ${id} — finding`,
      '',
      `Finding-ID: ${id}`,
      'Status: open',
      'Severity: low',
      `Surface: src/${id}.ts`,
      '',
      'Body.',
      '',
    ].join('\n');
  }

  it('allows (open-findings-scoped-as-next) when the next unchecked task is the fix', async () => {
    const repoRoot = makeRepoWithWorkplan(
      'p15-allowed',
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01'),
      '# Workplan\n\n## Phase 99\n\n### Task 99.1: Fix it (fix-finding-AUDIT-20260530-01)\n\n- [ ] Step 1: write failing test\n\n**Acceptance Criteria:**\n\n- [ ] Closes AUDIT-20260530-01\n',
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(0);
    expect(stderr.text()).toMatch(/scoped as the next workplan tasks|proceed/i);
  });

  it('refuses with non-fix-task-before-fix-tasks message when an unrelated task is first', async () => {
    const repoRoot = makeRepoWithWorkplan(
      'p15-nonfix',
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01'),
      '# Workplan\n\n## Phase 99\n\n### Task 99.1: Some other work\n\n- [ ] Step 1: do thing\n\n### Task 99.2: Fix it (fix-finding-AUDIT-20260530-01)\n\n- [ ] Step 1: write failing test\n',
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(1);
    const msg = stderr.text();
    expect(msg).toMatch(/NOT a \(fix-finding/);
    expect(msg).toMatch(/reorder the workplan/);
    expect(msg).toContain('AUDIT-20260530-01');
    expect(msg).toContain('Some other work');
  });

  it('refuses with coverage-mismatch (missing) when a finding has no scoped fix-task', async () => {
    const repoRoot = makeRepoWithWorkplan(
      'p15-missing',
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01') + openEntry('AUDIT-20260530-02'),
      '# Workplan\n\n## Phase 99\n\n### Task 99.1: Fix one (fix-finding-AUDIT-20260530-01)\n\n- [ ] Step 1\n',
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(1);
    const msg = stderr.text();
    expect(msg).toContain('Missing:');
    expect(msg).toContain('AUDIT-20260530-02');
    expect(msg).toMatch(/promote-findings/);
  });

  it('refuses with coverage-mismatch (extra) when scoped fix-tasks reference unopen IDs', async () => {
    const repoRoot = makeRepoWithWorkplan(
      'p15-extra',
      '# Audit Log\n\n' + openEntry('AUDIT-20260530-01'),
      '# Workplan\n\n## Phase 99\n\n### Task 99.1: Fix wrong (fix-finding-AUDIT-20260530-99)\n\n- [ ] Step 1\n',
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckOpenFindings({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    });

    expect(exit).toBe(1);
    const msg = stderr.text();
    expect(msg).toContain('Missing:');
    expect(msg).toContain('AUDIT-20260530-01');
    expect(msg).toContain('Extras:');
    expect(msg).toContain('AUDIT-20260530-99');
    expect(msg).toMatch(/flip those audit-log entries|remove the stale/);
  });
});
