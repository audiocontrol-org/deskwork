/**
 * plugins/dw-lifecycle/src/scope-discovery/mediation/propose-catalog-edits.ts
 *
 * Phase 11 Task 3 — given an architectural disposition on a candidate
 * cluster, propose the line-level catalog edits the orchestrator-
 * agent will commit.
 *
 * # Novelty vs. refinement
 *
 * The agent decides — per Phase 11 PRD: "the operator never picks the
 * verb." Decision per Phase 11 Task 3 pre-made decision #3:
 *
 *   - If the cluster's representative shape MATCHES an existing entry's
 *     match_regex (dry-run regex test), propose `edit` to that entry.
 *     The edit widens / tightens / adds excludes_paths to the existing
 *     entry to incorporate the cluster's signal.
 *   - Otherwise, propose `append` — a new entry to the relevant catalog.
 *
 * # Disposition → catalog mapping
 *
 *   blessed  — adopter-manifests (the cluster IS a canonical primitive
 *              that adopter files should consume).
 *   cursed   — anti-patterns (the cluster IS a legacy / forbidden shape
 *              that needs flagging).
 *   ignore   — anti-patterns with status:ignore (records the operator's
 *              false-positive acknowledgement so the orchestrator does
 *              NOT re-propose this cluster).
 *
 * This mapping is deliberate but coarse: the orchestrator-agent may
 * override per cluster (e.g., a `blessed` cluster might belong in
 * pattern-matrix-patterns if the operator's rationale names it as a
 * positive-presence check). The mapping returned here is the default;
 * the call site can post-process.
 *
 * # Reason field — non-deferral enforcement
 *
 * The `reason` field on every proposal must be non-empty. This module
 * enforces non-emptiness; the orchestrator-agent is responsible for
 * ensuring the reason is non-deferral phrasing per the
 * dispatch-grammar.ts forbidden-deferral list. We don't re-check that
 * here (one place, one rule).
 *
 * # Purity
 *
 * Pure over inputs. The caller supplies existing-entries projection;
 * this module derives regex from the cluster + matches against
 * existing entries + produces proposed YAML-compatible objects.
 */

import {
  type Candidate,
  type CatalogEditOperation,
  type CatalogEditProposal,
  type CatalogFile,
  type DispositionInput,
  type ExistingCatalogEntry,
} from './mediation-types.js';

/**
 * Build a conservative regex from the cluster's representative
 * excerpt. The synthesized regex matches the representative excerpt
 * literally (regex-escaped) — the operator can refine to a broader
 * pattern after the agent commits. The conservative shape minimizes
 * false-positive risk on the FIRST scan post-edit.
 *
 * Escapes the 12 regex metacharacters: `.`, `^`, `$`, `*`, `+`, `?`,
 * `(`, `)`, `[`, `]`, `{`, `}`, `|`, `\\`, `/`.
 */
export function deriveLiteralRegex(excerpt: string): string {
  return excerpt.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Default disposition-to-catalog mapping per the Phase 11 design.
 * Callers can override post-hoc; the mapping ships as the default.
 */
function defaultCatalogForDisposition(
  disposition: DispositionInput['disposition'],
): CatalogFile {
  switch (disposition) {
    case 'blessed':
      return 'adopter-manifests';
    case 'cursed':
      return 'anti-patterns';
    case 'ignore':
      return 'anti-patterns';
  }
}

/**
 * Default status to write on the proposed entry. `blessed` and
 * `cursed` map directly; `ignore` produces an `ignore`-status entry
 * (the operator-acknowledged false-positive class).
 */
function statusForDisposition(
  disposition: DispositionInput['disposition'],
): 'blessed' | 'cursed' | 'ignore' {
  return disposition;
}

/**
 * Build the provenance block for a proposed entry. The orchestrator-
 * agent is the source; the rationale (if supplied) lands as `context`
 * to preserve the operator's framing.
 *
 * `authored_at` is left to the caller to supply through a passed-in
 * clock so this module stays pure (no `new Date()` calls); we mirror
 * the existing `synthesizeDefaultProvenance` shape with an explicit
 * `now` argument instead.
 */
function buildProvenance(
  disposition: DispositionInput,
  now: string,
): Readonly<Record<string, unknown>> {
  const provenance: Record<string, unknown> = {
    source: 'orchestrator-agent',
    authored_at: now,
    authored_by: 'orchestrator-agent',
  };
  if (disposition.rationale !== undefined && disposition.rationale.length > 0) {
    provenance.context = disposition.rationale;
  }
  return provenance;
}

/**
 * Find the FIRST existing entry whose `match_regex` matches the
 * cluster's representative excerpt. Stable order — the iteration
 * order of `existingEntries` controls the choice when multiple
 * entries match (callers pre-sort if they want a specific tiebreak).
 *
 * Returns null when no existing entry matches the excerpt — the
 * append (novelty) case.
 *
 * Skips entries with `status: withdrawn` — they are read-only; the
 * agent cannot un-withdraw without an audit-finding-link (a separate
 * recovery path in Phase 11 Task 8).
 */
function findMatchingExistingEntry(
  cluster: Candidate,
  existingEntries: ReadonlyArray<ExistingCatalogEntry>,
  catalog: CatalogFile,
): ExistingCatalogEntry | null {
  for (const existing of existingEntries) {
    if (existing.catalog_file !== catalog) continue;
    if (existing.status === 'withdrawn') continue;
    // Reset lastIndex defensively; the caller's regex may carry the
    // `g` flag from anti-patterns' compile path.
    existing.match_regex.lastIndex = 0;
    if (existing.match_regex.test(cluster.representativeExcerpt)) {
      return existing;
    }
  }
  return null;
}

/**
 * Build the anti-patterns YAML entry shape. The wire format is the
 * subset of `anti_patterns:` entries the parser accepts (see
 * anti-patterns-registry.ts). Required fields populate from the
 * cluster + disposition; the operator can refine after the commit.
 *
 * `added_in` is supplied by the caller (typically the orchestrator-
 * agent's current git HEAD short-sha). The mediation library doesn't
 * shell out to git — it accepts the sha as input to preserve purity.
 */
function buildAntiPatternEntry(args: {
  readonly cluster: Candidate;
  readonly disposition: DispositionInput;
  readonly addedIn: string;
  readonly now: string;
}): Readonly<Record<string, unknown>> {
  const literalRegex = deriveLiteralRegex(args.cluster.representativeExcerpt);
  const message =
    `Discovered candidate cluster ${args.cluster.id}: ` +
    `${args.cluster.members.length} matches across ` +
    `${new Set(args.cluster.members.map((m) => m.file)).size} file(s). ` +
    `Refine match shape after operator review.`;
  return {
    id: args.cluster.id,
    added_in: args.addedIn,
    primitive: `discovered-${args.cluster.id}`,
    from: '<<operator-edit>>',
    shape_regex: literalRegex,
    message,
    status: statusForDisposition(args.disposition.disposition),
    provenance: buildProvenance(args.disposition, args.now),
  };
}

/**
 * Build the adopter-manifests YAML entry shape. The cluster's
 * representative excerpt is treated as the canonical primitive's
 * import shape; the operator refines the actual `from:` path after
 * commit (the caller supplies the operator-edit placeholder).
 *
 * Field names mirror the adopter-manifests-registry parser exactly:
 *   - `expected_adopters_glob:` (NOT `match_glob`)
 *   - `from:` is a non-empty list of import paths
 *   - the parser validates `exceptions`/`tracked_holdouts` paths
 *     against the globs, so we omit those fields (default to empty)
 */
function buildAdopterManifestEntry(args: {
  readonly cluster: Candidate;
  readonly disposition: DispositionInput;
  readonly introducedIn: string;
  readonly now: string;
}): Readonly<Record<string, unknown>> {
  // Deterministic glob proposal: union of the cluster's member file
  // directories with a `**/*` wildcard. The operator refines after
  // commit; this is the "first reasonable starting shape" the pure-
  // compute layer can offer.
  const dirs = new Set<string>();
  for (const m of args.cluster.members) {
    const lastSlash = m.file.lastIndexOf('/');
    dirs.add(lastSlash >= 0 ? m.file.slice(0, lastSlash) : '.');
  }
  const expectedAdoptersGlob = Array.from(dirs)
    .sort()
    .map((d) => `${d}/**/*`);
  return {
    id: args.cluster.id,
    introduced_in: args.introducedIn,
    from: ['<<operator-edit>>'],
    expected_adopters_glob: expectedAdoptersGlob,
    message:
      `Discovered blessed-shape cluster ${args.cluster.id}: ` +
      `${args.cluster.members.length} adopter file(s) identified. ` +
      'Refine `from:` paths + `expected_adopters_glob:` after operator review.',
    status: statusForDisposition(args.disposition.disposition),
    provenance: buildProvenance(args.disposition, args.now),
  };
}

/**
 * Compose a unified-diff-style preview of the proposed change. Used
 * for operator review surfacing; not consumed by the apply layer
 * (which yaml.stringifies `proposed_entry` directly).
 */
function buildDiff(
  operation: CatalogEditOperation,
  catalog: CatalogFile,
  targetId: string | null,
  proposedYamlPreview: string,
): string {
  switch (operation) {
    case 'append':
      return (
        `--- a/.dw-lifecycle/scope-discovery/${catalog}.yaml\n` +
        `+++ b/.dw-lifecycle/scope-discovery/${catalog}.yaml\n` +
        `@@ append new entry @@\n` +
        proposedYamlPreview
          .split('\n')
          .map((l) => `+${l}`)
          .join('\n')
      );
    case 'edit': {
      const target = targetId ?? '<unknown>';
      return (
        `--- a/.dw-lifecycle/scope-discovery/${catalog}.yaml\n` +
        `+++ b/.dw-lifecycle/scope-discovery/${catalog}.yaml\n` +
        `@@ refine entry id=${target} @@\n` +
        proposedYamlPreview
          .split('\n')
          .map((l) => `±${l}`)
          .join('\n')
      );
    }
    case 'mark-withdrawn': {
      const target = targetId ?? '<unknown>';
      return (
        `--- a/.dw-lifecycle/scope-discovery/${catalog}.yaml\n` +
        `+++ b/.dw-lifecycle/scope-discovery/${catalog}.yaml\n` +
        `@@ mark withdrawn id=${target} @@\n` +
        proposedYamlPreview
          .split('\n')
          .map((l) => `±${l}`)
          .join('\n')
      );
    }
  }
}

/**
 * Render a YAML-compatible plain object to a deterministic preview
 * string. NOT a real YAML serializer — purely for the diff field's
 * human-readability surface. Real serialization happens at the apply
 * layer via the `yaml` library.
 */
function previewYaml(entry: Readonly<Record<string, unknown>>): string {
  const lines: string[] = [`- id: ${stringify(entry['id'])}`];
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'id') continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`  ${key}:`);
      for (const v of value) lines.push(`    - ${stringify(v)}`);
      continue;
    }
    if (typeof value === 'object') {
      lines.push(`  ${key}:`);
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`    ${k2}: ${stringify(v2)}`);
      }
      continue;
    }
    lines.push(`  ${key}: ${stringify(value)}`);
  }
  return lines.join('\n');
}

function stringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') {
    // Quote strings containing special chars; otherwise emit bare.
    if (/[:#\n]/.test(value) || value.length === 0) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Input to `proposeCatalogEdits`. Bundled so the call site can pass
 * the orchestrator-agent's current clock + git-head sha + per-cluster
 * disposition map in one shot. All fields are inputs; the function
 * is pure.
 */
export interface ProposeCatalogEditsInput {
  readonly clusters: ReadonlyArray<Candidate>;
  readonly dispositions: ReadonlyArray<DispositionInput>;
  readonly existingEntries: ReadonlyArray<ExistingCatalogEntry>;
  /** ISO-8601 timestamp written into `provenance.authored_at`. */
  readonly now: string;
  /**
   * Git short-sha for `added_in:` / `introduced_in:` fields. Caller
   * supplies via `git rev-parse --short HEAD`; mediation stays pure.
   */
  readonly addedIn: string;
}

/**
 * Public entry-point: given clusters + operator dispositions + existing-
 * entries projection, return the line-level catalog edits the
 * orchestrator-agent will commit. Pure over inputs.
 *
 * Validation:
 *   - dispositions[].clusterId must reference a cluster in `clusters`;
 *     unknown ids throw (loud failure, no silent skip).
 *   - clusters without a disposition are SKIPPED (no proposal). The
 *     operator may triage in a later pass.
 */
export function proposeCatalogEdits(
  input: ProposeCatalogEditsInput,
): ReadonlyArray<CatalogEditProposal> {
  const clusterById = new Map<string, Candidate>();
  for (const c of input.clusters) clusterById.set(c.id, c);
  for (const d of input.dispositions) {
    if (!clusterById.has(d.clusterId)) {
      throw new Error(
        `propose-catalog-edits: disposition references unknown cluster id ` +
          `"${d.clusterId}". Known cluster ids: ` +
          `${Array.from(clusterById.keys()).join(', ') || '(none)'}.`,
      );
    }
  }
  const out: CatalogEditProposal[] = [];
  for (const disposition of input.dispositions) {
    const cluster = clusterById.get(disposition.clusterId);
    if (cluster === undefined) {
      // Defensively unreachable (checked above) but TS doesn't know.
      throw new Error(
        `propose-catalog-edits: internal — cluster ${disposition.clusterId} not found ` +
          `after pre-validation pass; refusing to silently skip`,
      );
    }
    out.push(proposeOneEdit(cluster, disposition, input));
  }
  return out;
}

/**
 * Compose the proposed entry + decide operation (append vs edit) for
 * a single cluster/disposition pair.
 */
function proposeOneEdit(
  cluster: Candidate,
  disposition: DispositionInput,
  input: ProposeCatalogEditsInput,
): CatalogEditProposal {
  const catalog = defaultCatalogForDisposition(disposition.disposition);
  const existing = findMatchingExistingEntry(cluster, input.existingEntries, catalog);
  const operation: CatalogEditOperation = existing !== null ? 'edit' : 'append';
  const proposedEntry =
    catalog === 'anti-patterns'
      ? buildAntiPatternEntry({
          cluster,
          disposition,
          addedIn: input.addedIn,
          now: input.now,
        })
      : buildAdopterManifestEntry({
          cluster,
          disposition,
          introducedIn: input.addedIn,
          now: input.now,
        });
  const targetEntryId = existing !== null ? existing.entry_id : null;
  const preview = previewYaml(proposedEntry);
  const diff = buildDiff(operation, catalog, targetEntryId, preview);
  const reason = buildReason(cluster, disposition, operation, existing);
  if (reason.length === 0) {
    throw new Error(
      `propose-catalog-edits: reason field came out empty for cluster ${cluster.id}. ` +
        'This is a mediation-layer invariant violation; the reason is required ' +
        'so the resulting entry carries a non-deferral provenance.context.',
    );
  }
  return {
    catalog_file: catalog,
    operation,
    target_entry_id: targetEntryId,
    proposed_entry: proposedEntry,
    diff,
    reason,
  };
}

/**
 * Compose the proposal's reason — concise, non-deferral, names the
 * cluster + the operator's disposition + the operation chosen.
 */
function buildReason(
  cluster: Candidate,
  disposition: DispositionInput,
  operation: CatalogEditOperation,
  existing: ExistingCatalogEntry | null,
): string {
  const baseReason =
    `Cluster ${cluster.id} (${cluster.members.length} member(s)) ` +
    `dispositioned ${disposition.disposition} by operator.`;
  const operationNote =
    operation === 'edit' && existing !== null
      ? ` Refining existing entry ${existing.entry_id} (regex matched representative shape).`
      : ' Appending new entry (representative shape did not match any existing entry).';
  if (disposition.rationale !== undefined && disposition.rationale.length > 0) {
    return `${baseReason}${operationNote} Operator rationale: ${disposition.rationale}`;
  }
  return `${baseReason}${operationNote}`;
}
