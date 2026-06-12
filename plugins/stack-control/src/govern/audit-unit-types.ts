/**
 * plugins/stack-control/src/govern/audit-unit-types.ts
 *
 * specs/015-audit-protocol-convergence — Phase 2 (T004).
 *
 * The `AuditUnit` (D6) is the bounded scope of one barrage payload — whole
 * feature today, a completed tasks.md phase under FR-007. It carries the diff
 * scope the payload audits and the append-only audit-log section the unit's
 * findings are recorded under. data-model.md § AuditUnit is the authority.
 */

/**
 * The commits/files one audit unit covers. `base` is the ref the unit's work
 * started from; `files` is the explicit, bounded path set the payload folds —
 * the lever FR-006 uses to exclude unrelated parked scaffolds from the untracked
 * fold. An empty `files` with `granularity: 'feature'` means "the whole diff
 * against base" (the pre-015 whole-feature behavior).
 */
export interface DiffScope {
  /** The ref the unit's work is diffed against. */
  readonly base: string;
  /**
   * The repo-relative path set this unit audits. For a `phase` unit these are
   * the files the phase's tasks name; for a `feature` unit composed from
   * converged phases these are the changed + cross-cutting paths. Empty =
   * unbounded (whole-feature diff against `base`).
   */
  readonly files: readonly string[];
}

/** Whether the unit is one tasks.md phase or the composing whole-feature pass. */
export type AuditGranularity = 'phase' | 'feature';

/**
 * The bounded scope of one barrage payload (data-model § AuditUnit). Composition
 * rule (FR-008): a `feature`-granularity unit's `diffScope` excludes any phase
 * whose code is unchanged since that phase's unit-audit reached `converged`
 * (carried), and includes changed + cross-cutting code.
 */
export interface AuditUnit {
  /** `phase` for incremental (FR-007); `feature` for the composing pass. */
  readonly granularity: AuditGranularity;
  /** The tasks.md phase header id; present iff `granularity === 'phase'`. */
  readonly phaseId?: string;
  /** The commits/files this unit audits. */
  readonly diffScope: DiffScope;
  /** The append-only audit-log section this unit's findings are recorded under. */
  readonly auditLogSection: string;
}
