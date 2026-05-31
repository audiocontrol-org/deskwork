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

  it('reports NOT dampened when an older run within the threshold window has HIGH findings (N-quiet rule isolated)', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['high', 'low']),
      '',
      barrageSection('2026-06-02', 'run-b', ['medium', 'low']),
    ].join('\n');
    // Threshold=2: last 2 runs are run-a + run-b. run-a has HIGH so
    // N-quiet rule doesn't engage. run-b has MEDIUM so single-run
    // rule doesn't engage either. Net: not dampened.
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

  it('threshold override (threshold=3 requires 3 consecutive quiet runs) — N-quiet rule isolated', () => {
    const log = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'run-a', ['high']),
      '',
      barrageSection('2026-06-02', 'run-b', ['low']),
      '',
      barrageSection('2026-06-03', 'run-c', ['medium', 'low']),
    ].join('\n');
    // Last 3 = run-a + run-b + run-c. run-a has HIGH → N-quiet
    // (3 needed) doesn't engage. run-c has MEDIUM → single-run rule
    // doesn't engage either. Net: not dampened.
    const result = checkBarrageDampener({ auditLogText: log, threshold: 3 });
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
    // Use a MEDIUM in the most-recent run so the single-run rule
    // doesn't engage and we can isolate the N-quiet rule's
    // open-HIGH-counts behavior.
    const cleanWithMediumBarrage = barrageSection('2026-06-02', 'clean-run', ['medium']);
    const log = ['# Audit Log', '', openHighBarrage, '', cleanWithMediumBarrage].join('\n');
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

  /**
   * Operator directive 2026-05-31 (post v0.29.1):
   *   "I'd like to try a policy where, if there are 0 HIGH and 0
   *    MEDIUM issues on any audit barrage, we engage the dampener.
   *    This is in addition to the two consecutive 0 HIGH barrage
   *    runs."
   *
   * Second engagement rule: any single most-recent run with 0 HIGH+
   * AND 0 MEDIUM open findings dampens. Stiffer than the N-quiet
   * rule (catches "this run is essentially clean" rather than "the
   * last N runs were quiet on HIGH+").
   */
  describe('single-run-no-medium-or-high rule (operator directive 2026-05-31)', () => {
    it('engages on a single run with 0 HIGH+ AND 0 MEDIUM (LOW + informational only)', () => {
      const log = ['# Audit Log', '', barrageSection('2026-06-01', 'run-a', ['low', 'informational'])].join('\n');
      const result = checkBarrageDampener({ auditLogText: log });
      expect(result.dampened).toBe(true);
    });

    it('does NOT engage on a single run with 0 HIGH+ but ≥1 MEDIUM', () => {
      const log = ['# Audit Log', '', barrageSection('2026-06-01', 'run-a', ['medium', 'low'])].join('\n');
      const result = checkBarrageDampener({ auditLogText: log });
      // N-quiet rule: only 1 run, threshold=2 → not enough.
      // Single-run rule: has a MEDIUM → doesn't qualify.
      expect(result.dampened).toBe(false);
    });

    it('does NOT engage on a single run with HIGH+', () => {
      const log = ['# Audit Log', '', barrageSection('2026-06-01', 'run-a', ['high'])].join('\n');
      const result = checkBarrageDampener({ auditLogText: log });
      expect(result.dampened).toBe(false);
    });

    it('engages on a run with 0 findings at all (vacuously clean)', () => {
      const log = ['# Audit Log', '', barrageSection('2026-06-01', 'run-a', [])].join('\n');
      const result = checkBarrageDampener({ auditLogText: log });
      expect(result.dampened).toBe(true);
    });

    it('still engages via the N-quiet rule when the most recent run has MEDIUM but the consecutive-quiet streak holds', () => {
      const log = [
        '# Audit Log',
        '',
        barrageSection('2026-06-01', 'run-a', ['low']),
        '',
        barrageSection('2026-06-02', 'run-b', ['medium', 'low']),
      ].join('\n');
      // N-quiet rule: last 2 are run-a + run-b. Both have 0 HIGH+.
      // Engages via N-quiet (the MEDIUM doesn't matter for that rule).
      const result = checkBarrageDampener({ auditLogText: log });
      expect(result.dampened).toBe(true);
    });

    it('MEDIUM findings whose Status is non-open do NOT count toward the single-run rule (slush-pile semantic)', () => {
      const slushedMediumBarrage = [
        '## 2026-06-01 — audit-barrage lift (slushed-medium-run)',
        '',
        '### AUDIT-20260601-01 — Slushed medium',
        '',
        'Finding-ID: AUDIT-20260601-01',
        'Status:     acknowledged-slush-pile-2026-06-01',
        'Severity:   medium',
        '',
        'Body.',
        '',
      ].join('\n');
      const log = ['# Audit Log', '', slushedMediumBarrage].join('\n');
      const result = checkBarrageDampener({ auditLogText: log });
      // The medium is slushed → no open HIGH+ or MEDIUM → single-run
      // rule engages.
      expect(result.dampened).toBe(true);
    });

    it('reason string distinguishes which rule triggered the dampener', () => {
      const log = ['# Audit Log', '', barrageSection('2026-06-01', 'run-a', ['low'])].join('\n');
      const result = checkBarrageDampener({ auditLogText: log });
      expect(result.dampened).toBe(true);
      // Engaged via single-run rule (only 1 run, but it had 0
      // HIGH+ AND 0 MEDIUM). Reason should distinguish from the
      // N-consecutive case.
      expect(result.reason.toLowerCase()).toMatch(/single|medium|stiffer|no high.+no medium|0 medium/);
    });
  });
});
