// specs/015-audit-protocol-convergence — T030/T031 (US6, SC-008 / FR-010): pin
// the dampener's RAW-severity counting (#432 / AUDIT-20260608-01) so the
// slush-before-dampener collapse cannot be silently reintroduced.
//
// The dampener counts what each run RAW-SURFACED by `Severity:` line, regardless
// of `Status:`:
//   - branch (a) single-run-clean needs rawHighPlus === 0 AND rawMedium === 0 —
//     a MEDIUM later slushed (acknowledged-slush-pile) STILL counts, so the
//     branch does NOT engage on a slushed run.
//   - branch (b) two-consecutive-quiet needs each run's rawHighPlus === 0 — a
//     HIGH later marked fixed-<sha> STILL counts the run as non-0-HIGH.
//
// MUTATION CHECK (T031): this suite passes against the CURRENT code unchanged. It
// goes RED if `check-barrage-dampener.ts` is reverted to OPEN counting — i.e. if
// `consecutiveQuietEngages` reads `r.highPlusCount` instead of `r.rawHighPlusCount`,
// or `singleRunCleanEngages` reads `mostRecent.mediumCount` / `.highPlusCount`
// instead of the `raw*` fields. Under that revert the slushed MED / fixed HIGH
// would read as 0-open and both branches would falsely engage — the exact #432
// collapse this guard prevents.

import { describe, it, expect } from 'vitest';
import { checkBarrageDampener } from '../../../scope-discovery/promote-findings/check-barrage-dampener.js';
import { renderQuietSection } from '../../../subcommands/audit-barrage-lift-render.js';

function section(runLabel: string, entries: string): string {
  return `## 2026-06-11 — audit-barrage lift (${runLabel})\n\n${entries}`;
}

function entry(id: string, severity: string, status: string): string {
  return `### ${id}\n\nFinding-ID: ${id}\nStatus:     ${status}\nSeverity:   ${severity}\nSurface:    x.ts:1\n\nBody.\n`;
}

describe('dampener RAW counting regression guard (US6 / SC-008)', () => {
  it('branch (a): a run whose only MEDIUM was slushed does NOT engage single-run-clean', () => {
    // One most-recent run that raw-surfaced a MEDIUM later flipped to slush.
    const log = ['# Audit Log', '', section('run-1-after_clarify', entry('AUDIT-1', 'medium', 'acknowledged-slush-pile TASK-9'))].join('\n');
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // RAW count includes the slushed MEDIUM → single-run-clean must NOT engage.
    // (OPEN-counting revert would read 0 MEDIUM and falsely dampen — SC-008.)
    expect(r.dampened).toBe(false);
    expect(r.recentRunCounts[0]!.rawMediumCount).toBe(1);
    expect(r.recentRunCounts[0]!.mediumCount).toBe(0); // open count IS 0 — proves raw != open here
  });

  it('branch (b): a run whose HIGH was fixed between runs still counts as non-0-HIGH', () => {
    const log = [
      '# Audit Log',
      '',
      section('run-older-after_clarify', entry('AUDIT-0', 'low', 'open')),
      '',
      section('run-recent-after_clarify', entry('AUDIT-1', 'high', 'fixed-abc1234')),
    ].join('\n');
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // The recent run RAW-surfaced a HIGH → two-consecutive-quiet must NOT engage,
    // and single-run-clean must NOT engage. (OPEN-counting revert would read the
    // fixed HIGH as 0-open and falsely dampen — SC-008.)
    expect(r.dampened).toBe(false);
    expect(r.recentRunCounts[0]!.rawHighPlusCount).toBe(1);
    expect(r.recentRunCounts[0]!.highPlusCount).toBe(0); // open count IS 0 — proves raw != open here
  });

  it('positive control: two genuinely-clean (0 HIGH, 0 MED open AND raw) runs DO dampen', () => {
    const log = [
      '# Audit Log',
      '',
      section('run-clean-1-after_clarify', entry('AUDIT-0', 'low', 'open')),
      '',
      section('run-clean-2-after_clarify', entry('AUDIT-1', 'low', 'open')),
    ].join('\n');
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.dampened).toBe(true);
  });

  // claude-20260612-r3 (operator bug): the lift now records a QUIET section for a
  // fully-clean run (0 findings of ANY severity). This proves the recorded section
  // makes the dampener engage — where before, with NO section, the prior HIGH stayed
  // the most-recent section forever and the gate could never reach OPEN.
  it('a real renderQuietSection after a HIGH run DAMPENS (single-run-clean: 0 HIGH+ AND 0 MEDIUM)', () => {
    const log = [
      '# Audit Log',
      '',
      section('run-with-high-after_clarify', entry('AUDIT-0', 'high', 'open')),
      '',
      renderQuietSection('20260612', 'run-fully-clean-after_clarify'),
    ].join('\n');
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // The most-recent section is the quiet run: 0 HIGH+, 0 MEDIUM → Rule 2 engages.
    expect(r.recentRunCounts[0]!.rawHighPlusCount).toBe(0);
    expect(r.recentRunCounts[0]!.rawMediumCount).toBe(0);
    expect(r.dampened).toBe(true);
  });

  it('regression: the SAME history WITHOUT the quiet section stays BLOCKED (the bug)', () => {
    // Before the fix a fully-clean run wrote nothing, so the HIGH section remained
    // the most-recent (and only) section — the dampener could never engage.
    const log = [
      '# Audit Log',
      '',
      section('run-with-high-after_clarify', entry('AUDIT-0', 'high', 'open')),
    ].join('\n');
    const r = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    expect(r.dampened).toBe(false);
  });
});
