// specs/029-govern-operability — Phase 4 / US4 (T025, RED → T026 GREEN).
//
// FR-015: a `backlog done` (close) verb MUST exist (it does — part (a) locks it);
// and when a finding's audit-log entry flips to `fixed-<sha>`, any backlog task
// REFERENCING that finding MUST be reconciled/closed automatically (part (b)).

import { afterEach, describe, it, expect } from 'vitest';
import { rmSync } from 'node:fs';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend, BACKLOG_DONE_STATUS } from '../../src/backlog/backend.js';
import { reconcileFixedFindings } from '../../src/backlog/reconcile-fixed.js';
import { auditRef } from '../../src/backlog/slush-migrate.js';
import { tmpBacklog } from './helpers.js';

// TASK-378: tmpBacklog() provisions a dir under the OS tmpdir per test; without
// cleanup those dirs accumulate across runs. Track each and remove it afterEach
// (mirrors src/__tests__/subcommands/backlog-done.test.ts).
let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});
function fresh(): string {
  const dir = tmpBacklog();
  dirs.push(dir);
  return dir;
}

describe('backlog done closes a task (US4, T025a, FR-015)', () => {
  it('backlog done <id> --apply sets the task status to Done', () => {
    const dir = fresh();
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
    const dir = fresh();
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

  // specs/029 US4 (AUDIT-BARRAGE codex-03 + claude-01, phase-4 re-govern): FR-015
  // says "ANY backlog task that referenced that finding" — not just the first.
  // Older installs accumulated duplicate migrated-finding tasks before FR-016
  // tightened dedup; ALL of them must close when the finding is fixed. And a repeat
  // canonical id (or a stale list() snapshot) must NOT double-close a task.
  it('closes EVERY backlog task carrying the fixed finding ref, double-close-safe', () => {
    const dir = fresh();
    const backend = createBacklogBackend({ cwd: dir });
    const findingId = 'AUDIT-20260619-02';
    const ref = auditRef('feat', findingId);
    const labels = ['type:migrated-finding', 'feature:feat', `finding:${findingId}`];
    // TWO duplicate tasks reference the SAME finding (pre-FR-016 accumulation).
    const id1 = backend.create({ title: 'dup one', labels, refs: [ref] });
    const id2 = backend.create({ title: 'dup two', labels, refs: [ref] });
    // The audit-log records the finding fixed TWICE (e.g. a revision + follow-up id
    // that both canonicalize to the same AUDIT id) — must not double-close.
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
      `### ${findingId}-follow-up — the bug again`,
      '',
      `Finding-ID: ${findingId}-follow-up`,
      'Status:     fixed-def5678',
      'Severity:   medium',
      'Surface:    src/x.ts:1',
      '',
      'body',
      '',
    ].join('\n');

    const res = reconcileFixedFindings({ auditLogText, backend, featureSlug: 'feat' });
    // BOTH tasks closed; each exactly once (no double-close).
    expect(res.reconciled.map((r) => r.taskId).sort()).toEqual([id1, id2].sort());
    const after = createBacklogBackend({ cwd: dir }).list();
    expect(after.find((i) => i.id === id1)?.status).toBe(BACKLOG_DONE_STATUS);
    expect(after.find((i) => i.id === id2)?.status).toBe(BACKLOG_DONE_STATUS);
  });

  // specs/029 US4 (AUDIT-BARRAGE claude-04): dryRun computes the would-close set
  // WITHOUT mutating the backend — the slush dry-run preview path uses it.
  it('dryRun reports what WOULD close without closing it', () => {
    const dir = fresh();
    const backend = createBacklogBackend({ cwd: dir });
    const findingId = 'AUDIT-20260619-03';
    const ref = auditRef('feat', findingId);
    const id = backend.create({
      title: 'a parked medium',
      labels: ['type:migrated-finding', 'feature:feat', `finding:${findingId}`],
      refs: [ref],
    });
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

    const res = reconcileFixedFindings({ auditLogText, backend, featureSlug: 'feat', dryRun: true });
    // Reports the candidate…
    expect(res.reconciled.map((r) => r.taskId)).toContain(id);
    // …but did NOT close it (still open after a dry-run).
    const item = createBacklogBackend({ cwd: dir }).list().find((i) => i.id === id);
    expect(item?.status).not.toBe(BACKLOG_DONE_STATUS);
  });

  it('an already-Done or absent task is a no-op (idempotent)', () => {
    const dir = fresh();
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
