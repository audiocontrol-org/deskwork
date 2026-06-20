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
}

export interface ReconcileFixedResult {
  /** Tasks closed by this reconcile (one per fixed finding that had an open task). */
  readonly reconciled: readonly { readonly findingId: string; readonly taskId: string }[];
}

/**
 * Close every backlog task referenced by a `fixed-<sha>` audit-log finding.
 *
 * For each entry whose `Status:` is `fixed-<sha>`, look up the task carrying the
 * `audit:<slug>:<canonical-finding-id>` ref. When found AND not already `Done`,
 * close it. An absent or already-closed task is skipped (idempotent). The backend
 * list is read once; closes go through `backend.close` (fail-loud on a backend
 * error — never a fabricated success).
 */
export function reconcileFixedFindings(args: ReconcileFixedArgs): ReconcileFixedResult {
  const items = args.backend.list();
  const reconciled: { findingId: string; taskId: string }[] = [];
  for (const entry of parseAuditLogText(args.auditLogText)) {
    if (!STATUS_FIXED_RE.test(entry.status)) continue;
    const canonical = canonicalAuditId(entry.findingId);
    const ref = auditRef(args.featureSlug, canonical);
    const task = items.find((item) => item.refs.includes(ref));
    if (task === undefined) continue;
    if (task.status === BACKLOG_DONE_STATUS) continue;
    args.backend.close(task.id);
    reconciled.push({ findingId: canonical, taskId: task.id });
  }
  return reconciled.length > 0 ? { reconciled } : { reconciled: [] };
}
