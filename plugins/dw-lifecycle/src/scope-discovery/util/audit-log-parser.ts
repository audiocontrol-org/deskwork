/**
 * plugins/dw-lifecycle/src/scope-discovery/util/audit-log-parser.ts
 *
 * Phase 11 Task 10 — Audit-log markdown parser for bidirectional
 * navigation between catalog entries and audit-log findings.
 *
 * # Why this exists alongside `llm/audit-log-reader.ts`
 *
 * The reader (Phase 11 Task 7) tails the audit-log for NEW entries
 * since a durable watermark; it surfaces per-turn entries to the
 * orchestrator-agent. Its `Affects:` parsing handles the single-line
 * comma-separated form used by the LLM-auditor's structured output.
 *
 * Task 10 lands the cross-reference navigation surface — given any
 * catalog entry, find every audit-log finding that touches it; given
 * any audit-log finding, list the catalog entries it affects. The
 * navigation surface is a library-API contract for future operator
 * UIs (the orchestrator-agent surface; doctor rules; the eventual
 * `dw-lifecycle audit-log` subcommand). Three concerns drive a
 * separate module:
 *
 *   1. Full-file structured parse — Task 10 needs EVERY audit-log
 *      entry (no watermark filter), so a fresh parse path is the right
 *      shape, not a refactor of the watermark-driven reader.
 *
 *   2. Multi-line `Affects:` form — the dispatch spec promises a
 *      YAML-list-style bullet form for `Affects:` (one entry per
 *      line, optionally indented under the field). The reader's
 *      comma-separated single-line form continues to parse as a
 *      back-compat alternative; this parser accepts BOTH.
 *
 *   3. Cross-reference navigation — `findAuditEntriesAffecting()` +
 *      `findCatalogEntriesAffectedBy()` are query primitives over the
 *      parsed entry set. The reader has no analog because watermark-
 *      driven reads don't span the whole log.
 *
 * # Wire shape of `Affects:`
 *
 * The audit-log entry author may surface affected catalog entries in
 * either of two forms:
 *
 *   Single-line comma-separated (legacy / reader-compatible):
 *
 *     Affects: anti-patterns.yaml#legacy-import, clones.yaml#abc123
 *
 *   Multi-line bullet form (Task 10 promotion, preferred for >1 entry):
 *
 *     Affects:
 *       - anti-patterns.yaml#ac-class-consumer
 *       - adopter-manifests.yaml#legacy-button-import
 *
 * The bullet form follows the YAML `-` convention; leading whitespace
 * is permitted (any indentation depth) so authors don't have to count
 * spaces. Each bullet's trailing whitespace is stripped. The form
 * terminates at the next field line (`<Field>: ...`), blank line, or
 * end of entry — whichever comes first.
 *
 * # Entry-id citation shape
 *
 * The dispatch spec describes citations as `<registry-file>#<entry-id>`,
 * e.g. `anti-patterns.yaml#ac-class-consumer`. The parser stores the
 * raw citation string verbatim; navigation helpers strip the `#`
 * suffix to extract the entry-id for cross-reference matching.
 *
 * Both bare-id and `<file>#<id>` citation forms are honored — a future
 * audit-log entry that writes just the id (no file prefix) still
 * resolves via `findAuditEntriesAffecting('<entry-id>')`. The
 * provenance-orphaned-entries doctor rule cross-checks against the
 * registries to validate the full citation.
 */

import { readFile } from 'node:fs/promises';
import { errorMessage, isEnoent } from './typeguards.js';

/**
 * One parsed audit-log entry. Mirrors the shape from `llm/types.ts`
 * `AuditLogEntry` but stays local — Task 10 doesn't depend on the
 * LLM ensemble. The two shapes can converge later if it becomes
 * useful.
 */
export interface ParsedAuditEntry {
  /** Finding-ID — e.g., `AUDIT-20260526-01`. */
  readonly findingId: string;
  /** Status string from the entry (e.g., `open`, `fixed-<sha>`). */
  readonly status: string;
  /** Severity (`blocking | high | medium | low | informational`). */
  readonly severity?: string;
  /** Surface — the affected file/path/section as a free-form string. */
  readonly surface?: string;
  /** The `### <heading>` line (without the `### ` prefix). */
  readonly heading: string;
  /**
   * Catalog citations the entry promises to affect. Each citation is
   * a free-form string — typically `<registry-file>#<entry-id>` OR a
   * bare entry-id. Empty when the entry has no `Affects:` field.
   */
  readonly affects: readonly string[];
  /**
   * Optional `Provenance:` field — names the auditor (or operator)
   * that produced the entry (e.g., `external-auditor (claude-opus-4)`).
   */
  readonly provenance?: string;
  /** 1-based line number of the entry's heading in the source file. */
  readonly lineNumber: number;
  /** Raw markdown body of the entry (trim-trailing-newlines only). */
  readonly body: string;
}

/**
 * Result of `parseAuditLog`. Carries every parsed entry + the source
 * file path the entries came from (so navigation helpers can produce
 * actionable error messages naming the audit-log on disk).
 */
export interface ParsedAuditLog {
  readonly sourcePath: string;
  readonly entries: readonly ParsedAuditEntry[];
}

/** True iff a line matches the `<Field>:   <value>` shape. */
const FIELD_LINE_RE = /^([A-Za-z][A-Za-z0-9 -]+):\s*(.*)$/;

/** True iff a line matches a `### ...` heading. */
const HEADING_LINE_RE = /^###\s+(.+?)\s*$/;

/** True iff a line is a YAML-bullet under a multi-line list field. */
const BULLET_LINE_RE = /^\s*-\s+(.*?)\s*$/;

/**
 * Parse the audit-log markdown at `path`. Returns an empty entry list
 * when the file does not exist (fresh feature with no audit-log yet).
 */
export async function parseAuditLogFile(path: string): Promise<ParsedAuditLog> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return { sourcePath: path, entries: [] };
    throw new Error(`audit-log-parser: cannot read ${path}: ${errorMessage(err)}`);
  }
  const entries = parseAuditLogText(text);
  return { sourcePath: path, entries };
}

/**
 * Parse audit-log markdown text. Pure over the input — accepts the raw
 * content so the parser is usable from in-memory fixtures (test
 * harnesses) without touching the disk.
 *
 * The parser walks the file line-by-line tracking the current entry's
 * field block. A `### ` heading starts a new entry candidate; the
 * candidate becomes a real entry once a `Finding-ID:` field appears.
 * Heading blocks that never carry a `Finding-ID:` (section headings
 * like `## 2026-05-25 Branch Implementation Audit`) are skipped
 * silently — the audit-log mixes section dividers and findings, and
 * only the findings are entries.
 */
export function parseAuditLogText(text: string): readonly ParsedAuditEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: ParsedAuditEntry[] = [];
  let current: EntryAccumulator | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const headingMatch = HEADING_LINE_RE.exec(line);
    if (headingMatch !== null) {
      // Heading boundary — finalize the previous candidate if it's
      // a real entry, then start a new candidate.
      if (current !== null) {
        const finalized = finalizeEntry(current);
        if (finalized !== null) entries.push(finalized);
      }
      current = {
        heading: headingMatch[1] ?? '',
        lineNumber: i + 1,
        findingId: null,
        status: null,
        severity: undefined,
        surface: undefined,
        affects: [],
        provenance: undefined,
        body: [],
        consumingMultiLineField: null,
      };
      continue;
    }
    if (current === null) continue;
    // Multi-line field consumption — when the previous field was a
    // bare `Affects:` (or other list-shaped field) with no inline
    // value, subsequent bullet lines are list members.
    if (current.consumingMultiLineField !== null) {
      const bulletMatch = BULLET_LINE_RE.exec(line);
      if (bulletMatch !== null) {
        const value = (bulletMatch[1] ?? '').trim();
        if (value.length > 0) {
          if (current.consumingMultiLineField === 'Affects') {
            current.affects.push(value);
          }
        }
        continue;
      }
      // End of the multi-line block — fall through to normal field
      // processing.
      current.consumingMultiLineField = null;
    }
    const fieldMatch = FIELD_LINE_RE.exec(line);
    if (fieldMatch !== null) {
      const key = (fieldMatch[1] ?? '').trim();
      const valueRaw = (fieldMatch[2] ?? '').trim();
      const consumed = consumeField(current, key, valueRaw);
      if (consumed) continue;
    }
    current.body.push(line);
  }
  if (current !== null) {
    const finalized = finalizeEntry(current);
    if (finalized !== null) entries.push(finalized);
  }
  return entries;
}

interface EntryAccumulator {
  heading: string;
  lineNumber: number;
  findingId: string | null;
  status: string | null;
  severity: string | undefined;
  surface: string | undefined;
  affects: string[];
  provenance: string | undefined;
  body: string[];
  /** Name of the list-shaped field currently consuming bullet lines. */
  consumingMultiLineField: 'Affects' | null;
}

/**
 * Apply one `Field: value` line to the entry accumulator. Returns true
 * when the line was consumed (caller skips body-append); false when
 * the field key wasn't recognized (caller treats it as body prose).
 *
 * `Affects:` with an empty inline value enters multi-line mode — the
 * subsequent bullet lines become the list members.
 *
 * `Affects:` with a comma-separated inline value parses verbatim
 * (matches the legacy reader's behavior so existing audit logs that
 * use the single-line form continue to work).
 */
function consumeField(
  current: EntryAccumulator,
  key: string,
  value: string,
): boolean {
  if (key === 'Finding-ID') {
    current.findingId = value;
    return true;
  }
  if (key === 'Status') {
    current.status = value;
    return true;
  }
  if (key === 'Severity') {
    if (value.length > 0) current.severity = value;
    return true;
  }
  if (key === 'Surface') {
    if (value.length > 0) current.surface = value;
    return true;
  }
  if (key === 'Provenance') {
    if (value.length > 0) current.provenance = value;
    return true;
  }
  if (key === 'Affects') {
    if (value.length === 0) {
      // Multi-line bullet form — start consuming bullets on subsequent
      // lines until a non-bullet line appears.
      current.consumingMultiLineField = 'Affects';
      return true;
    }
    // Single-line comma-separated form — split + trim + drop empties.
    const items = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const item of items) current.affects.push(item);
    return true;
  }
  return false;
}

function finalizeEntry(acc: EntryAccumulator): ParsedAuditEntry | null {
  if (acc.findingId === null) return null;
  const body = acc.body.join('\n').trim();
  // Build the entry without including undefined fields so exactOptionalPropertyTypes is honored.
  const out: {
    -readonly [K in keyof ParsedAuditEntry]: ParsedAuditEntry[K];
  } = {
    findingId: acc.findingId,
    status: acc.status ?? '',
    heading: acc.heading,
    affects: acc.affects,
    lineNumber: acc.lineNumber,
    body,
  };
  if (acc.severity !== undefined) out.severity = acc.severity;
  if (acc.surface !== undefined) out.surface = acc.surface;
  if (acc.provenance !== undefined) out.provenance = acc.provenance;
  return out;
}

/**
 * Extract the bare entry-id from a citation string. Handles both:
 *   - `<registry-file>#<entry-id>` → `<entry-id>`
 *   - bare `<entry-id>` → `<entry-id>` (passthrough)
 *
 * Returns the input verbatim when no `#` is present so navigation
 * over bare-id citations still works.
 */
export function citationEntryId(citation: string): string {
  const hashIdx = citation.indexOf('#');
  if (hashIdx === -1) return citation;
  return citation.substring(hashIdx + 1);
}

/**
 * Extract the registry-file prefix from a citation string, when one
 * is present. Returns null when the citation is a bare id.
 *
 * Example: `anti-patterns.yaml#ac-class-consumer` → `anti-patterns.yaml`.
 */
export function citationRegistry(citation: string): string | null {
  const hashIdx = citation.indexOf('#');
  if (hashIdx === -1) return null;
  return citation.substring(0, hashIdx);
}

/**
 * Cross-reference navigation: given a catalog entry id, find every
 * audit-log entry whose `Affects:` field references it.
 *
 * Matching is on the entry-id portion of the citation (so a citation
 * like `anti-patterns.yaml#foo-id` matches `foo-id`). When
 * `registryFile` is supplied, citations are additionally required to
 * match either the registry-file prefix OR a bare id — the registry
 * filter narrows the result when the same id might appear in multiple
 * registries.
 */
export function findAuditEntriesAffecting(
  log: ParsedAuditLog,
  catalogEntryId: string,
  registryFile?: string,
): readonly ParsedAuditEntry[] {
  return log.entries.filter((entry) =>
    entry.affects.some((citation) => {
      if (citationEntryId(citation) !== catalogEntryId) return false;
      if (registryFile === undefined) return true;
      const cRegistry = citationRegistry(citation);
      // No registry prefix on the citation → match (bare-id form).
      // Registry prefix present → must equal the supplied filter.
      return cRegistry === null || cRegistry === registryFile;
    }),
  );
}

/**
 * Cross-reference navigation: given an audit-log Finding-ID, list the
 * catalog citations it promises to affect. Returns an empty list when
 * the finding-id isn't in the log OR when the entry has no `Affects:`
 * field.
 */
export function findCatalogEntriesAffectedBy(
  log: ParsedAuditLog,
  findingId: string,
): readonly string[] {
  const entry = log.entries.find((e) => e.findingId === findingId);
  if (entry === undefined) return [];
  return entry.affects;
}

/**
 * Convenience: build a Set of every Finding-ID in the log. Used by the
 * provenance-orphaned-entries doctor rule to validate forward
 * provenance references (`provenance.context: audit-finding-<id>`).
 */
export function auditFindingIdSet(log: ParsedAuditLog): ReadonlySet<string> {
  return new Set(log.entries.map((e) => e.findingId));
}
