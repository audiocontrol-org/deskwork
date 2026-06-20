/**
 * specs/029-govern-operability — Phase 2 / US2 (T011, RED).
 *
 * FR-007: a barrage run that contains a DEGRADED lane MUST NOT be counted as a
 * quiet/clean run by the convergence dampener — even when its surviving lanes
 * happen to surface 0 HIGH+ findings (the killed lanes simply produced
 * nothing; absence over a degraded fleet is not a clean signal).
 *
 * FR-008: a fully-HEALTHY run with zero findings MUST still be counted as a
 * quiet run (no regression to the clean-convergence path).
 *
 * The dampener reads ONLY the audit-log text, so the degraded signal is carried
 * IN the lift section as a `Fleet: DEGRADED …` marker line (the lift writes it
 * when produced < configured). These tests drive the real `checkBarrageDampener`
 * against literal audit-log sections — the dampener's marker-reading contract.
 */

import { describe, expect, it } from 'vitest';
import { checkBarrageDampener } from '../../src/scope-discovery/promote-findings/check-barrage-dampener.js';

const HEADER = '---\nslug: feat\ntargetVersion: ""\n---\n\n# Audit log — feat\n';

/** A lift section over a DEGRADED fleet whose surviving lane found only a MEDIUM (0 HIGH+). */
function degradedSection(runBasename: string, date: string): string {
  return [
    `## ${date} — audit-barrage lift (${runBasename})`,
    '',
    `_Fleet: DEGRADED (produced 1 of 2 configured) — this run is NOT counted as a quiet run by the convergence dampener (FR-007)._`,
    '',
    `### AUDIT-${date.replace(/-/g, '')}-01 — a surviving-lane medium`,
    '',
    `Finding-ID: AUDIT-${date.replace(/-/g, '')}-01`,
    `Status:     open`,
    `Severity:   medium`,
    `Surface:    src/x.ts:1`,
    '',
    'a medium finding from the one surviving lane',
    '',
  ].join('\n');
}

/** A clean lift section over a HEALTHY fleet (0 HIGH+, 0 MEDIUM, 0 total). */
function healthyQuietSection(runBasename: string, date: string): string {
  return [
    `## ${date} — audit-barrage lift (${runBasename})`,
    '',
    `_No findings surfaced — a clean barrage run over a healthy fleet (0 HIGH+, 0 MEDIUM, 0 total)._`,
    '',
  ].join('\n');
}

/** A lift section with a real HIGH finding. */
function highSection(runBasename: string, date: string): string {
  return [
    `## ${date} — audit-barrage lift (${runBasename})`,
    '',
    `### AUDIT-${date.replace(/-/g, '')}-01 — a real high`,
    '',
    `Finding-ID: AUDIT-${date.replace(/-/g, '')}-01`,
    `Status:     open`,
    `Severity:   high`,
    `Surface:    src/y.ts:1`,
    '',
    'a real high finding',
    '',
  ].join('\n');
}

describe('dampener: degraded run is never a quiet run (US2, FR-007/008)', () => {
  it('flags a degraded section as degraded and does not let it dampen (FR-007)', () => {
    const log = `${HEADER}\n${highSection('run-high', '2026-06-20')}\n\n${degradedSection('run-degraded', '2026-06-21')}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.recentRunCounts[0]?.degraded).toBe(true);
    expect(r.dampened).toBe(false);
  });

  it('two consecutive DEGRADED 0-HIGH runs still do NOT dampen (FR-007)', () => {
    const log = `${HEADER}\n${degradedSection('run-deg-1', '2026-06-20')}\n\n${degradedSection('run-deg-2', '2026-06-21')}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.dampened).toBe(false);
  });

  it('two consecutive HEALTHY zero-finding (quiet) runs DO dampen (FR-008 — no regression)', () => {
    const log = `${HEADER}\n${healthyQuietSection('run-clean-1', '2026-06-20')}\n\n${healthyQuietSection('run-clean-2', '2026-06-21')}\n`;
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.dampened).toBe(true);
    expect(r.recentRunCounts.every((c) => c.degraded === false)).toBe(true);
  });

  it('a single HEALTHY pristine run dampens; a single DEGRADED run does not (FR-007/008)', () => {
    expect(
      checkBarrageDampener({
        auditLogText: `${HEADER}\n${healthyQuietSection('run-clean', '2026-06-20')}\n`,
        threshold: 2,
      }).dampened,
    ).toBe(true);
    expect(
      checkBarrageDampener({
        auditLogText: `${HEADER}\n${degradedSection('run-degraded', '2026-06-20')}\n`,
        threshold: 2,
      }).dampened,
    ).toBe(false);
  });
});
