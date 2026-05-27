/**
 * plugins/dw-lifecycle/src/scope-discovery/synthesis-types.ts
 *
 * Output-side types for the synthesis pass. Mirrors the shape declared
 * by plugins/dw-lifecycle/src/scope-discovery/schema/scope-manifest.yaml.schema.json.
 * Lives in its own module so synthesis.ts and synthesis-derive.ts share
 * a single source of truth for the in-memory manifest shape without
 * circular imports.
 *
 * These types are STRUCTURAL counterparts to the JSON Schema; the
 * schema remains authoritative. Every synthesized manifest is run
 * through `validateManifest()` before write, so a drift between the
 * schema and these types surfaces at runtime as a schema-validation
 * failure rather than silent emission of malformed output.
 */

import type { DiscoveryAgentFinding } from './discovery-agents/types.js';
import type { CodebaseStateMetrics } from './discovery-agents/codebase-state-metrics-types.js';

export type {
  ClassificationCompletenessMetric,
  CodebaseStateMetrics,
  CoveragePerBlessedPattern,
  ViolationDensityPerCursedPattern,
  SurfaceUniformityEntry,
  CatalogStabilityMetric,
  DiscoveredCandidateRateMetric,
  DispositionLatencyMetric,
} from './discovery-agents/codebase-state-metrics-types.js';

export type ManifestKind = 'ui' | 'code' | 'hybrid';

export type ReferenceDocRole =
  | 'prd'
  | 'workplan'
  | 'mockup'
  | 'design-language'
  | 'analysis-report'
  | 'rule'
  | 'other';

export interface ManifestScenario {
  readonly id: string;
  readonly label?: string;
  readonly description?: string;
  readonly query?: string;
}

export interface ManifestReferenceDoc {
  readonly path: string;
  readonly role?: ReferenceDocRole;
  readonly summary?: string;
}

export interface ManifestRoute {
  readonly path: string;
  readonly devices: ReadonlyArray<string>;
  readonly scenarios: ReadonlyArray<string>;
  readonly primitives?: ReadonlyArray<string>;
  readonly skip_reason?: string;
}

export type PatternKind =
  | 'ast-call'
  | 'ast-jsx'
  | 'type-cast'
  | 'grep'
  | 'clone-group'
  | 'import'
  | 'other';

export interface ManifestModulePattern {
  readonly id: string;
  readonly kind: PatternKind;
  readonly description?: string;
  readonly query?: string;
}

export interface ManifestModuleExclude {
  readonly glob: string;
  readonly reason: string;
}

/**
 * Per-module relevance score emitted into the strawman manifest when
 * the PRD's scope sections name the module.
 * 'excluded' modules do NOT appear in the manifest at all (they're
 * filtered before emission), so the manifest-side type only includes
 * the three values that can actually serialize.
 */
export type ManifestModuleRelevance = 'high' | 'medium' | 'low';

export interface ManifestModule {
  readonly glob: string;
  readonly label?: string;
  readonly patterns: ReadonlyArray<ManifestModulePattern>;
  readonly excludes?: ReadonlyArray<ManifestModuleExclude>;
  /**
   * Optional PRD-derived relevance score. Absent when no PRD signal
   * was available — preserves default behavior (every module included,
   * no annotations). 'low' surfaces when the operator should review
   * whether the module is actually in scope; 'high' / 'medium' are
   * informational. 'excluded' modules are dropped before emission so
   * they never appear here.
   */
  readonly relevance?: ManifestModuleRelevance;
}

/**
 * Per-source regime-holdout entry shape, emitted under the manifest's
 * `regime_holdouts` section. Mirrors the discovery agent's per-finding
 * shape minus the `source` discriminator (the source is implied by
 * the bucket the entry lands in).
 */
export interface ManifestRegimeHoldoutEntry {
  readonly id: string;
  readonly file: string;
  readonly line?: number;
  readonly shape: string;
  readonly replacement: string;
  readonly evidence: {
    readonly registry_path: string;
    readonly registry_id: string;
  };
  /**
   * Phase 11 Task 11 — per-finding status/provenance from the catalog
   * entry that produced this finding. `source_status` is the catalog
   * `status:` literal; `provenance_source` is the catalog
   * `provenance.source` literal. Surfaced so an operator scanning the
   * synthesized scope-manifest.yaml can see at-a-glance which findings
   * are actively-enforced (blessed/cursed) vs. candidates (pending)
   * without re-reading every catalog.
   */
  readonly status_provenance: {
    readonly source_status: string;
    readonly provenance_source: string;
  };
}

export interface ManifestRegimeHoldoutMeta {
  readonly total: number;
  readonly by_source: {
    readonly anti_pattern: number;
    readonly adopter_manifest: number;
    readonly editor_symmetry: number;
    readonly deprecation: number;
  };
  /**
   * Phase 11 Task 11 — per-status rollup. `actively_enforced` are
   * findings sourced from `blessed` or `cursed` catalog entries
   * (these gate). `candidate` are findings from `pending` entries
   * (operator-triage surface). Suppressed statuses (ignore /
   * tracked-holdout / withdrawn) are filtered upstream and never
   * surface, so they aren't counted here.
   */
  readonly by_status: {
    readonly actively_enforced: number;
    readonly candidate: number;
  };
}

/**
 * Top-level `regime_holdouts:` section. Produced by the synthesis
 * pass when a `regime-holdout-detector` agent finding is supplied;
 * absent when the agent was not run.
 */
export interface ManifestRegimeHoldouts {
  readonly anti_patterns: ReadonlyArray<ManifestRegimeHoldoutEntry>;
  readonly adopter_manifests: ReadonlyArray<ManifestRegimeHoldoutEntry>;
  readonly editor_symmetry: ReadonlyArray<ManifestRegimeHoldoutEntry>;
  readonly deprecations: ReadonlyArray<ManifestRegimeHoldoutEntry>;
  readonly meta: ManifestRegimeHoldoutMeta;
}

/**
 * Phase 11 Task 3 — one operator-facing candidate cluster summary
 * surfaced by the orchestrator-agent mediation layer in the manifest's
 * `discovered_candidates:` section. Snake-case to mirror the YAML wire
 * format; produced by `mediation.toManifestSection`.
 */
export interface ManifestDiscoveredCandidate {
  readonly cluster_id: string;
  readonly summary: string;
  readonly member_count: number;
  readonly exemplar_files: ReadonlyArray<string>;
}

/**
 * In-memory manifest shape. JSON-serializable; `yaml.stringify()`
 * produces the canonical scope-manifest.yaml output. snake_case field
 * names mirror the schema verbatim so the YAML output stays readable
 * for the operator without a post-write rename pass.
 */
export interface ScopeManifest {
  readonly kind: ManifestKind;
  readonly feature_slug: string;
  readonly version?: string;
  readonly generated_by: 'strawman' | 'curated' | 'hand-authored';
  readonly generated_at: string;
  readonly scenarios: ReadonlyArray<ManifestScenario>;
  readonly reference_docs: ReadonlyArray<ManifestReferenceDoc>;
  readonly discovery_themes: ReadonlyArray<string>;
  readonly routes?: ReadonlyArray<ManifestRoute>;
  readonly modules?: ReadonlyArray<ManifestModule>;
  readonly regime_holdouts?: ManifestRegimeHoldouts;
  /**
   * Phase 11 Task 3 — discovered candidate clusters surfaced by the
   * orchestrator-agent mediation layer. Optional (legacy manifests +
   * clean-codebase scans both legitimately omit it).
   */
  readonly discovered_candidates?: ReadonlyArray<ManifestDiscoveredCandidate>;
  /**
   * Phase 11 Task 4 — codebase-state metrics block. Optional at the
   * manifest level (legacy manifests omit it); when emitted, every
   * sub-metric is present on the value. The synthesis pass populates
   * this when at least one catalog file is present under
   * `.dw-lifecycle/scope-discovery/`.
   */
  readonly codebase_state_metrics?: CodebaseStateMetrics;
  readonly notes?: string;
}

/** Input contract for the synthesis pass. */
export interface SynthesisInput {
  readonly featureSlug: string;
  readonly findings: ReadonlyArray<DiscoveryAgentFinding>;
  /** Repo-relative or absolute path to the PRD; used for both reading and reference_docs derivation. */
  readonly prdPath: string;
  /** Repo-relative form of prdPath for emission into reference_docs[]. */
  readonly prdRelPath: string;
}

/** Output of the synthesis pass. */
export interface SynthesisOutput {
  readonly manifest: ScopeManifest;
  readonly metadata: {
    readonly generatedAt: string;
    readonly agentsConsumed: ReadonlyArray<string>;
    readonly dedupCount: number;
    readonly findingsCount: number;
    /**
     * Non-fatal synthesizer notes: things the operator should know
     * about how the manifest was derived. Includes:
     *   - missing PRD References/Appendix (defaulted to PRD+LAYOUT.md)
     *   - empty regime-holdout findings (no detector ran)
     *   - kind=ui but only one route detected (likely an under-walked
     *     UI surface)
     * Empty array when synthesis produced no notes. The scope-inventory
     * subcommand renders these under a `## Synthesizer notes` section in
     * `<run-dir>/synthesis.md`.
     */
    readonly warnings: ReadonlyArray<string>;
  };
}
