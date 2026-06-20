/**
 * specs/029-govern-operability — Phase 4 / US4 follow-up (RED first).
 *
 * Cross-model finding (AUDIT-BARRAGE-codex-01 MEDIUM + claude-01 HIGH, phase-2
 * re-govern 2026-06-20): the FR-016 re-report block says a finding is "already
 * tracked" but carried NO durable pointer to the canonical audit-log entry it
 * matched. An operator (or tool) reading the log saw a heading resurface with
 * "already tracked" and had to scan the whole log for matching heading text —
 * fragile (headings drift between model runs) and operationally expensive.
 *
 * The fix threads the matched canonical `AUDIT-NN` id (which the partition ALREADY
 * computes to classify the finding as dedup-suppressed, then discarded) through to
 * the rendered re-report entry as a NON-slushable `Tracked-by:` field. It stays
 * NOT a `Finding-ID:` so the parser still skips the re-report entry (no new
 * trackable id, no duplicate backlog task — FR-016).
 *
 * Also covered: the `resolvedSuppressed` bucket (claude-05 LOW — observability of
 * FR-013-dropped findings) and the mixed-section label (claude-04 MEDIUM — a
 * new+re-report section is machine-scannable).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { partitionLiftableFindings } from '../../src/govern/loop-hygiene.js';

const HEADING = 'race in the watchdog kill path';
const FILE = 'src/spawn-cli.ts';

function installation(): string {
  const repo = mkdtempSync(join(tmpdir(), 'rereport-trace-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  return repo;
}

function featureDir(repo: string, slug: string): string {
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log — ${slug}\n`, 'utf8');
  return dir;
}

function makeRunDir(
  repo: string,
  stamp: string,
  surfaceLine: string,
  severity = 'high',
  heading = HEADING,
  file = FILE,
): string {
  const runDir = join(repo, '.stack-control', 'audit-runs', stamp);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, 'claude.md'),
    [
      `### ${heading}`,
      '',
      'Finding-ID: AUDIT-BARRAGE-claude-01',
      'Status: open',
      `Severity: ${severity}`,
      `Surface: ${file}:${surfaceLine}`,
      '',
      'body.',
      '',
    ].join('\n'),
    'utf8',
  );
  return runDir;
}

describe('partition threads the canonical AUDIT-NN id through dedupSuppressedOpen (codex-01/claude-01)', () => {
  const auditLog = [
    '# Audit Log — feat',
    '',
    '## 2026-06-19 — audit-barrage lift (prior)',
    '',
    `### AUDIT-20260619-07 — ${HEADING}`,
    '',
    'Finding-ID: AUDIT-20260619-07',
    'Status:     open',
    'Severity:   high',
    `Surface:    ${FILE}:42`,
    '',
    'body',
    '',
  ].join('\n');

  it('a re-surfaced already-present OPEN finding carries the matched canonical id', () => {
    const { dedupSuppressedOpen, liftable } = partitionLiftableFindings(
      [{ heading: HEADING, surface: `${FILE}:88` }],
      auditLog,
      () => {},
    );
    expect(liftable).toHaveLength(0);
    expect(dedupSuppressedOpen).toHaveLength(1);
    expect(dedupSuppressedOpen[0]?.canonicalId).toBe('AUDIT-20260619-07');
    expect(dedupSuppressedOpen[0]?.finding.heading).toBe(HEADING);
  });

  it('a fixed-<sha> finding is reported in the resolvedSuppressed bucket (claude-05)', () => {
    const fixedLog = auditLog.replace('Status:     open', 'Status:     fixed-abc1234');
    const { dedupSuppressedOpen, liftable, resolvedSuppressed } = partitionLiftableFindings(
      [{ heading: HEADING, surface: `${FILE}:88` }],
      fixedLog,
      () => {},
    );
    expect(liftable).toHaveLength(0);
    expect(dedupSuppressedOpen).toHaveLength(0);
    expect(resolvedSuppressed).toHaveLength(1);
    expect(resolvedSuppressed[0]?.heading).toBe(HEADING);
  });
});

describe('the re-report block in the audit-log names the canonical entry (end-to-end)', () => {
  it('a pure re-report section carries Tracked-by: <canonical AUDIT-NN>, not a fresh Finding-ID', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    const run1 = makeRunDir(repo, '20260620T100000000Z-feat-after_clarify', '89');
    const run2 = makeRunDir(repo, '20260620T110000000Z-feat-after_clarify', '90');
    try {
      expect(
        runCli(['audit-barrage-lift', '--feature', 'feat', '--run-dir', run1,
          '--at', repo, '--date', '20260620', '--apply']).status,
      ).toBe(0);
      expect(
        runCli(['audit-barrage-lift', '--feature', 'feat', '--run-dir', run2,
          '--at', repo, '--date', '20260620', '--apply']).status,
      ).toBe(0);
      const after = readFileSync(log, 'utf8');
      // The re-report block must point at the canonical id assigned in run 1.
      expect(after).toMatch(/Tracked-by:\s+AUDIT-20260620-01/);
      // …and must NOT mint a second backlog-bound Finding-ID for the same signature.
      const ids = after.match(/^Finding-ID:\s+AUDIT-20260620-\d+/gim) ?? [];
      expect(ids).toHaveLength(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a MIXED section (new + re-report) labels the re-report block (claude-04)', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    // Run 1: finding A (becomes the canonical entry).
    const run1 = makeRunDir(repo, '20260620T100000000Z-feat-after_clarify', '89');
    // Run 2: a NEW finding B (liftable) AND finding A re-surfacing (re-reported).
    const run2 = join(repo, '.stack-control', 'audit-runs', '20260620T110000000Z-feat-after_clarify');
    mkdirSync(run2, { recursive: true });
    writeFileSync(
      join(run2, 'claude.md'),
      [
        `### ${HEADING}`, '', 'Finding-ID: AUDIT-BARRAGE-claude-01', 'Status: open',
        'Severity: high', `Surface: ${FILE}:90`, '', 'body.', '',
        '### a brand new defect over here', '', 'Finding-ID: AUDIT-BARRAGE-claude-02',
        'Status: open', 'Severity: high', 'Surface: src/other.ts:10', '', 'body.', '',
      ].join('\n'),
      'utf8',
    );
    try {
      expect(
        runCli(['audit-barrage-lift', '--feature', 'feat', '--run-dir', run1,
          '--at', repo, '--date', '20260620', '--apply']).status,
      ).toBe(0);
      expect(
        runCli(['audit-barrage-lift', '--feature', 'feat', '--run-dir', run2,
          '--at', repo, '--date', '20260620', '--apply']).status,
      ).toBe(0);
      const after = readFileSync(log, 'utf8');
      // The mixed section's re-report block carries an explanatory label so the
      // two finding categories are distinguishable without per-field parsing.
      expect(after).toMatch(/Re-surfaced persistent finding/i);
      expect(after).toMatch(/Tracked-by:\s+AUDIT-20260620-01/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
