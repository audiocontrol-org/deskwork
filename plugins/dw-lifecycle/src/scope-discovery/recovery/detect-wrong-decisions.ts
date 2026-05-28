/**
 * plugins/dw-lifecycle/src/scope-discovery/recovery/detect-wrong-decisions.ts
 *
 * Detection of wrong auto-dispositions.
 *
 * # What "wrong" means here
 *
 * Per task pre-made decision #1, a "wrong-decision" is a catalog entry
 * whose status was set by an agent source (`orchestrator-agent` or
 * `llm-judge-proposed`) and that an audit-log finding has since marked
 * with `Affects: <catalog-entry>` where the finding's body text contains
 * one of the disagreement tokens (`overturn`, `wrong`, `incorrect`,
 * `disagree`, `reverse`).
 *
 * The detector consumes:
 *   - The parsed audit-log (typically all entries since the recovery
 *     module's last run; the orchestrator filters by watermark
 *     externally).
 *   - A catalog-state view: a snapshot mapping
 *     `(registryPath, entryId)` → `{ status, provenance, patternType? }`.
 *     The view is library-supplied because the recovery module is
 *     registry-agnostic — every registry produces entries with the
 *     standard `CatalogEntryMetadata`; the detector doesn't need to
 *     know which registry each entry came from beyond the path.
 *
 * The detector produces an unordered list of `WrongDecisionEvent`s.
 * Reversal proposal generation lives in `reverse-disposition.ts`.
 *
 * # Disagreement-token text search
 *
 * The text-search is case-insensitive and matches whole words OR
 * compound terms. We deliberately keep the token set small and
 * conservative; future iteration can broaden via tooling-feedback +
 * additional patterns. The token set:
 *
 *   - overturn / overturns / overturned / overturning
 *   - wrong / wrongly / wrongful
 *   - incorrect / incorrectly
 *   - disagree / disagrees / disagreed / disagreement
 *   - reverse / reverses / reversed
 *
 * Matching uses a regex with the `\b` word boundary so casual prose
 * mentions ("not wrong" / "appears overturned") still trigger; the
 * conservative-default of OVER-detecting matches the operator's stance
 * (capture mode: surface every plausible wrong-decision; let the
 * orchestrator decide whether to act on the proposal).
 */

import type { ParsedAuditLog, ParsedAuditEntry } from '../util/audit-log-parser.js';
import {
  citationEntryId,
  citationRegistry,
} from '../util/audit-log-parser.js';
import type {
  CatalogEntryMetadata,
  CatalogStatus,
  Provenance,
} from '../util/catalog-status.js';
import type { WrongDecisionEvent } from './recovery-types.js';

/**
 * A single catalog-entry view used by the detector. The recovery
 * module is registry-agnostic; each entry is keyed by
 * `(registryPath, entryId)` and exposes its current `status` +
 * `provenance` plus an optional `patternType` token for systematic-
 * wrongness classification.
 */
export interface CatalogEntryView {
  readonly registryPath: string;
  readonly entryId: string;
  readonly status: CatalogStatus;
  readonly provenance: Provenance;
  /**
   * Pattern-type token from the entry's classification (when present).
   * Carried verbatim onto `WrongDecisionEvent.patternType` when the
   * detector matches a finding to the entry. Optional because not all
   * registries' entries have a pattern-type.
   */
  readonly patternType?: string;
}

/**
 * Input to `detectWrongDecisions`. The orchestrator assembles each
 * field before invocation:
 *
 *   - `auditLog` — typically the WHOLE log; the orchestrator filters
 *     entries by a watermark separately if desired. Re-detecting the
 *     same wrong-decision twice is harmless because the reversal
 *     proposal is idempotent in shape.
 *
 *   - `catalogEntries` — view of every catalog entry under
 *     consideration. The detector only ever matches entries to audit
 *     findings via the entry-id + (optional) registry filter; entries
 *     beyond the affected ids are not inspected. Passing the whole
 *     catalog is fine but wasteful for large registries.
 *
 *   - `detectedAt` — ISO-8601 timestamp the detection ran at; copied
 *     verbatim onto each emitted event so the orchestrator can
 *     correlate events with controller turns.
 */
export interface DetectWrongDecisionsInput {
  readonly auditLog: ParsedAuditLog;
  readonly catalogEntries: ReadonlyArray<CatalogEntryView>;
  readonly detectedAt: string;
}

/**
 * Set of disagreement tokens; case-insensitive whole-word matching.
 * Kept small + conservative per the module docstring. The regex is
 * compiled once at module load.
 */
const DISAGREEMENT_PATTERN = new RegExp(
  String.raw`\b(?:` +
    [
      'overturn(?:s|ed|ing)?',
      'wrong(?:ly|ful)?',
      'incorrect(?:ly)?',
      'disagree(?:s|d|ment)?',
      'reverse(?:s|d)?',
    ].join('|') +
    String.raw`)\b`,
  'i',
);

/**
 * Inspect the audit-log entry's body for any disagreement token.
 * Returns the matched token (lowercased) when a hit; `null` otherwise.
 */
function matchedDisagreementToken(entry: ParsedAuditEntry): string | null {
  if (entry.body.length === 0) return null;
  const match = DISAGREEMENT_PATTERN.exec(entry.body);
  if (match === null) return null;
  return (match[0] ?? '').toLowerCase();
}

/**
 * Build a fast lookup from `(registryPath, entryId)` → view. The map
 * key uses the same `<registry>#<entry>` shape as `<file>#<id>`
 * citations so the citation tokenizer can resolve directly. We also
 * stash a secondary lookup keyed only by `entryId` so bare-id
 * citations (no registry prefix) still resolve.
 */
function indexCatalog(
  entries: ReadonlyArray<CatalogEntryView>,
): {
  readonly byCompositeKey: ReadonlyMap<string, CatalogEntryView>;
  readonly byEntryId: ReadonlyMap<string, ReadonlyArray<CatalogEntryView>>;
} {
  const byCompositeKey = new Map<string, CatalogEntryView>();
  const byEntryId = new Map<string, CatalogEntryView[]>();
  for (const view of entries) {
    const key = `${view.registryPath}#${view.entryId}`;
    byCompositeKey.set(key, view);
    const existing = byEntryId.get(view.entryId);
    if (existing === undefined) {
      byEntryId.set(view.entryId, [view]);
    } else {
      existing.push(view);
    }
  }
  return { byCompositeKey, byEntryId };
}

/**
 * Resolve one citation string to the catalog-entry view it names.
 *
 * - `<registry>#<id>` citations match via the composite key.
 * - Bare `<id>` citations match via the by-entry-id lookup. If
 *   multiple registries hold an entry with the same id, the resolver
 *   returns ALL matches (the detector emits one wrong-decision event
 *   per match — same disagreement, different entries).
 *
 * Returns an empty list when no entry matches.
 */
function resolveCitation(
  citation: string,
  byCompositeKey: ReadonlyMap<string, CatalogEntryView>,
  byEntryId: ReadonlyMap<string, ReadonlyArray<CatalogEntryView>>,
): ReadonlyArray<CatalogEntryView> {
  const reg = citationRegistry(citation);
  const id = citationEntryId(citation);
  if (reg !== null) {
    const hit = byCompositeKey.get(`${reg}#${id}`);
    if (hit !== undefined) return [hit];
    // Citation specified a registry but no match — return empty;
    // bare-id fallback would silently cross-match wrong registries.
    return [];
  }
  const matches = byEntryId.get(id);
  if (matches === undefined) return [];
  return matches;
}

/**
 * Predicate: the entry's provenance source is one the recovery module
 * cares about (agent-driven only).
 */
function isAgentDriven(metadata: CatalogEntryMetadata): boolean {
  const source = metadata.provenance.source;
  return source === 'orchestrator-agent' || source === 'llm-judge-proposed';
}

/**
 * Build a `WrongDecisionEvent` from a matched audit entry + catalog
 * entry view. The detector populates `detectionGrounds` from the
 * matched disagreement token so the orchestrator's surfacing of the
 * event has a one-line explanation.
 */
function buildEvent(
  view: CatalogEntryView,
  auditEntry: ParsedAuditEntry,
  token: string,
  detectedAt: string,
): WrongDecisionEvent {
  // Narrow once for type-system: we've already filtered via
  // `isAgentDriven`, so we know the source is one of the two literal
  // values, but the function signature still types `Provenance.source`
  // as the full union. We re-narrow with explicit conditionals (no
  // cast) so the field of `WrongDecisionEvent` types correctly.
  const priorSource = view.provenance.source;
  const narrowed: 'orchestrator-agent' | 'llm-judge-proposed' =
    priorSource === 'orchestrator-agent'
      ? 'orchestrator-agent'
      : 'llm-judge-proposed';
  const out: {
    -readonly [K in keyof WrongDecisionEvent]: WrongDecisionEvent[K];
  } = {
    catalogEntryId: view.entryId,
    registryPath: view.registryPath,
    findingId: auditEntry.findingId,
    priorStatus: view.status,
    priorProvenanceSource: narrowed,
    detectionGrounds:
      `audit-log finding ${auditEntry.findingId} body contains ` +
      `disagreement token "${token}" and affects ${view.entryId}`,
    detectedAt,
  };
  if (view.patternType !== undefined) {
    out.patternType = view.patternType;
  }
  return out;
}

/**
 * Detection entry-point. Walks the parsed audit-log; for each entry
 * carrying a disagreement token in its body, resolves the entry's
 * `affects:` citations against the catalog view and emits a
 * `WrongDecisionEvent` for every agent-driven affected entry.
 *
 * Returned events are in the order discovered (audit-log entries in
 * file order, then citations within each entry in field order). The
 * detector does NOT deduplicate — if the same audit entry's affects
 * list cites the same id under different registries, both are
 * emitted; the consumer (reversal-proposal or systematic-wrongness)
 * decides whether collapsing is appropriate.
 */
export function detectWrongDecisions(
  input: DetectWrongDecisionsInput,
): ReadonlyArray<WrongDecisionEvent> {
  const events: WrongDecisionEvent[] = [];
  const { byCompositeKey, byEntryId } = indexCatalog(input.catalogEntries);
  for (const auditEntry of input.auditLog.entries) {
    const token = matchedDisagreementToken(auditEntry);
    if (token === null) continue;
    if (auditEntry.affects.length === 0) continue;
    for (const citation of auditEntry.affects) {
      const matches = resolveCitation(citation, byCompositeKey, byEntryId);
      for (const view of matches) {
        if (!isAgentDriven(view)) continue;
        events.push(buildEvent(view, auditEntry, token, input.detectedAt));
      }
    }
  }
  return events;
}

/**
 * Convenience: filter a detected-events list down to those whose
 * `findingId` is strictly greater than the supplied watermark
 * (string-compare; the `AUDIT-YYYYMMDD-NN` format sorts correctly).
 * Used by orchestrator-facing wiring that wants to act only on events
 * surfaced since the previous turn.
 */
export function filterByWatermark(
  events: ReadonlyArray<WrongDecisionEvent>,
  watermark: string,
): ReadonlyArray<WrongDecisionEvent> {
  if (watermark.length === 0) return events;
  return events.filter((e) => e.findingId > watermark);
}
