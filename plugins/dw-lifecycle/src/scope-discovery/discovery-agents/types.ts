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

export interface PatternFinding {
  readonly id: string;            // stable identifier: "as-type-cast", "any-annotation", ...
  readonly description: string;
  readonly regex: string;         // the regex source string (for traceability)
  readonly hits: ReadonlyArray<PatternHit>;
}

export interface AstGrepMatrixFindings {
  // Discriminator kept as 'ast-grep-matrix' for JSON wire-format
  // stability across the pilot + the port. The file/agent is named
  // `pattern-matrix` (renamed because there is no `ast-grep` binary
  // involved) but the runtime tag is invariant.
  readonly agent: 'ast-grep-matrix';
  readonly featureSlug: string;
  readonly patterns: ReadonlyArray<PatternFinding>;
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
 *   - 'editor-symmetry'  — one editor in a multi-editor manifest fails
 *     to adopt while peers do.
 *   - 'deprecation'      — an importer of a `@deprecated` file is
 *     blocking the file's deletion.
 */
export type RegimeHoldoutSource =
  | 'anti-pattern'
  | 'adopter-manifest'
  | 'editor-symmetry'
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
}

/** Per-source counts + total — surfaced verbatim by the synthesis pass. */
export interface RegimeHoldoutMeta {
  readonly anti_pattern_count: number;
  readonly adopter_manifest_count: number;
  readonly editor_symmetry_holdout_count: number;
  readonly deprecation_count: number;
  readonly total: number;
}

export interface RegimeHoldoutFindings {
  readonly agent: 'regime-holdout-detector';
  readonly featureSlug: string;
  readonly findings: ReadonlyArray<RegimeHoldoutFinding>;
  readonly meta: RegimeHoldoutMeta;
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
  | RegimeHoldoutFindings;

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

/**
 * Combined predicate covering all five shapes. Returns true when the
 * value matches any agent's structural contract; the per-agent
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
    isRegimeHoldoutFindings(v)
  );
}
