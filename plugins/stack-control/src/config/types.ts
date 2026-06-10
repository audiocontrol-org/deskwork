// Installation config + resolution port — shared types (009 T001).
//
// The single shared port both the create-side (`stackctl setup`) and the
// read-side (every governed verb's working-file lookup) depend on — the two
// Principle-II concrete instances. Wire format is YAML (snake_case at
// `.stack-control/config.yaml`); these in-memory shapes are camelCase, mirroring
// the audit-barrage config-loader translation. No `any`/`as`/`@ts-ignore`.
//
// See specs/009-project-doc-setup/data-model.md for the field tables and the
// resolution algorithm.

/**
 * The installation-level managed set scaffolded by `setup` (FR-001). NOT a
 * member: per-feature audit logs (the feature lifecycle's job — the config
 * records only their `featureAuditLogPattern`) and operation-products (created
 * lazily by the verb that produces them).
 */
export type WorkingFileKey =
  | 'config'
  | 'roadmap'
  | 'inbox'
  | 'backlog'
  | 'auditLog'
  // session-skills (011) extends the managed set with three keys it owns — the
  // additive change 009's FR-001 anticipates (a second real consumer of the
  // port). journal/toolingFeedback are human docs at root; cloneScope is a dir.
  | 'journal'
  | 'toolingFeedback'
  | 'cloneScope';

/** Optional per-file location overrides (relative-to-root, or absolute within root). */
export interface InstallationPaths {
  readonly roadmap?: string;
  readonly inbox?: string;
  readonly backlog?: string;
  readonly auditLog?: string;
  /** Per-feature audit-log pattern; MUST contain the literal `{feature}` placeholder. */
  readonly featureAuditLogPattern?: string;
  // session-skills (011) keys.
  readonly journal?: string;
  readonly toolingFeedback?: string;
  /** The per-codebase clone-detection scope (a directory). */
  readonly cloneScope?: string;
}

/** Parsed + validated `.stack-control/config.yaml` (in-memory, camelCase). */
export interface InstallationConfig {
  /** Schema version — required positive integer; an unknown version fails loud. */
  readonly version: number;
  /** Base for internal stores (backlog, program audit log); default `.stack-control`. */
  readonly baseDir?: string;
  readonly paths?: InstallationPaths;
}

/** Each working-file key resolved to an absolute path (post-precedence). */
export type ResolvedPaths = Readonly<Record<WorkingFileKey, string>>;

/** A stack-control unit rooted at the directory containing its `.stack-control/config.yaml`. */
export interface Installation {
  /** Absolute path to the directory containing `.stack-control/`. */
  readonly root: string;
  /** Absolute path to `<root>/.stack-control/config.yaml`. */
  readonly configPath: string;
  readonly config: InstallationConfig;
  readonly resolved: ResolvedPaths;
}

/** Per-item outcome status in a setup report. */
export type SetupStatus = 'created' | 'already-present' | 'skipped' | 'malformed';

/** One managed-set item's setup outcome (FR-006). */
export interface SetupItem {
  readonly key: WorkingFileKey;
  readonly location: string;
  readonly status: SetupStatus;
  readonly detail?: string;
}

/** The result of a `setup` run (also emitted by auto-on-first-use, FR-006/FR-016). */
export interface SetupReport {
  readonly installationRoot: string;
  readonly items: readonly SetupItem[];
  /** True only when every required item is present + well-formed (FR-009). */
  readonly ready: boolean;
}
