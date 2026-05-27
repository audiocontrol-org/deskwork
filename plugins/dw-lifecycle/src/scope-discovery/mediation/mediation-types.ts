/**
 * plugins/dw-lifecycle/src/scope-discovery/mediation/mediation-types.ts
 *
 * Phase 11 Task 3 — orchestrator-agent mediation surface.
 *
 * The mediation layer translates between LINE-LEVEL scan results (raw
 * pattern findings, regex hits, file paths) and ARCHITECTURE-SCALE
 * operator dispositions (one disposition per cluster of similar
 * shapes). The thesis (PRD Phase 11): the operator never edits regex,
 * the agent never picks the architectural disposition.
 *
 * # Layered shape
 *
 * Raw findings (DiscoveryAgentFinding[]) — what scanners produce.
 *           ↓ cluster-candidates.ts (Jaccard n-gram similarity)
 * Candidate clusters (Candidate[]) — groups of shape-similar findings.
 *           ↓ summarize per cluster
 * ArchitecturalSummary[] — 1-2 sentence operator-readable summaries.
 *           ↓ operator triages each cluster: BLESSED / CURSED / IGNORE
 * Disposition map (clusterId → ArchitecturalDisposition)
 *           ↓ propose-catalog-edits.ts (novelty vs refinement decision)
 * CatalogEditProposal[] — line-level catalog edits the agent commits.
 *
 * # Why this lives in one module
 *
 * Mediation is a CROSS-CUTTING concern: every catalog type (anti-
 * patterns, adopter-manifests, pattern-matrix, etc.) goes through the
 * same cluster → disposition → edit flow. Co-locating the types here
 * keeps the orchestrator's call site readable; each registry-specific
 * adapter is a separate proposal generator that consumes these shapes.
 *
 * # Purity contract
 *
 * The mediation library is PURE computation:
 *   - cluster-candidates.ts: pure over its inputs (no FS, no network).
 *   - propose-catalog-edits.ts: pure (existing-entries are passed in).
 *   - mediation.ts: orchestrator entry-point; composes the above two.
 *
 * State + I/O happen at the call site — `scope-inventory` (read raw
 * findings, write `discovered_candidates:` section of the manifest)
 * and `/dw-lifecycle:implement` (apply the catalog edits to disk).
 */

import type { PatternFinding } from '../discovery-agents/types.js';

/**
 * One member of a candidate cluster. Always carries a path so the
 * operator can navigate to evidence; carries `excerpt` so the cluster
 * summary can reference verbatim matched text without reading the
 * source again.
 */
export interface CandidateMember {
  /** Repo-relative POSIX path of the source file. */
  readonly file: string;
  /** 1-indexed source line; undefined for whole-file findings. */
  readonly line?: number;
  /** Verbatim matched text (trimmed) — feeds the cluster summary. */
  readonly excerpt: string;
  /**
   * The provenance tag from the finding that produced this member.
   * Mediation surfaces this so the orchestrator can route candidates
   * sourced from registered-pattern matches (operator already authored
   * the pattern; only the file is new) differently from candidates
   * sourced from negative-space / outlier handlers (genuinely novel
   * shapes).
   */
  readonly provenance: PatternFinding['provenance'];
}

/**
 * A clustered candidate class — output of `clusterCandidates`. The
 * orchestrator-agent surfaces one entry per cluster to the operator
 * at architecture-scale; the operator triages each cluster as a unit.
 *
 * - `id`: stable cluster id, deterministic from cluster contents (the
 *   sorted concatenation of member files + line numbers, hashed). Lets
 *   re-runs of `clusterCandidates` against the same findings produce
 *   the same id, useful for de-dup across scan runs.
 * - `shapeFingerprint`: the n-gram set the cluster cohered around.
 *   Mostly internal — surfaced for debugging.
 * - `representativeExcerpt`: the cluster's most-common-shape excerpt;
 *   feeds the architectural summary + the catalog-edit proposal's
 *   regex-derivation step.
 * - `members`: every finding that joined this cluster.
 * - `summary`: the 1-2 sentence operator-readable summary. Reserved
 *   field — `clusterCandidates` synthesizes a minimal summary; the
 *   orchestrator-agent (running outside this pure-computation layer)
 *   can replace it with an LLM-judge-generated version.
 */
export interface Candidate {
  readonly id: string;
  readonly shapeFingerprint: ReadonlyArray<string>;
  readonly representativeExcerpt: string;
  readonly members: ReadonlyArray<CandidateMember>;
  readonly summary: string;
}

/**
 * Architectural summary of a candidate cluster — what the operator
 * sees when triaging. Distinct from `Candidate.summary` because:
 *
 *   - `Candidate.summary` is the agent-derived raw fingerprint
 *     description (e.g., "5 components matching `Summary.tsx` with
 *     zero `.ac-*` consumers; n-gram fingerprint includes `flex`,
 *     `grid`, `absolute`").
 *   - `ArchitecturalSummary.text` is the OPERATOR-FACING summary,
 *     potentially rewritten by an LLM-judge step (Phase 11 Task 7)
 *     into a 1-2 sentence architectural framing.
 *
 * The agent owns both. The operator dispositions against the cluster
 * id (architecture-scale), never against individual members.
 */
export interface ArchitecturalSummary {
  readonly clusterId: string;
  readonly text: string;
  /** Member count — load-bearing for the operator's prioritization. */
  readonly memberCount: number;
  /** First-three file paths (deterministic; sorted) — operator landmarks. */
  readonly exemplarFiles: ReadonlyArray<string>;
}

/**
 * Operator-supplied disposition at architecture scale. ONE per cluster.
 * Mirrors the catalog `status:` discriminator but at the cluster level —
 * the mediation layer translates this to line-level catalog edits.
 *
 *   blessed  — the shape IS the canonical pattern; existing scanners
 *              missing it indicates a coverage gap (refinement of an
 *              existing entry to WIDEN match, or a new BLESSED entry).
 *   cursed   — the shape is an anti-pattern that needs to be caught
 *              (refinement of an existing CURSED entry to widen, or a
 *              new CURSED entry).
 *   ignore   — the shape is a false-positive class the operator
 *              acknowledges; produces an `ignore`-status entry so the
 *              orchestrator does NOT re-propose it next scan.
 */
export type ArchitecturalDisposition = 'blessed' | 'cursed' | 'ignore';

/**
 * One operator disposition input — names the cluster + the verb.
 */
export interface DispositionInput {
  readonly clusterId: string;
  readonly disposition: ArchitecturalDisposition;
  /**
   * Optional rationale string — surfaces in the proposed catalog
   * entry's `provenance.context` when filled. The orchestrator-agent
   * captures the operator's rationale from the triage conversation.
   */
  readonly rationale?: string;
}

/**
 * The catalog file the edit targets. Mirrors the registry types that
 * carry status/provenance so the mediation layer can route to the
 * right adapter without an `any` cast.
 */
export type CatalogFile =
  | 'anti-patterns'
  | 'adopter-manifests'
  | 'pattern-matrix-patterns'
  | 'clones';

/**
 * The edit operation a proposal performs.
 *
 *   append          — new entry appended to the catalog (novelty case).
 *   edit            — existing entry refined (regex widened / glob
 *                     tightened / excludes_paths added). Novelty-vs-
 *                     edit is the AGENT's decision in propose-catalog-
 *                     edits.ts: if the cluster's representative shape
 *                     matches an existing entry's regex/glob via dry-
 *                     run, it's an `edit` to that entry; else `append`.
 *   mark-withdrawn  — an existing entry overturned by an auditor
 *                     finding flips to `status: withdrawn` (the
 *                     reversibility primitive). Reserved here for the
 *                     wrong-decision recovery path (Phase 11 Task 8);
 *                     mediation surfaces it for completeness.
 */
export type CatalogEditOperation = 'append' | 'edit' | 'mark-withdrawn';

/**
 * A proposed line-level catalog edit. The orchestrator-agent applies
 * these to the catalog YAML files; the operator approves the edit set
 * at architecture-scale (cluster disposition) and the agent commits
 * the line-level changes.
 *
 *   catalog_file    — which catalog gets the edit.
 *   operation       — append / edit / mark-withdrawn.
 *   target_entry_id — the existing entry the edit refines; null on append.
 *   proposed_entry  — the new or refined entry shape (as a YAML-
 *                     compatible plain object). The agent's call site
 *                     yaml.stringifies this into the registry file.
 *   diff            — unified-diff-style preview of the change. Used
 *                     for operator review surfacing.
 *   reason          — non-deferral explanation of WHY this edit. Feeds
 *                     the `provenance.context` field on the resulting
 *                     entry. Mediation enforces non-emptiness; the
 *                     calling layer (orchestrator-agent) is responsible
 *                     for ensuring the reason is non-deferral phrasing
 *                     (per the dispatch-grammar forbidden-phrase list).
 */
export interface CatalogEditProposal {
  readonly catalog_file: CatalogFile;
  readonly operation: CatalogEditOperation;
  readonly target_entry_id: string | null;
  readonly proposed_entry: Readonly<Record<string, unknown>>;
  readonly diff: string;
  readonly reason: string;
}

/**
 * Shape signature of an existing entry the agent dry-run-matches the
 * cluster against. Each registry contributes its own subset of these
 * fields — anti-patterns has `shape_regex`, adopter-manifests has
 * `match_glob`, pattern-matrix has both depending on type, etc.
 *
 * The mediation layer doesn't dispatch on registry-shape — it accepts
 * a normalized projection of every existing entry. The calling layer
 * (scope-inventory) is responsible for projecting registry-specific
 * entries into this shape. This keeps mediation parser-agnostic.
 */
export interface ExistingCatalogEntry {
  readonly catalog_file: CatalogFile;
  readonly entry_id: string;
  /**
   * Pre-compiled regex the entry matches against. For glob-based
   * entries (adopter-manifests) the caller converts the glob to regex
   * via the shared `util/glob.ts` helper before projecting.
   */
  readonly match_regex: RegExp;
  /**
   * The entry's status — informs whether the agent can propose an
   * `edit` against it. `withdrawn` entries are read-only (the agent
   * cannot un-withdraw without an audit-finding-link).
   */
  readonly status:
    | 'pending'
    | 'blessed'
    | 'cursed'
    | 'ignore'
    | 'tracked-holdout'
    | 'withdrawn';
}

/**
 * Tuning knobs for `clusterCandidates`. Defaults are sensible per
 * Phase 11 PRD; callers may override per scan invocation.
 */
export interface ClusteringConfig {
  /**
   * Jaccard similarity threshold for two findings to join the same
   * cluster. Range (0, 1]. Default 0.7 per Phase 11 PRD.
   */
  readonly jaccardThreshold: number;
  /**
   * N-gram size for shape fingerprinting. Default 3 (trigrams over
   * tokenized excerpt characters). Lower = more permissive; higher =
   * stricter.
   */
  readonly ngramSize: number;
  /**
   * Minimum members for a cluster to be emitted. Singletons are
   * suppressed to reduce noise. Default 1 (emit every cluster — the
   * synthesis layer's ranking decides what to surface to the
   * operator; mediation emits everything for completeness).
   */
  readonly minClusterSize: number;
}

/** Defaults per Phase 11 Task 3 spec. */
export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  jaccardThreshold: 0.7,
  ngramSize: 3,
  minClusterSize: 1,
};
