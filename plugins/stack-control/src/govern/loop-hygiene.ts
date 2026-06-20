/**
 * plugins/stack-control/src/govern/loop-hygiene.ts
 *
 * specs/029-govern-operability — Phase 4 / US4 (loop hygiene).
 *
 * Shared, store-free helpers over the audit-log text that the lift and slush
 * surfaces use to keep the convergence loop hygienic:
 *
 *   - FR-013: a finding already marked `Status: fixed-<sha>` is RESOLVED — it
 *     must never be re-lifted into a new section nor migrated to the backlog.
 *   - FR-016: a finding already PRESENT in the audit-log (at any status) must
 *     not be re-lifted into a near-duplicate entry on a later convergence round;
 *     lift dedups across runs by `findingSignature(heading, surface)`.
 *
 * The signature is the single shared `findingSignature(heading, surface)` from
 * extract-barrage-findings (FR-019) — never a second definition. The audit-log
 * is parsed by the shared `parseAuditLogText` (no bespoke walk).
 */

import { parseAuditLogText } from '../scope-discovery/util/audit-log-parser.js';
import { findingSignature } from '../scope-discovery/promote-findings/extract-barrage-findings.js';

/** A `Status: fixed-<sha>` line — the resolved-in-loop / prior-commit disposition. */
export const STATUS_FIXED_RE = /^fixed-\S+/i;

/**
 * specs/029 US3 (FR-009): an audit-log entry's `### ` line is written by the lift
 * as `### <finding-id> — <heading>` (space-emdash-space, U+2014). The bare heading
 * — the text a model finding reports — is whatever follows the first ` — `; absent
 * the separator the whole remainder is the heading. The dampener strips the same
 * prefix when keying signatures, so the signatures align across the lift/dampener/
 * hygiene surfaces.
 */
export function auditLogEntryHeading(rawHeading: string): string {
  const emdashIdx = rawHeading.indexOf(' — ');
  return emdashIdx >= 0 ? rawHeading.slice(emdashIdx + 3).trim() : rawHeading.trim();
}

/**
 * The set of finding-signatures whose audit-log entry is `fixed-<sha>` (FR-013).
 * A signature requires both a heading and a surface — an entry missing a Surface
 * field cannot be signature-keyed and is omitted (it cannot collide with a lifted
 * finding's signature either, so it is never silently treated as fixed).
 */
export function collectFixedSignatures(auditLogText: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const entry of parseAuditLogText(auditLogText)) {
    if (entry.surface === undefined) continue;
    if (STATUS_FIXED_RE.test(entry.status)) {
      out.add(findingSignature(auditLogEntryHeading(entry.heading), entry.surface));
    }
  }
  return out;
}

/**
 * The set of finding-signatures ALREADY present anywhere in the audit-log
 * (FR-016 cross-run dedup) — regardless of status (open / migrated-to-backlog /
 * fixed). A later convergence round that re-surfaces one of these must not append
 * a near-duplicate entry. Entries without a Surface are omitted (not
 * signature-keyable).
 */
export function collectLiftedSignatures(auditLogText: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const entry of parseAuditLogText(auditLogText)) {
    if (entry.surface === undefined) continue;
    out.add(findingSignature(auditLogEntryHeading(entry.heading), entry.surface));
  }
  return out;
}

/** The minimal finding shape the lift filter needs (a subset of ExtractedFinding). */
export interface SignaturedFinding {
  readonly heading: string;
  readonly surface: string;
}

/**
 * specs/029 US4 (FR-013/FR-016) — the result of partitioning a fresh extraction
 * against the audit-log's loop-hygiene state. The lift needs THREE buckets, not a
 * single filtered list, because the FR-013 and FR-016 drops mean DIFFERENT things
 * to the convergence dampener:
 *
 *   - `liftable` — neither resolved nor already-present. These get fresh
 *     `AUDIT-<date>-NN` IDs + a new audit-log entry (and become slushable/backlog
 *     work).
 *   - `dedupSuppressedOpen` — already PRESENT in the audit-log (FR-016 cross-run
 *     dedup) but NOT resolved. These are STILL-UNADDRESSED findings re-surfacing on
 *     a later round. They must NOT get a second backlog entry (FR-016: ≤1 task per
 *     signature) — but they must STILL be visible to the dampener as the run's
 *     surfaced severity, so a persistent OPEN HIGH keeps blocking (US3 SC-001). The
 *     prior single-bucket filter dropped these too, which let an all-deduped re-run
 *     render as a PRISTINE quiet section → the single-run-clean rule graduated a
 *     feature with a real unfixed HIGH (the graduation-safety bug this fix closes).
 *
 * Findings already RESOLVED (`Status: fixed-<sha>`, FR-013) appear in NEITHER bucket
 * — they are done, so they neither create work nor count toward the dampener. A
 * finding that is BOTH fixed and (separately) present is treated as resolved (FR-013
 * wins): re-surfacing a fixed finding is genuine jitter on done work, not a
 * persistent open defect.
 */
export interface PartitionedFindings<T extends SignaturedFinding> {
  /** Neither resolved nor already-present → fresh IDs + new entry. */
  readonly liftable: T[];
  /**
   * Already-present (FR-016) and NOT resolved → no new backlog entry, but the
   * dampener must still see their severity (US3 SC-001). The lift renders these
   * as a non-pristine re-report section when `liftable` is empty.
   */
  readonly dedupSuppressedOpen: T[];
}

/**
 * Partition a fresh extraction into the loop-hygiene buckets (FR-013/FR-016).
 * Both sets are keyed by the single shared `findingSignature(heading, surface)`.
 * Each drop is announced through `warn` for an auditable trail.
 */
export function partitionLiftableFindings<T extends SignaturedFinding>(
  findings: readonly T[],
  auditLogText: string,
  warn: (message: string) => void,
): PartitionedFindings<T> {
  const fixed = collectFixedSignatures(auditLogText);
  const lifted = collectLiftedSignatures(auditLogText);
  const liftable: T[] = [];
  const dedupSuppressedOpen: T[] = [];
  for (const f of findings) {
    const sig = findingSignature(f.heading, f.surface);
    if (fixed.has(sig)) {
      warn(`audit-barrage-lift: skipping ${f.heading} — already resolved (fixed-<sha>); not re-lifted (FR-013).`);
      continue;
    }
    if (lifted.has(sig)) {
      warn(
        `audit-barrage-lift: ${f.heading} — already present in the audit-log (same signature); ` +
          `no new entry (FR-016 cross-run dedup), but its severity is re-reported so a ` +
          `persistent open finding keeps the dampener engaged (US3 SC-001).`,
      );
      dedupSuppressedOpen.push(f);
      continue;
    }
    liftable.push(f);
  }
  return { liftable, dedupSuppressedOpen };
}

/**
 * Drop the loop-hygiene-excluded findings from a fresh extraction (FR-013/FR-016).
 * Thin wrapper over `partitionLiftableFindings` returning only the `liftable`
 * bucket — retained for callers that do not need the dedup-suppressed-open set.
 */
export function selectLiftableFindings<T extends SignaturedFinding>(
  findings: readonly T[],
  auditLogText: string,
  warn: (message: string) => void,
): T[] {
  return partitionLiftableFindings(findings, auditLogText, warn).liftable;
}
