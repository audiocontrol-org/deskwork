/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/types.ts
 *
 * Shared types for the discovery-agent fleet. The fleet is a group of
 * TypeScript modules — NOT Claude Code sub-agents — that the
 * `dw-lifecycle scope-inventory` subcommand invokes in parallel; the
 * synthesis pass consumes their findings.
 *
 * Each agent takes the same input contract (feature slug + PRD path +
 * repo root) and emits a discriminated-union finding shape so the
 * synthesizer can branch on `agent` without an `as Type` cast.
 *
 * No fallbacks, no mock data — agents that can't read their inputs
 * throw descriptive errors so the upstream subcommand surfaces real
 * failures (per the project rule against fallbacks).
 */

import { isPlainObject } from '../util/typeguards.js';

/**
 * Input contract every discovery agent honors. Paths are absolute (the
 * subcommand resolves them before invocation); `featureSlug` is the
 * short directory name under `docs/<version>/<status>/`.
 */
export interface DiscoveryAgentInput {
  readonly featureSlug: string;
  readonly prdPath: string;
  readonly repoRoot: string;
  /**
   * Module-root directory name (relative to repoRoot). Default `'src'`.
   * Adopter projects override via the `--module-root` CLI flag passed
   * to `dw-lifecycle scope-inventory`.
   */
  readonly moduleRoot: string;
}

/** A single route discovered in a module's router configuration. */
export interface UiRoute {
  readonly module: string;        // e.g., "graphical-entries" or "<repo-root>" for single-package projects
  readonly path: string;          // e.g., "patches" or "/dashboard"
  readonly file: string;          // repo-relative path to the file that declares the route
  readonly pageFile: string | null; // repo-relative path to the page file, if locatable
}

export interface UiRouteFindings {
  readonly agent: 'ui-route-enumerator';
  readonly featureSlug: string;
  readonly modulesInScope: ReadonlyArray<string>;
  readonly routes: ReadonlyArray<UiRoute>;
}

/** A single hit of one cross-cutting pattern across the codebase. */
export interface PatternHit {
  readonly file: string;          // repo-relative
  readonly line: number;          // 1-indexed
  readonly snippet: string;       // trimmed source line
}

/**
 * Provenance tag on a pattern finding — names the handler that produced
 * it so the synthesis layer + operator can distinguish "registered
 * regex matched a known shape" from "negative-space detector saw the
 * absence of an expected primitive" from "outlier detector flagged a
 * statistical anomaly". Per the discovered_candidates stub.
 *
 * `registered-pattern` is the legacy provenance for handlers that match
 * a positively-registered shape (regex, semantic). `negative-space`,
 * `coverage-gap`, `outlier`, and `discovered-candidate` are the new
 * vocabulary types from polymorphic pattern handlers. `discovered-candidate` is the
 * synthesis-layer clustering pass output (the discovered_candidates stub stub).
 */
export type FindingProvenance =
  | 'registered-pattern'
  | 'negative-space'
  | 'coverage-gap'
  | 'outlier'
  | 'discovered-candidate'
  | 'semantic'
  | 'prd-theme';

export interface PatternFinding {
  readonly id: string;            // stable identifier: "as-type-cast", "any-annotation", ...
  readonly description: string;
  readonly regex: string;         // the regex source string (for traceability)
  readonly hits: ReadonlyArray<PatternHit>;
  /**
   * Provenance tag — names which handler produced this finding. Defaults
   * to `'registered-pattern'` for legacy regex-only findings. New
   * handlers set this explicitly so the synthesis pass can route by
   * provenance without re-reading the catalog.
   */
  readonly provenance?: FindingProvenance;
  /**
   * Optional secondary metric a handler may attach. Coverage handlers
   * surface adoption fractions; outlier handlers attach distance
   * scores. The synthesis layer reads `metrics` opportunistically and
   * tolerates absence (legacy regex findings emit none).
   */
  readonly metrics?: Readonly<Record<string, number>>;
}

/**
 * A discovered-candidate cluster surfaced by the synthesis-layer
 * unmatched-shape clustering pass (the discovered_candidates stub). Stub-shipped in v1.1
 * Task 1 — the pass currently emits an empty list with a logged TODO
 * naming the algorithmic spec at issue #315. The TYPE is here so the
 * scope-manifest wire format is forward-compatible; the algorithm
 * itself ships under the GH issue cross-referenced in the stub.
 */
export interface DiscoveredCandidateCluster {
  /** Stable cluster id (synthesis layer assigns; not user-readable). */
  readonly id: string;
  /**
   * Bag-of-words / n-gram summary of the shape that clustered. The
   * algorithm itself is a stub at v1.1 Task 1; the field is reserved.
   */
  readonly shapeSummary: string;
  /** Member files participating in the cluster. */
  readonly members: ReadonlyArray<string>;
  /** Member count — load-bearing for the rank-by-frequency cut. */
  readonly memberCount: number;
}

export interface AstGrepMatrixFindings {
  // Discriminator kept as 'ast-grep-matrix' for JSON wire-format
  // stability across the pilot + the port. The file/agent is named
  // `pattern-matrix` (renamed because there is no `ast-grep` binary
  // involved) but the runtime tag is invariant.
  readonly agent: 'ast-grep-matrix';
  readonly featureSlug: string;
  readonly patterns: ReadonlyArray<PatternFinding>;
  /**
   * Optional output of the synthesis-layer unmatched-shape clustering
   * pass (the discovered_candidates stub). Always emitted (may be empty); absent ONLY for
   * pre-Phase-11 wire-format consumers reading older JSON.
   */
  readonly discoveredCandidates?: ReadonlyArray<DiscoveredCandidateCluster>;
}

/** A clone group surfaced from the dispositioned baseline. */
export interface CloneGroupFinding {
  readonly id: string;
  readonly members: ReadonlyArray<string>;  // "path:start:end"
  readonly lines: number;
  readonly disposition: string;             // pending | refactor | keep-with-reason | ignore-with-justification
}

export interface CloneDetectorFindings {
  readonly agent: 'clone-detector-reader';
  readonly featureSlug: string;
  readonly baselinePath: string;            // repo-relative
  readonly filterApplied: 'none' | 'modules-in-scope';
  readonly modulesInScope: ReadonlyArray<string>;
  readonly clones: ReadonlyArray<CloneGroupFinding>;
}

/** One PRD-derived theme keyword + its occurrences across module sources. */
export interface ThemeOccurrence {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
}

export interface ThemeFinding {
  readonly term: string;
  readonly occurrences: ReadonlyArray<ThemeOccurrence>;
}

/**
 * Per-module relevance score sourced from the PRD's "In Scope" /
 * "Out of Scope" sections. Modules NOT in this list have unstated
 * relevance — the synthesis layer treats them as 'medium' (default).
 * 'excluded' modules are DROPPED from the synthesized manifest; 'low'
 * modules are annotated.
 */
export type PrdModuleRelevanceLevel = 'high' | 'medium' | 'low' | 'excluded';

export interface PrdModuleRelevanceEntry {
  /** Workspace module name. */
  readonly module: string;
  /** The relevance level the PRD section assigned. */
  readonly relevance: PrdModuleRelevanceLevel;
  /**
   * The PRD heading text that drove the assignment — surfaced in the
   * synthesis warning so the operator sees which section excluded each
   * module without re-reading the PRD.
   */
  readonly section: string;
}

export interface PrdThemedFindings {
  readonly agent: 'prd-themed-pattern-hunter';
  readonly featureSlug: string;
  readonly themes: ReadonlyArray<ThemeFinding>;
  /**
   * Optional — present when the PRD contains "In Scope" / "Out of
   * Scope" / "Non-goals" sections. The synthesis layer defaults to
   * 'medium' for every workspace module not listed.
   */
  readonly moduleRelevance?: ReadonlyArray<PrdModuleRelevanceEntry>;
}

/**
 * Source bucket a regime-holdout finding came from. Mirrors the four
 * Phase 2 gates the Phase 4 regime-holdout-detector fuses:
 *   - 'anti-pattern'     — code matches a registered legacy shape.
 *   - 'adopter-manifest' — file matches a manifest's expected-adopter
 *     glob but does NOT import the canonical primitive.
 *   - 'module-symmetry'  — one module in a multi-module manifest fails
 *     to adopt while peers do.
 *   - 'deprecation'      — an importer of a `@deprecated` file is
 *     blocking the file's deletion.
 */
export type RegimeHoldoutSource =
  | 'anti-pattern'
  | 'adopter-manifest'
  | 'module-symmetry'
  | 'deprecation';

/**
 * Back-pointer to the registry entry that caught a holdout. Lets the
 * synthesized manifest carry traceable evidence: an operator reading
 * the manifest can grep `registryPath` for `registryId` and find the
 * exact entry whose pattern matched. Empty `registryId` is allowed for
 * sources that do not key on a single registry id.
 */
export interface RegimeHoldoutEvidence {
  /** Repo-relative path of the registry / scan output that caught the holdout. */
  readonly registryPath: string;
  /** Stable identifier within the registry (anti-pattern id, manifest id, or composite). */
  readonly registryId: string;
}

/**
 * per-finding status provenance. Names the catalog
 * entry's `status:` at the time the finding was produced so downstream
 * consumers (synthesis, dispositioner, operator surface) can route
 * actively-enforced findings differently from candidate findings
 * (status: pending) without re-reading the catalog. The field is
 * load-bearing for the orchestrator-agent's future per-status routing
 * (orchestrator-agent mediation): `blessed`/`cursed` findings gate; `pending`
 * findings surface as candidates; everything else is suppressed at the
 * scanner level.
 *
 * `source_status` is the catalog entry's status. `provenance_source`
 * carries the entry's `provenance.source` (operator-authored vs.
 * orchestrator-agent vs. install-seed vs. ...) so the operator can
 * triage agent-proposed findings differently from operator-authored
 * findings.
 *
 * For `source: 'deprecation'` findings the catalog "entry" is the
 * `@deprecated` marker in the source file itself — there is no Loop-
 * status field on the marker, so we synthesize `blessed` + `install-
 * seed` to keep the wire shape uniform across all four sources.
 */
export interface FindingStatusProvenance {
  readonly source_status: 'pending' | 'blessed' | 'cursed' | 'ignore' | 'tracked-holdout' | 'withdrawn';
  readonly provenance_source:
    | 'operator-authored'
    | 'orchestrator-agent'
    | 'llm-judge-proposed'
    | 'install-seed'
    | 'promoted-from-candidate';
}

/** One regime-holdout finding. */
export interface RegimeHoldoutFinding {
  /** Which gate caught it. */
  readonly source: RegimeHoldoutSource;
  /** Registry / manifest / file identifier (back-pointer-friendly). */
  readonly id: string;
  /** Repo-relative POSIX path of the offending file. */
  readonly file: string;
  /** 1-based source line; undefined for whole-file findings. */
  readonly line?: number;
  /** Human description of the legacy / missing / drifted shape. */
  readonly shape: string;
  /** Human description of the canonical replacement. */
  readonly replacement: string;
  /** Evidence back-pointer for operator traceability. */
  readonly evidence: RegimeHoldoutEvidence;
  /**
   * status + provenance inherited from the catalog
   * entry that produced this finding. Always present; the synthesizer
   * uses this to route findings into the right manifest section
   * (actively-enforced vs. candidate vs. suppressed-but-recorded).
   */
  readonly status_provenance: FindingStatusProvenance;
}

/** Per-source counts + total — surfaced verbatim by the synthesis pass. */
export interface RegimeHoldoutMeta {
  readonly anti_pattern_count: number;
  readonly adopter_manifest_count: number;
  readonly module_symmetry_holdout_count: number;
  readonly deprecation_count: number;
  readonly total: number;
  /**
   * per-status rollup. Sum across the four sources.
   * `actively_enforced` = findings sourced from `blessed` + `cursed`
   * entries; `candidate` = findings sourced from `pending` entries
   * (surfaced for operator triage but NOT gate-blocking).
   * Suppressed statuses (ignore / tracked-holdout / withdrawn) are
   * never present in the findings array — they are filtered upstream
   * at the scanner level — so they do not appear here.
   */
  readonly actively_enforced_count: number;
  readonly candidate_count: number;
}

export interface RegimeHoldoutFindings {
  readonly agent: 'regime-holdout-detector';
  readonly featureSlug: string;
  readonly findings: ReadonlyArray<RegimeHoldoutFinding>;
  readonly meta: RegimeHoldoutMeta;
}

/**
 * Per-manifest adopter holdout summary emitted by the
 * adopter-manifest-checker agent (Phase 4 Family C integration).
 *
 * Distinct from the regime-holdout-detector's adopter sub-pass: this
 * agent runs as a standalone fleet slot, narrating only the adopter-
 * manifest gate (no anti-pattern / module-symmetry / deprecation
 * fusion). Its findings flow into the same manifest section
 * (`regime_holdouts.adopter_manifests[]`) as the regime-holdout
 * detector's adopter findings — synthesis-derive-regime dedupes by
 * `(file, id)` so running both agents on the same registry doesn't
 * double-count.
 */
export interface AdopterManifestCheckerFinding {
  /** Manifest entry id whose glob the file matched. */
  readonly manifestId: string;
  /** Primary canonical `from` path (entry.from[0]; non-empty per AUDIT-08). */
  readonly canonicalImport: string;
  /** Repo-relative POSIX path of the holdout file. */
  readonly file: string;
  /** One-line summary of the suggested replacement (entry.message). */
  readonly replacementSummary: string;
}

export interface AdopterManifestCheckerFindings {
  readonly agent: 'adopter-manifest-checker';
  readonly featureSlug: string;
  /**
   * Repo-relative path of the registry the checker consulted. Default
   * `.dw-lifecycle/scope-discovery/adopter-manifests.yaml`.
   */
  readonly registryPath: string;
  readonly findings: ReadonlyArray<AdopterManifestCheckerFinding>;
  readonly meta: {
    /** Total entries in the registry. */
    readonly entriesScanned: number;
    /** Total unique files visited across all manifests. */
    readonly filesVisited: number;
    /** Total holdouts surfaced (= findings.length). */
    readonly holdoutCount: number;
  };
}

/**
 * Discriminated union covering every shape a discovery agent can emit.
 * Consumers branch on `finding.agent` for type-safe narrowing — no
 * `as` casts, no `any` bag of properties.
 */
export type DiscoveryAgentFinding =
  | UiRouteFindings
  | AstGrepMatrixFindings
  | CloneDetectorFindings
  | PrdThemedFindings
  | RegimeHoldoutFindings
  | AdopterManifestCheckerFindings;

/** Discriminator literal — exported so consumers can switch exhaustively. */
export type DiscoveryAgentName = DiscoveryAgentFinding['agent'];

/**
 * Type-predicate variants for synthesizers / smoke-test harnesses that
 * receive `unknown` from JSON.parse. Each predicate validates the
 * structural key for its agent so downstream consumers branch with
 * proper TS narrowing rather than `as Type` casts.
 *
 * Per CLAUDE.md: "Avoid `any` — use `unknown` with type guards."
 * Predicates are the idiomatic TypeScript escape hatch for narrowing
 * untrusted JSON without runtime casts.
 */
export function isUiRouteFindings(v: unknown): v is UiRouteFindings {
  if (!isPlainObject(v)) return false;
  return v['agent'] === 'ui-route-enumerator' && Array.isArray(v['routes']);
}

export function isAstGrepMatrixFindings(
  v: unknown,
): v is AstGrepMatrixFindings {
  if (!isPlainObject(v)) return false;
  return v['agent'] === 'ast-grep-matrix' && Array.isArray(v['patterns']);
}

export function isCloneDetectorFindings(
  v: unknown,
): v is CloneDetectorFindings {
  if (!isPlainObject(v)) return false;
  return v['agent'] === 'clone-detector-reader' && Array.isArray(v['clones']);
}

export function isPrdThemedFindings(v: unknown): v is PrdThemedFindings {
  if (!isPlainObject(v)) return false;
  return v['agent'] === 'prd-themed-pattern-hunter' && Array.isArray(v['themes']);
}

export function isRegimeHoldoutFindings(
  v: unknown,
): v is RegimeHoldoutFindings {
  if (!isPlainObject(v)) return false;
  return (
    v['agent'] === 'regime-holdout-detector' &&
    Array.isArray(v['findings']) &&
    isPlainObject(v['meta'])
  );
}

export function isAdopterManifestCheckerFindings(
  v: unknown,
): v is AdopterManifestCheckerFindings {
  if (!isPlainObject(v)) return false;
  return (
    v['agent'] === 'adopter-manifest-checker' &&
    Array.isArray(v['findings']) &&
    isPlainObject(v['meta'])
  );
}

/**
 * Combined predicate covering every agent shape. Returns true when
 * the value matches any agent's structural contract; the per-agent
 * predicates above narrow further.
 */
export function isDiscoveryAgentFinding(
  v: unknown,
): v is DiscoveryAgentFinding {
  return (
    isUiRouteFindings(v) ||
    isAstGrepMatrixFindings(v) ||
    isCloneDetectorFindings(v) ||
    isPrdThemedFindings(v) ||
    isRegimeHoldoutFindings(v) ||
    isAdopterManifestCheckerFindings(v)
  );
}
