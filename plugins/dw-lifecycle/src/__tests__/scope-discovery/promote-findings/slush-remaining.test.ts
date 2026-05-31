/**
 * Phase 15 Task 7 — slush-remaining library tests.
 *
 * The `slush-remaining` library implements the operator's directive:
 *   "we should address all of the auditors' findings, but when we've
 *    gone two consecutive audits with 0 high issues, we can bin the
 *    smaller items into the slush pile."
 *
 * Mechanics:
 *   1. Refuse to run unless the dampener is engaged (last N runs all
 *      had 0 HIGH+ open findings).
 *   2. When engaged: flip ALL `Status: open` findings within
 *      audit-barrage lift sections to
 *      `Status: acknowledged-slush-pile-<YYYY-MM-DD>`.
 *   3. ALSO flip all `- [ ]` checkboxes in the corresponding workplan
 *      fix-finding task blocks → `- [x]`, so the implement-skill
 *      doesn't try to pick them up as next work.
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
      barrageSection('2026-06-02', 'b', [{ id: 'AUDIT-2', severity: 'low', status: 'open' }]),
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

  it('flips all remaining open findings + their workplan checkboxes when dampener is engaged', () => {
    const auditLog = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'a', [
        { id: 'AUDIT-3', severity: 'medium', status: 'open' },
        { id: 'AUDIT-4', severity: 'low', status: 'open' },
      ]),
      '',
      barrageSection('2026-06-02', 'b', [{ id: 'AUDIT-5', severity: 'low', status: 'open' }]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-3', 'AUDIT-4', 'AUDIT-5']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
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
      barrageSection('2026-06-01', 'a', [{ id: 'AUDIT-6', severity: 'low', status: 'open' }]),
      '',
      barrageSection('2026-06-02', 'b', [{ id: 'AUDIT-7', severity: 'low', status: 'open' }]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-6', 'AUDIT-7']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
    });
    expect(result.dampenerEngaged).toBe(true);
    // AUDIT-MANUAL stays open; only AUDIT-6 + AUDIT-7 flipped.
    expect(result.flips.map((f) => f.findingId).sort()).toEqual(['AUDIT-6', 'AUDIT-7']);
    expect(result.newAuditLogText).toContain('Finding-ID: AUDIT-MANUAL\nStatus:     open');
  });

  it('handles findings that have no matching workplan task (audit-log flipped; workplan untouched for them)', () => {
    const auditLog = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'a', [{ id: 'AUDIT-8', severity: 'low', status: 'open' }]),
      '',
      barrageSection('2026-06-02', 'b', [{ id: 'AUDIT-9', severity: 'low', status: 'open' }]),
    ].join('\n');
    // Workplan has only AUDIT-8's task; AUDIT-9 has no fix-task.
    const workplan = workplanWithFixTasks(['AUDIT-8']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
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
    const auditLog = [
      '# Audit Log',
      '',
      barrageSection('2026-06-01', 'a', [
        { id: 'AUDIT-10', severity: 'low', status: 'fixed-deadbeef' },
      ]),
      '',
      barrageSection('2026-06-02', 'b', [{ id: 'AUDIT-11', severity: 'low', status: 'open' }]),
    ].join('\n');
    const workplan = workplanWithFixTasks(['AUDIT-10', 'AUDIT-11']);
    const result = slushRemaining({
      auditLogText: auditLog,
      workplanText: workplan,
      slushDate: '2026-05-31',
    });
    expect(result.dampenerEngaged).toBe(true);
    // Only AUDIT-11 flipped (AUDIT-10 already fixed).
    expect(result.flips).toHaveLength(1);
    expect(result.flips[0]?.findingId).toBe('AUDIT-11');
    expect(result.newAuditLogText).toContain('Status:     fixed-deadbeef'); // preserved
    expect(result.newAuditLogText).toContain('Status:     acknowledged-slush-pile-2026-05-31');
  });
});
