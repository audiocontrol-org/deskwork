/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/cross-reference-audit-run.ts
 *
 * Phase 13 Task 4 Step 3 — pure-fn library for cross-referencing a
 * fresh audit-barrage run against existing `fixed-<sha>` audit-log
 * entries. The skill `/dw-lifecycle:re-audit-fixed-findings` and the
 * sibling CLI verb compose this with the audit-runs INDEX walker and
 * the existing `flipAuditLogStatus` (`currentStatusPredicate` flavor).
 *
 * Cross-reference contract:
 *
 *   - "Still surfaced" means the new run's text contains a heading or
 *     a Surface-field substring that matches the entry's identity.
 *     The match heuristic is intentionally loose at v1 — the agent /
 *     operator triages the candidates before any flips are applied.
 *
 *   - "Not surfaced" means none of the new run's per-model output
 *     contains a matching reference. The finding becomes a candidate
 *     for `verified-<date>`.
 *
 * Match rules (text-substring, case-insensitive):
 *
 *   1. Heading substring — strip the `AUDIT-<id> — ` prefix from the
 *      entry's heading and look for the remainder in the new run text.
 *      Headings shorter than 12 chars after stripping fall through to
 *      Surface matching (avoids generic single-word headings matching
 *      arbitrary mentions).
 *
 *   2. Surface substring — when the entry has a Surface field, look
 *      for each path-shaped token (anything containing `/` or ending
 *      in a recognized source extension) in the new run text.
 *
 * Either rule firing classifies the entry as "still surfaced." Entries
 * with neither heading nor Surface field cannot be cross-referenced
 * and fall back to "unknown" — they're surfaced separately as needing
 * operator review.
 */

const AUDIT_HEADING_PREFIX_RE = /^AUDIT-\d{8}-\d+\s*[—-]\s*/;
// Path-shaped token: at least one `/` OR a recognized code-file
// extension. Keeps the matcher narrow enough to skip prose
// references like "the Surface field" while catching real paths
// like `src/foo.ts` and `plugins/dw-lifecycle/...`.
const PATH_TOKEN_RE =
  /[\w./-]*(?:\/[\w./-]+|\.(?:ts|tsx|js|jsx|mts|cts|md|yaml|yml|json|sh))[\w./-]*/gi;
const MIN_HEADING_SUBSTRING_LEN = 12;

export type CrossReferenceClassification =
  | 'still-surfaced'
  | 'not-surfaced'
  | 'unmatchable';

export interface AuditEntryRef {
  readonly findingId: string;
  readonly status: string;
  readonly heading?: string;
  readonly surface?: string;
}

export interface CrossReferenceResult {
  readonly findingId: string;
  readonly classification: CrossReferenceClassification;
  /** Which match-rule fired; empty when classification is `not-surfaced` or `unmatchable`. */
  readonly matchedBy: ReadonlyArray<'heading' | 'surface'>;
}

export interface CrossReferenceAuditRunArgs {
  /** The audit-log entries whose Status starts with `fixed-`. */
  readonly fixedEntries: ReadonlyArray<AuditEntryRef>;
  /**
   * The concatenated text content of the new audit-barrage run's per-
   * model output files (caller does the file reads). Whitespace
   * preserved verbatim; the matcher does its own case folding.
   */
  readonly newRunText: string;
}

function stripHeadingPrefix(heading: string): string {
  return heading.replace(AUDIT_HEADING_PREFIX_RE, '').trim();
}

function headingSurfaces(heading: string | undefined, newRunText: string): boolean {
  if (heading === undefined) return false;
  const stripped = stripHeadingPrefix(heading);
  if (stripped.length < MIN_HEADING_SUBSTRING_LEN) return false;
  return newRunText.toLowerCase().includes(stripped.toLowerCase());
}

function surfaceSurfaces(
  surface: string | undefined,
  newRunText: string,
): boolean {
  if (surface === undefined) return false;
  const tokens = surface.match(PATH_TOKEN_RE);
  if (tokens === null) return false;
  const lower = newRunText.toLowerCase();
  for (const token of tokens) {
    if (token.length < 6) continue;
    if (lower.includes(token.toLowerCase())) return true;
  }
  return false;
}

export function classifyEntry(
  entry: AuditEntryRef,
  newRunText: string,
): CrossReferenceResult {
  const matchedBy: Array<'heading' | 'surface'> = [];
  if (headingSurfaces(entry.heading, newRunText)) matchedBy.push('heading');
  if (surfaceSurfaces(entry.surface, newRunText)) matchedBy.push('surface');
  if (matchedBy.length > 0) {
    return { findingId: entry.findingId, classification: 'still-surfaced', matchedBy };
  }
  const couldMatch =
    (entry.heading !== undefined &&
      stripHeadingPrefix(entry.heading).length >= MIN_HEADING_SUBSTRING_LEN) ||
    (entry.surface !== undefined && PATH_TOKEN_RE.test(entry.surface));
  return {
    findingId: entry.findingId,
    classification: couldMatch ? 'not-surfaced' : 'unmatchable',
    matchedBy: [],
  };
}

export function crossReferenceAuditRun(
  args: CrossReferenceAuditRunArgs,
): ReadonlyArray<CrossReferenceResult> {
  return args.fixedEntries.map((entry) => classifyEntry(entry, args.newRunText));
}
