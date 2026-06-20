// specs/029-govern-operability — Phase 4 / US4 (T025, RED → T026 GREEN).
//
// FR-015: a `backlog done` (close) verb MUST exist (it does — part (a) locks it);
// and when a finding's audit-log entry flips to `fixed-<sha>`, any backlog task
// REFERENCING that finding MUST be reconciled/closed automatically (part (b)).

import { describe, it, expect } from 'vitest';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend, BACKLOG_DONE_STATUS } from '../../src/backlog/backend.js';
import { reconcileFixedFindings } from '../../src/backlog/reconcile-fixed.js';
import { auditRef } from '../../src/backlog/slush-migrate.js';
import { tmpBacklog } from './helpers.js';

describe('backlog done closes a task (US4, T025a, FR-015)', () => {
  it('backlog done <id> --apply sets the task status to Done', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const id = backend.create({ title: 'a found bug', labels: ['agent-found', 'type:bug'] });

    const r = runCli(['backlog', 'done', id, '--reason', 'verified fixed', '--apply'], {
      env: { STACKCTL_BACKLOG_DIR: dir },
    });
    expect(r.status).toBe(0);
    const item = createBacklogBackend({ cwd: dir }).list().find((i) => i.id === id);
    expect(item?.status).toBe(BACKLOG_DONE_STATUS);
  });
});

describe('a finding flipping to fixed-<sha> auto-reconciles its task (US4, T025b, FR-015)', () => {
  it('closes the backlog task whose ref matches the fixed finding', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const findingId = 'AUDIT-20260619-01';
    const ref = auditRef('feat', findingId);
    // A migrated-finding task referencing the audit-log entry.
    const id = backend.create({
      title: 'a parked medium',
      labels: ['type:migrated-finding', 'feature:feat', `finding:${findingId}`],
      refs: [ref],
    });
    // The audit-log now records the finding as fixed-<sha> (the agent fixed it).
    const auditLogText = [
      '# Audit Log — feat',
      '',
      '## 2026-06-19 — audit-barrage lift (run-1-after_clarify)',
      '',
      `### ${findingId} — the bug`,
      '',
      `Finding-ID: ${findingId}`,
      'Status:     fixed-abc1234',
      'Severity:   medium',
      'Surface:    src/x.ts:1',
      '',
      'body',
      '',
    ].join('\n');

    const res = reconcileFixedFindings({ auditLogText, backend, featureSlug: 'feat' });
    expect(res.reconciled.map((r) => r.taskId)).toContain(id);

    const item = createBacklogBackend({ cwd: dir }).list().find((i) => i.id === id);
    expect(item?.status).toBe(BACKLOG_DONE_STATUS);
  });

  it('an already-Done or absent task is a no-op (idempotent)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    // No task references this finding — reconcile is a clean no-op.
    const auditLogText = [
      '# Audit Log — feat',
      '',
      '## 2026-06-19 — audit-barrage lift (run-1-after_clarify)',
      '',
      '### AUDIT-20260619-09 — orphan fixed finding',
      '',
      'Finding-ID: AUDIT-20260619-09',
      'Status:     fixed-deadbee',
      'Severity:   low',
      'Surface:    src/y.ts:1',
      '',
      'body',
      '',
    ].join('\n');
    const res = reconcileFixedFindings({ auditLogText, backend, featureSlug: 'feat' });
    expect(res.reconciled).toHaveLength(0);
  });
});
