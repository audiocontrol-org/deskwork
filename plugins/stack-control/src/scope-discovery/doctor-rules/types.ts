/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/types.ts
 *
 * Shared types + constants for scope-discovery doctor rules. Each rule under
 * this directory exports an async `check(opts)` function that returns zero or
 * more `ScopeDoctorFinding` records. The host `subcommands/scope-doctor.ts`
 * lifts these into its `Finding` shape (1:1) when reporting.
 *
 * Ported from dw-lifecycle (010 / US6). `repoRoot` in `DoctorRuleOptions` is
 * the resolved stack-control installation root (the per-codebase boundary),
 * not an arbitrary cwd — `scope-doctor` resolves it once via
 * `resolveCodebaseBoundary` and hands the same root to every rule.
 *
 * Rule IDs (kebab-case): scope-discovery-config-missing,
 * scope-discovery-schema-stale, clones-yaml-schema-violation,
 * anti-patterns-yaml-schema-violation, clones-yaml-refactor-incomplete,
 * override-drift, catalog-entry-missing-status, provenance-orphaned-entries,
 * legacy-editor-symmetry-field-rename.
 */

/**
 * Current schemaVersion for scope-discovery operator-curated YAML registries
 * (clones.yaml, anti-patterns.yaml, adopter-manifests.yaml). Bump on any
 * breaking YAML shape change. The field is OPTIONAL on every registry; missing
 * it generates a "missing schemaVersion" finding, a mismatch a "stale" one.
 */
export const CURRENT_SCHEMA_VERSION = 1;

export interface ScopeDoctorFinding {
  readonly rule: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface DoctorRuleOptions {
  readonly repoRoot: string;
}

export interface DoctorRuleCheck {
  (opts: DoctorRuleOptions): Promise<readonly ScopeDoctorFinding[]>;
}
