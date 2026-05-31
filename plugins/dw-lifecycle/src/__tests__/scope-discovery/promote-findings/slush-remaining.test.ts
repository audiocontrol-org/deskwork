/**
 * Phase 15 Task 7 — slush-remaining library tests.
 *
 * The `slush-remaining` library implements the operator's directive:
 *   "we should address all of the auditors' findings, but when we've
 *    gone two consecutive audits with 0 high issues, we can bin the
 *    smaller items into the slush pile."
 *
 * Mechanics (post Issue #380):
 *   1. Refuse to run unless the dampener is engaged (last N runs all
 *      had 0 HIGH+ open findings, OR the single-run rule fires).
 *   2. When engaged: flip `Status: open` MED/LOW/INFO findings within
 *      the MOST RECENT audit-barrage lift section to
 *      `Status: acknowledged-slush-pile-<YYYY-MM-DD>`. HIGHs are NEVER
 *      slushed (severity filter, per SKILL.md invariant).
 *   3. ALSO flip all `- [ ]` checkboxes in the corresponding workplan
 *      fix-finding task blocks → `- [x]`, so the implement-skill
 *      doesn't try to pick them up as next work.
 *
 * The `scope: 'all'` opt-in walks every barrage section in the
 * audit-log (legacy pre-#380 behavior) and is retained as a
 * guardrail-test surface for the severity filter.
 *
 * Library is pure-fn (text in → text out); the CLI shim is
 * downstream.
 */

import { describe, it, expect } from 'vitest';
import { slushRemaining } from '../../../scope-discovery/promote-findings/slush-remaining.js';

function barrageSection(
  date: string,
  runDirBasename: string,
  findings: ReadonlyArray<{ id: string; severity: string; status: string }>,
): string {
  const entries = findings.map((f) =>
    [
      `### ${f.id} — Entry`,
      '',
      `Finding-ID: ${f.id}`,
      `Status:     ${f.status}`,
      `Severity:   ${f.severity}`,
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

function workplanWithFixTasks(ids: ReadonlyArray<string>): string {
  const tasks = ids.map((id, i) =>
    [
      `### Task 5.${i + 1} (fix-finding-${id}): example`,
      '',
      '- [ ] Step 1: write failing test',
      '- [ ] Step 2: confirm fails',
      '- [ ] Step 3: implement fix',
      '- [ ] Step 4: confirm passes',
      '- [ ] Step 5: commit',
      '',
      '**Acceptance Criteria:**',
      '',
      '- [ ] Failing test exists',
      '- [ ] vitest exits 0',
      '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
      '',
    ].join('\n'),
  );
  return [
    '# Workplan',
    '',
    '## Phase 5: x',
    '',
    ...tasks,
  ].join('\n');
}

describe('slushRemaining — Phase 15 Task 7', () => {
  it('refuses when the dampener is NOT engaged (recent run has HIGH+ open)', () => {
    const auditLog = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'a', [{ id: 'AUDIT-1', severity: 'high', status: 'open' }]),
      '',
      // Use MEDIUM in the most-recent run so the single-run dampener
      // rule (operator directive 2026-05-31: 0 HIGH AND 0 MEDIUM
      // engages) doesn't fire — we want to test the "refuses when
      // dampener not engaged" path here.
      barrageSection('2026-06-02', 'b', [{ id: 'AUDIT-2', severity: 'medium', status: 'open' }]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-1', 'AUDIT-2']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
    });
    expect(result.dampenerEngaged).toBe(false);
    expect(result.flips).toHaveLength(0);
    expect(result.newAuditLogText).toBe(auditLog);
    expect(result.newWorkplanText).toBe(workplan);
  });

  it('flips all remaining open findings (in latest section) + their workplan checkboxes when dampener is engaged', () => {
    // Single barrage section with the three findings — the latest-
    // section scope (Issue #380) restricts the slush to one section
    // by default. Test asserts that all open MED/LOW findings in
    // scope get flipped + their workplan tasks get fully checked.
    const auditLog = [
      '# Audit Log',
      '',
      barrageSection('2026-06-02', 'b', [
        { id: 'AUDIT-3', severity: 'medium', status: 'open' },
        { id: 'AUDIT-4', severity: 'low', status: 'open' },
        { id: 'AUDIT-5', severity: 'low', status: 'open' },
      ]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-3', 'AUDIT-4', 'AUDIT-5']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
      threshold: 1, // engage on single quiet run (no HIGH+ in latest)
    });
    expect(result.dampenerEngaged).toBe(true);
    expect(result.flips).toHaveLength(3);
    expect(result.flips.map((f) => f.findingId).sort()).toEqual(['AUDIT-3', 'AUDIT-4', 'AUDIT-5']);
    // Audit-log: all three flipped.
    expect(result.newAuditLogText).toContain('Status:     acknowledged-slush-pile-2026-05-31');
    expect(result.newAuditLogText.match(/Status:\s+open/g) ?? []).toHaveLength(0);
    // Workplan: all checkboxes in matching task blocks flipped.
    const uncheckedRemaining = result.newWorkplanText.match(/- \[ \]/g) ?? [];
    expect(uncheckedRemaining).toHaveLength(0);
  });

  it('leaves non-barrage-section findings untouched', () => {
    // Latest-section scope: only the latest barrage's MED/LOW
    // findings flip. AUDIT-MANUAL is outside any barrage section
    // and stays open regardless. Put both AUDIT-6 + AUDIT-7 in the
    // latest section so both flip.
    const auditLog = [
      '# Audit Log',
      '',
      '## Some manual section (not a barrage)',
      '',
      '### AUDIT-MANUAL — Manual entry',
      '',
      'Finding-ID: AUDIT-MANUAL',
      'Status:     open',
      'Severity:   medium',
      '',
      'Body.',
      '',
      barrageSection('2026-06-02', 'b', [
        { id: 'AUDIT-6', severity: 'low', status: 'open' },
        { id: 'AUDIT-7', severity: 'low', status: 'open' },
      ]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-6', 'AUDIT-7']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
      threshold: 1,
    });
    expect(result.dampenerEngaged).toBe(true);
    // AUDIT-MANUAL stays open; both barrage findings flipped.
    expect(result.flips.map((f) => f.findingId).sort()).toEqual(['AUDIT-6', 'AUDIT-7']);
    expect(result.newAuditLogText).toContain('Finding-ID: AUDIT-MANUAL\nStatus:     open');
  });

  it('handles findings that have no matching workplan task (audit-log flipped; workplan untouched for them)', () => {
    // Single latest section with two findings; the workplan only
    // contains a task for AUDIT-8. AUDIT-9's audit-log entry flips
    // anyway; the missing workplan task is a no-op.
    const auditLog = [
      '# Audit Log',
      '',
      barrageSection('2026-06-02', 'b', [
        { id: 'AUDIT-8', severity: 'low', status: 'open' },
        { id: 'AUDIT-9', severity: 'low', status: 'open' },
      ]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-8']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
      threshold: 1,
    });
    expect(result.dampenerEngaged).toBe(true);
    expect(result.flips).toHaveLength(2);
    // Both audit-log entries flipped.
    expect(result.newAuditLogText.match(/acknowledged-slush-pile/g) ?? []).toHaveLength(2);
    // The one workplan task's boxes flipped; no errors on the missing one.
    const uncheckedRemaining = result.newWorkplanText.match(/- \[ \]/g) ?? [];
    expect(uncheckedRemaining).toHaveLength(0);
  });

  it('empty audit-log (no barrage sections) → not-engaged, no flips', () => {
    const result = slushRemaining({
      auditLogText: '# Audit Log\n',
      workplanText: '# Workplan\n',
      slushDate: '2026-05-31',
    });
    expect(result.dampenerEngaged).toBe(false);
    expect(result.flips).toHaveLength(0);
  });

  it('does NOT flip findings that are already non-open (e.g., fixed-<sha>)', () => {
    // Latest section has one already-fixed finding and one open;
    // only the open one flips. The fixed-<sha> stays preserved.
    const auditLog = [
      '# Audit Log',
      '',
      barrageSection('2026-06-02', 'b', [
        { id: 'AUDIT-10', severity: 'low', status: 'fixed-deadbeef' },
        { id: 'AUDIT-11', severity: 'low', status: 'open' },
      ]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-10', 'AUDIT-11']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
      threshold: 1,
    });
    expect(result.dampenerEngaged).toBe(true);
    // Only AUDIT-11 flipped (AUDIT-10 already fixed).
    expect(result.flips).toHaveLength(1);
    expect(result.flips[0]?.findingId).toBe('AUDIT-11');
    expect(result.newAuditLogText).toContain('Status:     fixed-deadbeef'); // preserved
    expect(result.newAuditLogText).toContain('Status:     acknowledged-slush-pile-2026-05-31');
  });
});

/**
 * Issue #380 regression: two divergences from the operator-intent +
 * SKILL.md docstring.
 *
 *   (1) No severity filter. SKILL.md says "HIGHs are NEVER slushed"
 *       but the code flips every open finding regardless of severity.
 *   (2) All-sections scope. Operator's intent is to slush "the
 *       smaller items in scope of THIS barrage." Code walked every
 *       audit-barrage lift section in the file.
 *
 * Post-fix:
 *   - HIGHs (high + blocking) are never flipped. They land in a
 *     separate `skippedHighs` array on the result.
 *   - Only the most-recent barrage lift section is in scope.
 */
describe('slushRemaining — Issue #380 (HIGH-filter + latest-section scope)', () => {
  it('with scope=all, skips HIGHs (defense-in-depth severity filter); flips MED/LOW; result names skipped HIGHs separately', () => {
    // Dampener invariant: when slushRemaining engages, the most-
    // recent section must have 0 HIGH+ open. So a HIGH in scope
    // can only happen via `scope: 'all'` reaching into an OLDER
    // section that pre-dates the quiet runs. The severity filter
    // is defense-in-depth for that case — even though the latest-
    // section default already prevents older HIGHs from being
    // touched, the severity filter ensures that `scope: 'all'`
    // (legacy / debug / future-use) still preserves HIGHs.
    const auditLog = [
      '# Audit Log',
      '',
      // Older section with an open HIGH — out of latest-scope, but
      // in scope when `scope: 'all'`. Severity filter must skip it.
      barrageSection('2026-06-01', 'older', [
        { id: 'AUDIT-HI', severity: 'high', status: 'open' },
        { id: 'AUDIT-MD', severity: 'medium', status: 'open' },
        { id: 'AUDIT-LO', severity: 'low', status: 'open' },
        { id: 'AUDIT-IN', severity: 'informational', status: 'open' },
      ]),
      '',
      // Most-recent quiet section so the dampener engages (single-
      // run rule: 0 HIGH+ AND 0 MEDIUM open).
      barrageSection('2026-06-02', 'quiet-latest', [
        { id: 'AUDIT-QL', severity: 'low', status: 'open' },
      ]),
    ].join('\n');
    const workplan = workplanWithFixTasks([
      'AUDIT-HI',
      'AUDIT-MD',
      'AUDIT-LO',
      'AUDIT-IN',
      'AUDIT-QL',
    ]);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
      scope: 'all',
    });
    expect(result.dampenerEngaged).toBe(true);
    // Severity filter: HIGH skipped; MED/LOW/INFO/QL flipped.
    const flippedIds = result.flips.map((f) => f.findingId).sort();
    expect(flippedIds).toEqual(['AUDIT-IN', 'AUDIT-LO', 'AUDIT-MD', 'AUDIT-QL']);
    // Skipped HIGHs reported separately on the result.
    expect(result.skippedHighs).toBeDefined();
    expect(result.skippedHighs.map((f) => f.findingId)).toEqual(['AUDIT-HI']);
    // Audit-log: AUDIT-HI keeps `Status: open`.
    expect(result.newAuditLogText).toMatch(/AUDIT-HI[\s\S]{0,100}Status:\s+open/);
    // Audit-log: MED/LOW/INFO flipped to acknowledged-slush-pile.
    expect(result.newAuditLogText).toMatch(/AUDIT-MD[\s\S]{0,150}acknowledged-slush-pile-2026-05-31/);
    expect(result.newAuditLogText).toMatch(/AUDIT-LO[\s\S]{0,150}acknowledged-slush-pile-2026-05-31/);
    expect(result.newAuditLogText).toMatch(/AUDIT-IN[\s\S]{0,150}acknowledged-slush-pile-2026-05-31/);
  });

  it('scopes the slush to the MOST RECENT barrage only — older sections untouched', () => {
    const auditLog = [
      '# Audit Log',
      '',
      // Older barrage with 1 open HIGH + 1 open MED. Out of scope
      // for the slush (older section).
      barrageSection('2026-06-01', 'older', [
        { id: 'AUDIT-OLD-HI', severity: 'high', status: 'open' },
        { id: 'AUDIT-OLD-MD', severity: 'medium', status: 'open' },
      ]),
      '',
      // Newer barrage with 2 open MEDs. With threshold=1 the
      // dampener engages on the latest run alone (0 HIGH+ open).
      barrageSection('2026-06-02', 'newer', [
        { id: 'AUDIT-NEW-1', severity: 'medium', status: 'open' },
        { id: 'AUDIT-NEW-2', severity: 'medium', status: 'open' },
      ]),
    ].join('\n');
    const workplan = workplanWithFixTasks([
      'AUDIT-OLD-HI',
      'AUDIT-OLD-MD',
      'AUDIT-NEW-1',
      'AUDIT-NEW-2',
    ]);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
      threshold: 1, // engage on the latest run alone (0 HIGH+ open)
    });
    expect(result.dampenerEngaged).toBe(true);
    // Scope is the latest barrage ONLY: NEW-1 + NEW-2 flipped.
    const flippedIds = result.flips.map((f) => f.findingId).sort();
    expect(flippedIds).toEqual(['AUDIT-NEW-1', 'AUDIT-NEW-2']);
    // Older section's HIGH + MED both untouched.
    expect(result.newAuditLogText).toMatch(/AUDIT-OLD-HI[\s\S]{0,150}Status:\s+open/);
    expect(result.newAuditLogText).toMatch(/AUDIT-OLD-MD[\s\S]{0,150}Status:\s+open/);
    // No HIGH was in the latest scope; skippedHighs is empty.
    expect(result.skippedHighs).toEqual([]);
  });
});
