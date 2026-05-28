/**
 * plugins/dw-lifecycle/src/scope-discovery/util/catalog-status.ts
 *
 * The Loop foundation. Shared `status:` + `provenance:`
 * shape applied uniformly to EVERY catalog entry type in the registry-
 * driven scanners (anti-patterns, adopter-manifests, pattern-matrix,
 * clones, deprecations, editor-symmetry).
 *
 * # Why this lives in one module
 *
 * The Loop is a cross-cutting concern: every catalog entry needs the
 * same status + provenance shape so the scanners can filter on it
 * uniformly and so the orchestrator-agent (orchestrator-agent mediation) can edit
 * dispositions without learning each registry's bespoke wire shape.
 * Co-locating the type + parser + filter predicate here keeps every
 * scanner's per-entry parse path branchless: `parseCatalogStatus(raw)`
 * → `{ status, provenance }`, append, done.
 *
 * # Status discriminator
 *
 *   pending          — discovered candidate awaiting operator triage.
 *                      Scanners SKIP `pending` entries (they are not yet
 *                      blessed; firing on a pending entry would surface
 *                      noise before the operator has decided).
 *   blessed          — actively enforced. Default for hand-authored
 *                      entries (back-compat with pre-Loop registries).
 *                      Scanners enforce on blessed + cursed.
 *   cursed           — actively enforced as a NEGATIVE pattern (e.g.,
 *                      legacy shape that should be flagged on sight).
 *                      Same enforcement path as `blessed`; the
 *                      discriminator is for semantic clarity in the
 *                      operator surface (the orchestrator-agent uses it
 *                      to decide whether to propose a refinement vs. a
 *                      new entry).
 *   ignore           — operator-acknowledged false-positive class.
 *                      Scanners skip these; the orchestrator surfaces
 *                      them in the discovered-candidates view but does
 *                      not re-propose them.
 *   tracked-holdout  — known holdout deferred to a tracked issue. The
 *                      semantic mirrors adopter-manifests'
 *                      `tracked_holdouts:` field. Scanners skip — the
 *                      gate stays green because there's a tracked
 *                      follow-up.
 *   withdrawn        — entry overturned by an auditor finding. Carries
 *                      `provenance.context: 'audit-finding-<id>'`
 *                      linking to the audit-log finding. Entries are
 *                      NEVER deleted from the registry — `withdrawn`
 *                      preserves history (mirrors the audit-log
 *                      `withdrawn-<date>` convention).
 *
 * # Default behavior (backward compatibility)
 *
 * Entries that omit `status:` synthesize `status: 'blessed'` at parse
 * time, with `provenance: { source: 'install-seed', authored_at: <epoch> }`.
 * The doctor rule `catalog-entry-missing-status` surfaces these as
 * warnings so the operator gets a nudge to declare status explicitly,
 * but the runtime continues to enforce them (the pre-Loop behavior).
 *
 * # Filtering semantics
 *
 * `isActivelyEnforced(status)` is the predicate scanners use to decide
 * whether to apply an entry. `blessed` and `cursed` return true; every
 * other status returns false. Pre-Loop callsites that previously did
 * `for (const entry of registry.entries)` should pipe through
 * `filterActiveEntries(registry.entries)` to preserve the pre-Loop
 * enforcement surface while honoring the new status discriminator.
 *
 * # Provenance shape
 *
 * Provenance is REQUIRED for any entry with a non-default status. For
 * default-status entries the parser synthesizes
 * `{ source: 'install-seed', authored_at: '1970-01-01T00:00:00Z' }`
 * which the doctor rule's missing-status finding then surfaces as
 * "add explicit provenance for tracking."
 */

import { isPlainObject } from './typeguards.js';

/**
 * Status discriminator. Discriminated string union; the runtime parser
 * accepts any of these literals and rejects unknown values loudly.
 */
export type CatalogStatus =
  | 'pending'
  | 'blessed'
  | 'cursed'
  | 'ignore'
  | 'tracked-holdout'
  | 'withdrawn';

/**
 * Provenance source — where the entry came from. The dispositions are
 * mutually exclusive; the orchestrator-agent surfaces this on the
 * "discovered candidates" view so the operator can triage agent-
 * proposed vs operator-authored entries differently.
 *
 *   operator-authored        — hand-edited by an operator.
 *   orchestrator-agent       — proposed by the dw-lifecycle orchestrator
 *                              agent (orchestrator-agent mediation).
 *   llm-judge-proposed       — proposed by the in-band LLM judge
 *                              (the LLM judge + external auditor).
 *   install-seed             — placeholder for pre-Loop entries that
 *                              omit `provenance:`; synthesized at parse
 *                              time so the doctor rule can warn.
 *   promoted-from-candidate  — was once `pending` (discovered
 *                              candidate), promoted by operator
 *                              triage to its current status. The
 *                              provenance.context names the original
 *                              candidate's discovery context.
 */
export type ProvenanceSource =
  | 'operator-authored'
  | 'orchestrator-agent'
  | 'llm-judge-proposed'
  | 'install-seed'
  | 'promoted-from-candidate';

/**
 * Provenance block. `authored_at` is ISO-8601. `authored_by` is a free-
 * form human-or-agent identifier (e.g. "@oletizi", "orchestrator-agent",
 * "judge-<model>"); the parser does not constrain its shape.
 * `context` carries a tracking ref (typically `scan-run-id-<id>` or
 * `audit-finding-<id>`); for `withdrawn` status the value MUST start
 * with `audit-finding-` (the reversibility primitive's contract).
 * `evidence_link` is a URL or repo-relative path pointing at the
 * justifying evidence (a scan run, a screenshot, an audit-log entry).
 */
export interface Provenance {
  readonly source: ProvenanceSource;
  readonly authored_at: string;
  readonly authored_by?: string;
  readonly context?: string;
  readonly evidence_link?: string;
}

/**
 * Composite metadata appended to every parsed catalog entry. The
 * scanners destructure this on each entry and surface it to the
 * orchestrator-agent verbatim.
 */
export interface CatalogEntryMetadata {
  readonly status: CatalogStatus;
  readonly provenance: Provenance;
}

/** The default status when the registry entry omits `status:`. */
export const DEFAULT_STATUS: CatalogStatus = 'blessed';

/**
 * The placeholder ISO-8601 timestamp used when synthesizing a default
 * provenance block. Matches `install-scope-discovery`'s placeholder for
 * `generated_at` in clones.yaml — the epoch is a clear signal to the
 * doctor rule that no operator has authored real provenance yet.
 */
export const INSTALL_SEED_EPOCH = '1970-01-01T00:00:00Z';

/** Synthesize a default provenance for entries that omit the block. */
export function synthesizeDefaultProvenance(): Provenance {
  return {
    source: 'install-seed',
    authored_at: INSTALL_SEED_EPOCH,
  };
}

/** Synthesize the default metadata pair (status + provenance). */
export function synthesizeDefaultMetadata(): CatalogEntryMetadata {
  return {
    status: DEFAULT_STATUS,
    provenance: synthesizeDefaultProvenance(),
  };
}

const ALLOWED_STATUSES: ReadonlyArray<CatalogStatus> = [
  'pending',
  'blessed',
  'cursed',
  'ignore',
  'tracked-holdout',
  'withdrawn',
];

const ALLOWED_PROVENANCE_SOURCES: ReadonlyArray<ProvenanceSource> = [
  'operator-authored',
  'orchestrator-agent',
  'llm-judge-proposed',
  'install-seed',
  'promoted-from-candidate',
];

/**
 * Result of `parseCatalogEntryMetadata`. The `synthesized` flag tells
 * the doctor rule whether the entry omitted the field (true) or
 * authored it explicitly (false). Synthesized entries are not invalid
 * — they continue to enforce — but the doctor rule warns to nudge
 * adopters toward declaring status explicitly going forward.
 */
export interface CatalogMetadataParseResult {
  readonly metadata: CatalogEntryMetadata;
  /** True iff `status:` field was absent (synthesized to default). */
  readonly statusSynthesized: boolean;
  /** True iff `provenance:` block was absent (synthesized to default). */
  readonly provenanceSynthesized: boolean;
}

/**
 * Parse the optional `status:` + `provenance:` block from a raw catalog
 * entry. Mutates nothing; pure over the input object. `ctx` and
 * `namespace` are used to prefix error messages so the parse failure
 * names the offending entry.
 *
 * Validation:
 *   - `status:` (when set) must be one of the six allowed literals.
 *   - `provenance:` (when set) must be a mapping with `source:` (one of
 *     the five allowed source literals) and `authored_at:` (non-empty
 *     ISO-8601-shaped string; we don't parse it, but we reject empty).
 *   - `withdrawn` status carries an additional invariant:
 *     `provenance.context` MUST start with `audit-finding-` (the
 *     reversibility primitive's contract). The parser enforces this
 *     loudly so an entry can't silently land in `withdrawn` without
 *     the linkage.
 */
export function parseCatalogEntryMetadata(
  raw: Record<string, unknown>,
  ctx: string,
  namespace: string,
): CatalogMetadataParseResult {
  const statusRaw = raw['status'];
  const provenanceRaw = raw['provenance'];

  const statusSynthesized = statusRaw === undefined || statusRaw === null;
  const provenanceSynthesized = provenanceRaw === undefined || provenanceRaw === null;

  const status = statusSynthesized
    ? DEFAULT_STATUS
    : parseStatus(statusRaw, ctx, namespace);

  const provenance = provenanceSynthesized
    ? synthesizeDefaultProvenance()
    : parseProvenance(provenanceRaw, ctx, namespace);

  // Reversibility-primitive invariant: a `withdrawn` status MUST carry
  // `provenance.context: 'audit-finding-<id>'` so the linkage is
  // discoverable on read. The doctor rule `provenance-orphaned-entries`
  // (the audit-log provenance link) cross-checks against the audit-log.
  if (status === 'withdrawn') {
    if (provenance.context === undefined || !provenance.context.startsWith('audit-finding-')) {
      throw new Error(
        `${namespace}: ${ctx} \`status: withdrawn\` requires ` +
          `\`provenance.context\` starting with \`audit-finding-\` ` +
          `(the reversibility primitive's contract — see catalog status + provenance + Task 10).`,
      );
    }
  }

  return {
    metadata: { status, provenance },
    statusSynthesized,
    provenanceSynthesized,
  };
}

function parseStatus(raw: unknown, ctx: string, namespace: string): CatalogStatus {
  if (typeof raw !== 'string') {
    throw new Error(
      `${namespace}: ${ctx} \`status\` must be a string; got ${typeof raw}`,
    );
  }
  const matched = ALLOWED_STATUSES.find((s) => s === raw);
  if (matched === undefined) {
    throw new Error(
      `${namespace}: ${ctx} \`status\` must be one of ` +
        `${ALLOWED_STATUSES.join(', ')}; got "${raw}"`,
    );
  }
  return matched;
}

function parseProvenance(raw: unknown, ctx: string, namespace: string): Provenance {
  if (!isPlainObject(raw)) {
    throw new Error(
      `${namespace}: ${ctx} \`provenance\` must be a mapping; got ${typeof raw}`,
    );
  }
  const sourceRaw = raw['source'];
  if (typeof sourceRaw !== 'string') {
    throw new Error(
      `${namespace}: ${ctx} \`provenance.source\` must be a string; got ${typeof sourceRaw}`,
    );
  }
  const source = ALLOWED_PROVENANCE_SOURCES.find((s) => s === sourceRaw);
  if (source === undefined) {
    throw new Error(
      `${namespace}: ${ctx} \`provenance.source\` must be one of ` +
        `${ALLOWED_PROVENANCE_SOURCES.join(', ')}; got "${sourceRaw}"`,
    );
  }
  const authoredAtRaw = raw['authored_at'];
  if (typeof authoredAtRaw !== 'string' || authoredAtRaw.length === 0) {
    throw new Error(
      `${namespace}: ${ctx} \`provenance.authored_at\` must be a non-empty string (ISO-8601); ` +
        `got ${typeof authoredAtRaw}`,
    );
  }
  const out: { -readonly [K in keyof Provenance]: Provenance[K] } = {
    source,
    authored_at: authoredAtRaw,
  };
  const authoredBy = raw['authored_by'];
  if (authoredBy !== undefined && authoredBy !== null) {
    if (typeof authoredBy !== 'string' || authoredBy.length === 0) {
      throw new Error(
        `${namespace}: ${ctx} \`provenance.authored_by\` must be a non-empty string when set; ` +
          `got ${typeof authoredBy}`,
      );
    }
    out.authored_by = authoredBy;
  }
  const context = raw['context'];
  if (context !== undefined && context !== null) {
    if (typeof context !== 'string' || context.length === 0) {
      throw new Error(
        `${namespace}: ${ctx} \`provenance.context\` must be a non-empty string when set; ` +
          `got ${typeof context}`,
      );
    }
    out.context = context;
  }
  const evidenceLink = raw['evidence_link'];
  if (evidenceLink !== undefined && evidenceLink !== null) {
    if (typeof evidenceLink !== 'string' || evidenceLink.length === 0) {
      throw new Error(
        `${namespace}: ${ctx} \`provenance.evidence_link\` must be a non-empty string when set; ` +
          `got ${typeof evidenceLink}`,
      );
    }
    out.evidence_link = evidenceLink;
  }
  return out;
}

/**
 * Predicate: returns true iff the entry should be actively enforced by
 * the scanner. `blessed` + `cursed` return true; every other status
 * returns false (pending / ignore / tracked-holdout / withdrawn are
 * all out-of-band for enforcement).
 *
 * Scanners pipe `registry.entries` through `filterActiveEntries` to
 * preserve the pre-Loop enforcement surface; non-active entries are
 * accessible to the orchestrator-agent (and the discovered-candidates
 * view) via the unfiltered list.
 */
export function isActivelyEnforced(status: CatalogStatus): boolean {
  return status === 'blessed' || status === 'cursed';
}

/**
 * Parse the OPTIONAL `audit_history:` field from a
 * raw catalog entry. The field is the REVERSE provenance link: it
 * names every audit-log Finding-ID that referenced this entry over
 * time. Forward provenance (`provenance.context: audit-finding-<id>`)
 * names the SINGLE event that produced the current state; this list
 * preserves the cumulative history.
 *
 * Wire shape — list of non-empty strings:
 *
 *   audit_history:
 *     - AUDIT-20260526-01
 *     - AUDIT-20260527-03
 *
 * Returns an empty array when absent (back-compat). Throws on shape
 * violation (non-array OR non-string element OR empty string) — same
 * loud-failure stance as the other parser helpers.
 *
 * The doctor rule `provenance-orphaned-entries` cross-checks each
 * entry's `audit_history:` against the audit-log to surface broken
 * references.
 */
export function parseAuditHistory(
  raw: unknown,
  ctx: string,
  namespace: string,
): readonly string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(
      `${namespace}: ${ctx} \`audit_history\` must be a list of strings; got ${typeof raw}`,
    );
  }
  return raw.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `${namespace}: ${ctx} \`audit_history[${index}]\` must be a non-empty string; ` +
          `got ${typeof value}`,
      );
    }
    return value;
  });
}

/**
 * Convenience filter: returns the subset of entries with actively-
 * enforced status. Generic over entry shape; each scanner uses this
 * with its own entry interface that embeds `CatalogEntryMetadata`.
 */
export function filterActiveEntries<T extends { readonly status: CatalogStatus }>(
  entries: readonly T[],
): readonly T[] {
  return entries.filter((e) => isActivelyEnforced(e.status));
}
