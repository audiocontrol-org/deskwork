// T024 (008) — slush → backlog migration (US4). The audit-barrage dampener
// DECISION (when to park) stays in scope-discovery/promote-findings/slush-remaining.ts
// UNCHANGED (D5); only the DESTINATION of a parked finding changes: instead of an
// indefinitely-held `acknowledged-slush-pile-<date>` status, a parked MEDIUM/LOW
// finding becomes a `migrated-finding` backlog item and its audit-log entry
// records `migrated-to-backlog <task-id>`, leaving the audit-log a clean
// open/fixed convergence ledger (FR-016/FR-020). Used by BOTH the one-time
// backfill (import-slush) and the ongoing slush-findings rewire.

import { findBarrageSections } from '../scope-discovery/promote-findings/slush-remaining.js';
import { severityToPriority, typeLabel } from './mappings.js';
import type { BacklogBackend } from './backend.js';

// Re-declared locally so slush-remaining.ts stays frozen (D5); these mirror its
// private field regexes. The status predicate is a parameter so the same walk
// serves the backfill (acknowledged-slush-pile-*) and the rewire (open).
const FINDING_ID_RE = /^Finding-ID:\s*(.+?)\s*$/i;
const SEVERITY_RE = /^Severity:\s*(\S+)/i;
const ENTRY_HEADER_RE = /^###\s+/;
const CANONICAL_AUDIT_ID_RE = /\bAUDIT-\d{8}-\d+/;

/** Status predicate for the one-time backfill (already-parked entries). */
export const ACKNOWLEDGED_SLUSH_RE = /^Status:\s*acknowledged-slush-pile\b/i;

export interface FoundFinding {
  /** Canonical AUDIT-id (the provenance / idempotency key). */
  readonly findingId: string;
  readonly fullFindingId: string;
  readonly severity: string | undefined;
  /** Index (in the split lines) of the Status line to rewrite. */
  readonly statusLineIndex: number;
  /** The `###` header text — the migrated item's title. */
  readonly title: string;
}

function canonical(value: string): string {
  const m = CANONICAL_AUDIT_ID_RE.exec(value);
  return m !== null ? m[0] : value;
}

/** The migrated item's backlink ref (traceable to the audit-log entry, FR-016). */
export function auditRef(featureSlug: string, findingId: string): string {
  return `audit:${featureSlug}:${findingId}`;
}

/**
 * Find findings within audit-barrage lift sections whose Status line matches
 * `statusMatch`. Reuses the exported `findBarrageSections` so the section model
 * stays single-sourced; the per-entry walk is local (slush-remaining stays
 * frozen, D5).
 */
export function findFindingsByStatus(auditLogText: string, statusMatch: RegExp): FoundFinding[] {
  const lines = auditLogText.split('\n');
  const sections = findBarrageSections(lines);
  const out: FoundFinding[] = [];
  for (const section of sections) {
    let i = section.headerIndex + 1;
    while (i < section.endIndex) {
      if (!ENTRY_HEADER_RE.test(lines[i] ?? '')) {
        i += 1;
        continue;
      }
      const title = (lines[i] ?? '').replace(/^###\s+/, '').trim();
      let statusLineIndex = -1;
      let fullFindingId: string | undefined;
      let severity: string | undefined;
      let j = i + 1;
      while (j < section.endIndex) {
        const inner = lines[j] ?? '';
        if (ENTRY_HEADER_RE.test(inner)) break;
        const fid = FINDING_ID_RE.exec(inner);
        if (fid !== null && fullFindingId === undefined) fullFindingId = fid[1];
        const sev = SEVERITY_RE.exec(inner);
        if (sev !== null && severity === undefined) severity = sev[1]!.toLowerCase();
        if (statusMatch.test(inner) && statusLineIndex === -1) statusLineIndex = j;
        j += 1;
      }
      if (statusLineIndex !== -1 && fullFindingId !== undefined) {
        out.push({ findingId: canonical(fullFindingId), fullFindingId, severity, statusLineIndex, title });
      }
      i = j;
    }
  }
  return out;
}

export interface MigrationResult {
  readonly newAuditLogText: string;
  readonly migrated: readonly { readonly findingId: string; readonly taskId: string }[];
  /** Finding ids skipped because a backlog item with their ref already exists. */
  readonly skipped: readonly string[];
}

/**
 * Create one `migrated-finding` backlog item per finding (priority from
 * severity; provenance = feature slug + finding id; ref → audit-log entry) and
 * rewrite each finding's Status line to `migrated-to-backlog <task-id>`.
 * Idempotent: a finding whose `audit:<slug>:<id>` ref already exists is skipped.
 * HIGH/blocking severities throw via severityToPriority (FR-018 fail-loud).
 */
export function migrateFindings(args: {
  auditLogText: string;
  findings: readonly FoundFinding[];
  backend: BacklogBackend;
  featureSlug: string;
}): MigrationResult {
  const lines = args.auditLogText.split('\n');
  const migrated: { findingId: string; taskId: string }[] = [];
  const skipped: string[] = [];
  for (const f of args.findings) {
    const ref = auditRef(args.featureSlug, f.findingId);
    if (args.backend.exists(ref)) {
      skipped.push(f.findingId);
      continue;
    }
    const taskId = args.backend.create({
      title: f.title.length > 0 ? f.title : f.findingId,
      labels: [typeLabel('migrated-finding'), `feature:${args.featureSlug}`, `finding:${f.findingId}`],
      priority: severityToPriority(f.severity),
      refs: [ref],
    });
    lines[f.statusLineIndex] = `Status: migrated-to-backlog ${taskId}`;
    migrated.push({ findingId: f.findingId, taskId });
  }
  return { newAuditLogText: lines.join('\n'), migrated, skipped };
}

/**
 * One-time backfill (US4, FR-021): migrate every `acknowledged-slush-pile-*`
 * entry in the audit-log into the backlog. Dry-run reports the set and writes
 * nothing; apply creates items + rewrites dispositions. Idempotent.
 */
export function backfillSlush(args: {
  auditLogText: string;
  backend: BacklogBackend;
  featureSlug: string;
  apply: boolean;
}): { newAuditLogText: string; planned: readonly string[]; result?: MigrationResult } {
  const findings = findFindingsByStatus(args.auditLogText, ACKNOWLEDGED_SLUSH_RE);
  if (!args.apply) {
    return { newAuditLogText: args.auditLogText, planned: findings.map((f) => f.findingId) };
  }
  const result = migrateFindings({
    auditLogText: args.auditLogText,
    findings,
    backend: args.backend,
    featureSlug: args.featureSlug,
  });
  return { newAuditLogText: result.newAuditLogText, planned: result.migrated.map((m) => m.findingId), result };
}
