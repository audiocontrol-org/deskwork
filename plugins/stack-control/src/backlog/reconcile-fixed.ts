/**
 * plugins/stack-control/src/backlog/reconcile-fixed.ts
 *
 * specs/029-govern-operability — Phase 4 / US4 (T026, FR-015).
 *
 * Auto-reconcile: when a finding's audit-log entry flips to `Status: fixed-<sha>`,
 * any backlog task that referenced that finding (a migrated-finding item carrying
 * the `audit:<slug>:<finding-id>` ref) MUST be reconciled — closed via the same
 * terminal `backlog done` path. The audit-log is the source of truth for "this is
 * fixed"; the backlog task is the burn-down record, so it follows the audit-log.
 *
 * Pure over the audit-log text + the backend; idempotent — an already-`Done` task
 * or a finding with no referencing task is a clean no-op (never a fabricated
 * close). The backend's `close` is the SAME closure mechanism `backlog done` uses
 * (023 FR-007), so there is one close path, not two.
 */

import { parseAuditLogText } from '../scope-discovery/util/audit-log-parser.js';
import { auditRef } from './slush-migrate.js';
import { STATUS_FIXED_RE } from '../govern/loop-hygiene.js';
import { BACKLOG_DONE_STATUS, type BacklogBackend } from './backend.js';

const CANONICAL_AUDIT_ID_RE = /\bAUDIT-\d{8}-\d+/;

/** Canonical AUDIT-id of a finding's Finding-ID (the ref's identity key). */
function canonicalAuditId(findingId: string): string {
  const m = CANONICAL_AUDIT_ID_RE.exec(findingId);
  return m !== null ? m[0] : findingId;
}

export interface ReconcileFixedArgs {
  readonly auditLogText: string;
  readonly backend: BacklogBackend;
  readonly featureSlug: string;
  /**
   * specs/029 US4 (AUDIT-BARRAGE claude-04): when true, COMPUTE the would-close set
   * WITHOUT mutating the backend — the dry-run preview path lists what a `--apply`
   * run would close, so an operator probing dry-run output sees the reconcile
   * candidates alongside the migration candidates.
   */
  readonly dryRun?: boolean;
}

export interface ReconcileFixedResult {
  /** Tasks closed by this reconcile (one per fixed finding that had an open task). */
  readonly reconciled: readonly { readonly findingId: string; readonly taskId: string }[];
}

/**
 * Close every backlog task referenced by a `fixed-<sha>` audit-log finding.
 *
 * For each entry whose `Status:` is `fixed-<sha>`, close EVERY backlog task carrying
 * the `audit:<slug>:<canonical-finding-id>` ref — not just the first (FR-015:
 * "ANY backlog task that referenced that finding"; older installs accumulated
 * duplicate migrated-finding tasks before FR-016 tightened cross-run dedup). An
 * absent or already-`Done` task is skipped (idempotent). The backend list is read
 * once; a `closed` set makes the close idempotent across repeat canonical ids and a
 * stale snapshot (no double-close — AUDIT-BARRAGE codex-03/claude-01). Closes go
 * through `backend.close` (fail-loud on a backend error — never a fabricated success).
 */
export function reconcileFixedFindings(args: ReconcileFixedArgs): ReconcileFixedResult {
  const items = args.backend.list();
  const reconciled: { findingId: string; taskId: string }[] = [];
  const closed = new Set<string>();
  for (const entry of parseAuditLogText(args.auditLogText)) {
    if (!STATUS_FIXED_RE.test(entry.status)) continue;
    const canonical = canonicalAuditId(entry.findingId);
    const ref = auditRef(args.featureSlug, canonical);
    for (const task of items.filter((item) => item.refs.includes(ref))) {
      if (closed.has(task.id)) continue; // already counted this run (no double-close)
      if (task.status === BACKLOG_DONE_STATUS) continue;
      if (args.dryRun !== true) args.backend.close(task.id); // preview: compute, don't mutate
      closed.add(task.id);
      reconciled.push({ findingId: canonical, taskId: task.id });
    }
  }
  return { reconciled };
}
