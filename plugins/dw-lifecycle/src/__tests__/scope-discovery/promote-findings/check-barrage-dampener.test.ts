/**
 * Phase 15 Task 7 — dampener library tests.
 *
 * The dampener prevents the /dwi end-of-task audit-barrage hook from
 * firing when the audit-process has gone quiet: the last N consecutive
 * barrage runs all surfaced 0 HIGH+ findings. Operator decision per
 * the Phase 15 dogfood (rounds 1-7 demonstrated the convergence
 * pattern; an auditor agent will always find SOMETHING; the dampener
 * lets the loop self-stop on nitpicks while still firing on every
 * real-bug barrage).
 *
 * The library is pure-fn (audit-log text → decision); the CLI shim +
 * SKILL.md prose are downstream.
 */

import { describe, it, expect } from 'vitest';
import { checkBarrageDampener } from '../../../scope-discovery/promote-findings/check-barrage-dampener.js';

function barrageSection(
  date: string,
  runDirBasename: string,
  severities: ReadonlyArray<'blocking' | 'high' | 'medium' | 'low' | 'informational'>,
): string {
  const entries = severities.map(
    (sev, i) =>
      [
        `### AUDIT-${date.replace(/-/g, '')}-${String(i + 1).padStart(2, '0')} — Entry ${i}`,
        '',
        `Finding-ID: AUDIT-${date.replace(/-/g, '')}-${String(i + 1).padStart(2, '0')}`,
        'Status:     open',
        `Severity:   ${sev}`,
        'Surface:    src/x.ts:10',
        '',
        'Body.',
        '',
      ].join('\n'),
  );
  return [
    `## ${date} — audit-barrage lift (${runDirBasename})`,
    '',
    ...entries,
  ].join('\n');
}

describe('checkBarrageDampener — Phase 15 Task 7', () => {
  it('reports NOT dampened when there are zero barrage sections', () => {
    const result = checkBarrageDampener({ auditLogText: '# Audit Log\n\n## Some other section\n' });
    expect(result.dampened).toBe(false);
    expect(result.recentRunCounts).toEqual([]);
  });

  it('reports NOT dampened with one quiet run (threshold=2)', () => {
    const log = ['# Audit Log', '', barrageSection('2026-06-01', 'run-a', ['low', 'medium'])].join('\n\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(false);
    expect(result.recentRunCounts).toHaveLength(1);
    expect(result.recentRunCounts[0]?.highPlusCount).toBe(0);
  });

  it('reports DAMPENED with two consecutive quiet runs (threshold=2)', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['low', 'medium']),
      '',
      barrageSection('2026-06-02', 'run-b', ['low', 'low', 'informational']),
    ].join('\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(true);
    expect(result.recentRunCounts).toHaveLength(2);
    expect(result.recentRunCounts.every((r) => r.highPlusCount === 0)).toBe(true);
  });

  it('reports NOT dampened when the most recent run has HIGH findings', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['low']),
      '',
      barrageSection('2026-06-02', 'run-b', ['high', 'medium']),
    ].join('\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(false);
  });

  it('reports NOT dampened when an older run within the threshold window has HIGH findings', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['high', 'low']),
      '',
      barrageSection('2026-06-02', 'run-b', ['low']),
    ].join('\n');
    // Threshold=2: last 2 runs are run-a + run-b. run-a has HIGH.
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(false);
  });

  it('treats blocking as HIGH+ (severity floor includes blocking)', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['low']),
      '',
      barrageSection('2026-06-02', 'run-b', ['blocking']),
    ].join('\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(false);
    expect(result.recentRunCounts[0]?.highPlusCount).toBeGreaterThan(0);
  });

  it('takes only the LAST `threshold` sections; older runs do not bring the dampener back', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['high', 'high']),
      '',
      barrageSection('2026-06-02', 'run-b', ['low']),
      '',
      barrageSection('2026-06-03', 'run-c', ['low']),
    ].join('\n');
    // Threshold=2: last 2 are run-b (0 HIGH) + run-c (0 HIGH). Dampened.
    // run-a is older and out of window.
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(true);
    expect(result.recentRunCounts).toHaveLength(2);
  });

  it('threshold override (threshold=3 requires 3 consecutive quiet runs)', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['high']),
      '',
      barrageSection('2026-06-02', 'run-b', ['low']),
      '',
      barrageSection('2026-06-03', 'run-c', ['low']),
    ].join('\n');
    const result = checkBarrageDampener({ auditLogText: log, threshold: 3 });
    // Last 3 = run-a + run-b + run-c. run-a has HIGH → not dampened.
    expect(result.dampened).toBe(false);
  });

  it('threshold=1 dampens after a single quiet run', () => {
    const log = ['# Audit Log', '', barrageSection('2026-06-01', 'run-a', ['low'])].join('\n');
    const result = checkBarrageDampener({ auditLogText: log, threshold: 1 });
    expect(result.dampened).toBe(true);
  });

  it('only counts severities WITHIN each barrage section, not other lifts/sections', () => {
    // Sections that are NOT audit-barrage lifts shouldn't count.
    const log = [
      '# Audit Log',
      '',
      '## 2026-06-01 — Some other section heading (not a barrage)',
      '',
      '### AUDIT-20260601-99 — Manual entry',
      '',
      'Finding-ID: AUDIT-20260601-99',
      'Status:     open',
      'Severity:   high',
      '',
      'Body.',
      '',
      barrageSection('2026-06-02', 'run-a', ['low']),
      '',
      barrageSection('2026-06-03', 'run-b', ['low']),
    ].join('\n');
    // Manual high-severity entry isn't inside a barrage section.
    // Last 2 barrage sections both quiet → dampened.
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(true);
  });

  it('HIGH-severity findings whose Status is no longer `open` do NOT count (slush-pile semantic)', () => {
    // A HIGH-severity finding that the operator has already
    // dispositioned (acknowledged-slush, fixed-<sha>, etc.) is
    // unaddressed → it should NOT keep the dampener from firing.
    const slushedBarrage = [
      '## 2026-06-01 — audit-barrage lift (slushed-run)',
      '',
      '### AUDIT-20260601-01 — Slushed high finding',
      '',
      'Finding-ID: AUDIT-20260601-01',
      'Status:     acknowledged-slush-pile',
      'Severity:   high',
      'Surface:    src/x.ts:10',
      '',
      'Body.',
      '',
    ].join('\n');
    const cleanBarrage = barrageSection('2026-06-02', 'clean-run', ['low']);
    const log = ['# Audit Log', '', slushedBarrage, '', cleanBarrage].join('\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(true);
    // The slushed run is counted but its HIGH+ count is 0 (the
    // finding has a non-open status).
    expect(result.recentRunCounts.find((r) => r.runDirBasename === 'slushed-run')?.highPlusCount).toBe(0);
  });

  it('HIGH-severity findings whose Status is `open` DO count (un-slushed semantic)', () => {
    const openHighBarrage = [
      '## 2026-06-01 — audit-barrage lift (open-high-run)',
      '',
      '### AUDIT-20260601-02 — Open high finding',
      '',
      'Finding-ID: AUDIT-20260601-02',
      'Status:     open',
      'Severity:   high',
      'Surface:    src/x.ts:10',
      '',
      'Body.',
      '',
    ].join('\n');
    const cleanBarrage = barrageSection('2026-06-02', 'clean-run', ['low']);
    const log = ['# Audit Log', '', openHighBarrage, '', cleanBarrage].join('\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(false);
    expect(result.recentRunCounts.find((r) => r.runDirBasename === 'open-high-run')?.highPlusCount).toBe(1);
  });

  it('fixed-<sha> findings also do not count toward HIGH+', () => {
    const fixedBarrage = [
      '## 2026-06-01 — audit-barrage lift (fixed-run)',
      '',
      '### AUDIT-20260601-03 — Fixed high finding',
      '',
      'Finding-ID: AUDIT-20260601-03',
      'Status:     fixed-deadbeef',
      'Severity:   high',
      'Surface:    src/x.ts:10',
      '',
      'Body.',
      '',
    ].join('\n');
    const cleanBarrage = barrageSection('2026-06-02', 'clean-run', ['low']);
    const log = ['# Audit Log', '', fixedBarrage, '', cleanBarrage].join('\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(true);
  });

  it('reason string names the threshold + the consecutive quiet count', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['low']),
      '',
      barrageSection('2026-06-02', 'run-b', ['low']),
    ].join('\n');
    const result = checkBarrageDampener({ auditLogText: log });
    expect(result.dampened).toBe(true);
    expect(result.reason).toMatch(/2/);
    expect(result.reason.toLowerCase()).toMatch(/quiet|consecutive|0 high/);
  });
});
