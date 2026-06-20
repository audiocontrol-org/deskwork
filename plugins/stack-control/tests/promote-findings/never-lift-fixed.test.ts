/**
 * specs/029-govern-operability — Phase 4 / US4 (T020, RED → T021 GREEN).
 *
 * FR-013: lift AND slush MUST skip any audit-log finding whose `Status:` is
 * `fixed-<sha>` (in-loop or prior-commit) and create NO backlog task for it.
 *
 * These tests exercise the two surfaces end-to-end through the CLI:
 *   - `audit-barrage-lift --apply`: a run-dir finding whose signature already
 *     carries `Status: fixed-<sha>` in the audit-log is NOT re-appended.
 *   - `slush-findings --apply`: a `fixed-<sha>` finding is never migrated to the
 *     backlog (it is resolved, not parked).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from '../backlog/helpers.js';

const HEADING = 'race in the watchdog kill path';
const FILE = 'src/spawn-cli.ts';
const SHA = 'abc1234';

function installation(): string {
  const repo = mkdtempSync(join(tmpdir(), 'never-lift-fixed-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  return repo;
}

function featureDir(repo: string, slug: string): string {
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** An audit-log entry block with the given status. */
function entry(id: string, status: string, severity: string): string {
  return [
    `### ${id} — ${HEADING}`,
    '',
    `Finding-ID: ${id}`,
    `Status:     ${status}`,
    `Severity:   ${severity}`,
    `Surface:    ${FILE}:42`,
    '',
    'body text',
    '',
  ].join('\n');
}

describe('FR-013: lift skips a fixed-<sha> finding (US4, T020)', () => {
  it('a run-dir finding whose signature is already fixed-<sha> in the audit-log is NOT re-lifted', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    // Seed an audit-log where this signature is already resolved.
    writeFileSync(
      join(dir, 'audit-log.md'),
      [
        '# Audit Log — feat',
        '',
        '## 2026-06-19 — audit-barrage lift (prior-run-after_clarify)',
        '',
        entry('AUDIT-20260619-01', `fixed-${SHA}`, 'high'),
      ].join('\n'),
      'utf8',
    );
    // A run-dir whose model file re-reports the same finding (same heading+file).
    const runDir = join(repo, '.stack-control', 'audit-runs', '20260620T100000000Z-feat-after_clarify');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'claude.md'),
      [
        `### ${HEADING}`,
        '',
        'Finding-ID: AUDIT-BARRAGE-claude-01',
        'Status: open',
        'Severity: high',
        `Surface: ${FILE}:89`,
        '',
        'The same race, re-reported.',
        '',
      ].join('\n'),
      'utf8',
    );
    try {
      const r = runCli([
        'audit-barrage-lift',
        '--feature',
        'feat',
        '--run-dir',
        runDir,
        '--at',
        repo,
        '--date',
        '20260620',
        '--apply',
      ]);
      expect(r.status).toBe(0);
      const log = readFileSync(join(dir, 'audit-log.md'), 'utf8');
      // No NEW AUDIT-20260620-NN entry was appended for this fixed finding.
      expect(log).not.toMatch(/AUDIT-20260620-\d+/);
      // The fixed entry is preserved verbatim.
      expect(log).toMatch(new RegExp(`Status:\\s+fixed-${SHA}`));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('FR-013: slush skips a fixed-<sha> finding (US4, T020)', () => {
  it('a fixed-<sha> finding is never migrated to the backlog (0 tasks)', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    // Two 0-HIGH runs so the dampener engages; the medium would normally migrate,
    // but it is fixed-<sha> so slush must skip it (0 backlog tasks).
    writeFileSync(
      join(dir, 'audit-log.md'),
      [
        '# Audit Log — feat',
        '',
        '## 2026-06-19 — audit-barrage lift (run-1-after_clarify)',
        '',
        entry('AUDIT-20260619-01', `fixed-${SHA}`, 'medium'),
        '',
        '## 2026-06-20 — audit-barrage lift (run-2-after_clarify)',
        '',
        entry('AUDIT-20260620-02', `fixed-${SHA}`, 'medium'),
      ].join('\n'),
      'utf8',
    );
    const backlog = tmpBacklog();
    try {
      const r = runCli(
        [
          'slush-findings',
          '--feature',
          'feat',
          '--at',
          repo,
          '--checkpoint',
          'after_clarify',
          '--scope',
          'all',
          '--slush-date',
          '2026-06-20',
          '--apply',
        ],
        { env: { STACKCTL_BACKLOG_DIR: backlog } },
      );
      expect(r.status).toBe(0);
      expect(createBacklogBackend({ cwd: backlog }).list()).toHaveLength(0);
      const log = readFileSync(join(dir, 'audit-log.md'), 'utf8');
      expect(log).not.toMatch(/migrated-to-backlog/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
