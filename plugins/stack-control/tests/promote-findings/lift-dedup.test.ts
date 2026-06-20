/**
 * specs/029-govern-operability — Phase 4 / US4 (T023, RED → T024 GREEN).
 *
 * FR-016: lifted findings MUST be deduped across runs by
 * `findingSignature(heading, surface)` so convergence iterations do not multiply
 * near-duplicate tasks (≤1 entry per signature across N runs). A second lift of
 * the SAME finding (same signature, possibly a different reported line range)
 * must NOT append a second audit-log entry for that signature.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { checkBarrageDampener } from '../../src/scope-discovery/promote-findings/check-barrage-dampener.js';

const HEADING = 'race in the watchdog kill path';
const FILE = 'src/spawn-cli.ts';

function installation(): string {
  const repo = mkdtempSync(join(tmpdir(), 'lift-dedup-'));
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

/** A run-dir containing one model file reporting the finding at `surfaceLine`. */
function makeRunDir(
  repo: string,
  stamp: string,
  surfaceLine: string,
  severity = 'medium',
): string {
  const runDir = join(repo, '.stack-control', 'audit-runs', stamp);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, 'claude.md'),
    [
      `### ${HEADING}`,
      '',
      'Finding-ID: AUDIT-BARRAGE-claude-01',
      'Status: open',
      `Severity: ${severity}`,
      `Surface: ${FILE}:${surfaceLine}`,
      '',
      'The same race.',
      '',
    ].join('\n'),
    'utf8',
  );
  return runDir;
}

/** A run-dir whose only model file reports a clean barrage (no findings). */
function makeCleanRunDir(repo: string, stamp: string): string {
  const runDir = join(repo, '.stack-control', 'audit-runs', stamp);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, 'claude.md'),
    ['### no findings', '', 'Status: clean', '', 'Nothing surfaced.', ''].join('\n'),
    'utf8',
  );
  return runDir;
}

function countSignatureEntries(log: string): number {
  // FR-016 invariant is "≤1 backlog TASK per signature" — so count ONLY the
  // backlog-bound `### AUDIT-<date>-NN — <heading>` entries (the entries the
  // slush path migrates to the backlog). A re-report block (`### <heading>` with
  // `Status: re-reported`, no AUDIT id) is deliberately NOT counted: it carries
  // the run's severity for the dampener but creates no task (graduation-safety
  // fix — a deduped persistent OPEN HIGH must still be visible to the dampener).
  const m = log.match(/^### AUDIT-\d{8}-\d+ — race in the watchdog kill path/gim);
  return m === null ? 0 : m.length;
}

describe('FR-016: lift dedups a finding across runs by signature (US4, T023)', () => {
  it('the SAME finding lifted across 2 runs produces ≤1 audit-log entry for its signature', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    // Run 1: reports the finding at one line.
    const run1 = makeRunDir(repo, '20260620T100000000Z-feat-after_clarify', '89');
    // Run 2: the SAME finding, a different line range (same signature).
    const run2 = makeRunDir(repo, '20260620T110000000Z-feat-after_clarify', '90-92');
    try {
      const r1 = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run1,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r1.status).toBe(0);
      expect(countSignatureEntries(readFileSync(log, 'utf8'))).toBe(1);

      const r2 = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run2,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r2.status).toBe(0);
      // The second lift must NOT add a second entry for the same signature.
      expect(countSignatureEntries(readFileSync(log, 'utf8'))).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('graduation-safety: a re-reported OPEN HIGH does NOT render a pristine quiet run (US4, US3 SC-001)', () => {
  it('an all-deduped re-run of a still-OPEN HIGH leaves the most-recent section NON-clean to the dampener', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    // Run 1: a NEW HIGH finding → a real audit-log entry at Status: open.
    const run1 = makeRunDir(repo, '20260620T100000000Z-feat-after_clarify', '89', 'high');
    // Run 2: the SAME still-open HIGH re-reported (same signature) — nothing else.
    const run2 = makeRunDir(repo, '20260620T110000000Z-feat-after_clarify', '90-92', 'high');
    try {
      const r1 = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run1,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r1.status).toBe(0);
      // After run 1 the dampener must NOT be engaged (an open HIGH surfaced).
      expect(checkBarrageDampener({ auditLogText: readFileSync(log, 'utf8') }).dampened).toBe(false);

      const r2 = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run2,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r2.status).toBe(0);
      const after = readFileSync(log, 'utf8');
      // FR-016 still holds: ≤1 backlog-bound `### AUDIT-…` entry for the signature.
      expect(countSignatureEntries(after)).toBe(1);
      // The crux: run 2 recorded a SECOND lift section (the dampener counts
      // sections), and that most-recent section carries a `Severity: high` line
      // re-reporting the persistent finding — so the single-run-clean RAW rule
      // sees rawHighPlusCount >= 1 and does NOT graduate.
      const sections = after.match(/^## .* — audit-barrage lift \(/gim);
      expect(sections).not.toBeNull();
      expect(sections!.length).toBe(2);
      const dampener = checkBarrageDampener({ auditLogText: after });
      expect(dampener.dampened).toBe(false);
      // And the most-recent run's RAW HIGH count is the load-bearing signal.
      expect(dampener.recentRunCounts[0]?.rawHighPlusCount ?? 0).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('the re-report section creates NO duplicate backlog-bound entry (FR-016 — ≤1 task per signature)', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    // Three runs of the SAME open HIGH: one new entry, two re-reports.
    const run1 = makeRunDir(repo, '20260620T100000000Z-feat-after_clarify', '89', 'high');
    const run2 = makeRunDir(repo, '20260620T110000000Z-feat-after_clarify', '90', 'high');
    const run3 = makeRunDir(repo, '20260620T120000000Z-feat-after_clarify', '91', 'high');
    try {
      for (const rd of [run1, run2, run3]) {
        const r = runCli([
          'audit-barrage-lift', '--feature', 'feat', '--run-dir', rd,
          '--at', repo, '--date', '20260620', '--apply',
        ]);
        expect(r.status).toBe(0);
      }
      const after = readFileSync(log, 'utf8');
      // Exactly ONE backlog-bound `### AUDIT-…` entry across the three runs.
      const auditEntries = after.match(/^### AUDIT-\d{8}-\d+ — race in the watchdog kill path/gim);
      expect(auditEntries).not.toBeNull();
      expect(auditEntries!.length).toBe(1);
      // The dampener stays NOT dampened across all three runs (persistent HIGH).
      expect(checkBarrageDampener({ auditLogText: after }).dampened).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('graduation-safety: a fixed-<sha>-only run and a genuinely-empty run still record a clean/quiet section (FR-008/FR-013)', () => {
  it('a run whose only finding is already fixed-<sha> records a QUIET section (still effectively clean)', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    // Seed the audit-log with this signature ALREADY resolved (fixed-<sha>).
    writeFileSync(
      log,
      [
        '# Audit Log — feat',
        '',
        '## 2026-06-19 — audit-barrage lift (prior-run-after_clarify)',
        '',
        '### AUDIT-20260619-01 — race in the watchdog kill path',
        '',
        'Finding-ID: AUDIT-20260619-01',
        'Status:     fixed-abc1234',
        'Severity:   high',
        `Surface:    ${FILE}:42`,
        '',
        'body',
        '',
      ].join('\n'),
      'utf8',
    );
    // A run re-reporting only the now-fixed finding.
    const run = makeRunDir(repo, '20260620T100000000Z-feat-after_clarify', '89', 'high');
    try {
      const r = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r.status).toBe(0);
      const after = readFileSync(log, 'utf8');
      // No NEW AUDIT-20260620-NN entry (fixed → not re-lifted, FR-013).
      expect(after).not.toMatch(/AUDIT-20260620-\d+/);
      // A new QUIET section was recorded (the fixed-only run is effectively clean),
      // and it carries ZERO Severity lines, so the dampener treats it as clean.
      const sections = after.match(/^## .* — audit-barrage lift \(/gim);
      expect(sections!.length).toBe(2);
      const mostRecent = checkBarrageDampener({ auditLogText: after }).recentRunCounts[0];
      expect(mostRecent?.rawHighPlusCount ?? 0).toBe(0);
      expect(mostRecent?.rawMediumCount ?? 0).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a genuinely-empty (0-finding) run records a QUIET section the dampener counts as clean', () => {
    const repo = installation();
    const dir = featureDir(repo, 'feat');
    const log = join(dir, 'audit-log.md');
    const run = makeCleanRunDir(repo, '20260620T100000000Z-feat-after_clarify');
    try {
      const r = runCli([
        'audit-barrage-lift', '--feature', 'feat', '--run-dir', run,
        '--at', repo, '--date', '20260620', '--apply',
      ]);
      expect(r.status).toBe(0);
      const after = readFileSync(log, 'utf8');
      const sections = after.match(/^## .* — audit-barrage lift \(/gim);
      expect(sections!.length).toBe(1);
      const mostRecent = checkBarrageDampener({ auditLogText: after }).recentRunCounts[0];
      expect(mostRecent?.rawHighPlusCount ?? 0).toBe(0);
      expect(mostRecent?.rawMediumCount ?? 0).toBe(0);
      // The quiet section has zero Severity lines.
      expect(mostRecent?.totalFindings ?? 0).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
