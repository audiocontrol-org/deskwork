/**
 * plugins/dw-lifecycle/src/scope-discovery/doctor-rules/types.ts
 *
 * Shared types + constants for scope-discovery doctor rules. Each
 * rule under this directory exports an async `check(opts)` function
 * that returns zero or more `ScopeDoctorFinding` records. The host
 * `subcommands/doctor.ts` lifts these into the existing `Finding`
 * shape (1:1 field mapping) when registering them in the doctor's
 * rule list.
 *
 * Rule ID conventions (kebab-case, scope-discovery-prefixed where the
 * rule is broadly about the protocol, name-prefixed where the rule
 * targets a specific artifact):
 *
 *   scope-discovery-config-missing
 *   scope-discovery-schema-stale
 *   clones-yaml-schema-violation
 *   anti-patterns-yaml-schema-violation
 *   clones-yaml-refactor-incomplete
 *   override-drift
 *
 * The doctor's external Finding shape (`{ rule, severity, message }`)
 * is the SSOT; this file mirrors it so individual rule files don't
 * depend on the parent subcommand's imports.
 */

/**
 * Current schemaVersion for scope-discovery operator-curated YAML
 * registries (clones.yaml, anti-patterns.yaml, adopter-manifests.yaml).
 *
 * Versioning policy: bump on any breaking YAML shape change. Phase 9
 * ships v1; the `scope-discovery-schema-stale` doctor rule warns when
 * an existing project's YAML carries a different version (forward or
 * backward) so adopters get an actionable migration hint instead of
 * a silent shape-error downstream.
 *
 * The field is OPTIONAL on every registry (so legacy YAMLs without
 * the field continue to parse). Missing the field generates a
 * different finding ("missing schemaVersion"); a mismatched value
 * generates the "stale schemaVersion" finding.
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
