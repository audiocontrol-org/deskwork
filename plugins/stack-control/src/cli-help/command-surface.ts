// The typed description of the stack-control command surface (028 US1/US4,
// data-model §1; FR-003). Generalizes the `roadmap`-only `SUBACTION_SPECS` +
// `roadmap-help.ts` pattern to ALL verbs.
//
// This module defines the descriptor TYPE CONTRACTS. The surfaces that make
// drift structurally impossible — the commander-tree walker (`buildCommandSurface`),
// the completeness guard, the mediation-class guard, the generic help renderer,
// the verb reference, the descriptor artifact, and the fronted-operations
// registry — are derived FROM these shapes and are defined alongside in this
// directory and in `src/capability/` (each landed behind its own RED test per
// specs/028 tasks T004–T011 / US4). Until those consumers exist these are the
// contracts they build against, not yet a live single source of truth.

/** A flag on a verb or sub-action (derived from the commander option definition). */
export interface FlagDescriptor {
  /** Dashed long form, e.g. "depends-on". */
  readonly name: string;
  /** Short alias without the dash, e.g. "d" for `-d, --depends-on`; null when the
   * commander option declares no short form. The walker populates it from the
   * option's short flag so the renderer can emit the canonical `-d, --depends-on`
   * shape (AUDIT-BARRAGE-claude-03, 028 Phase 1 govern). */
  readonly shortFlag: string | null;
  /** Value placeholder, e.g. "<value>"; null for a boolean flag. */
  readonly arg: string | null;
  /** Whether the flag is mandatory for the operation. */
  readonly required: boolean;
  /** One-line help text. */
  readonly description: string;
}

/** Whether an operation is state-bearing (gated by mediation) or a pure query. */
export type MediationClass = 'mutating' | 'read-only';

/** One sub-action of a multi-action verb (e.g. roadmap `add-edge`). */
export interface SubActionDescriptor {
  /** e.g. "add-edge". */
  readonly name: string;
  /** One-line summary (the `SUMMARIES` analogue). */
  readonly description: string;
  /** The sub-action's positional arguments IN ORDER (e.g. `["<from>", "<to>"]` for
   * a reparent). `[]` when the sub-action takes none. An array, not a single
   * `string | null`, so a multi-positional sub-action is representable rather than
   * silently truncated to its first arg (AUDIT-BARRAGE-claude-01, 028 Phase 1). */
  readonly positionals: readonly string[];
  readonly flags: readonly FlagDescriptor[];
  /** Declared, not inferred from `--apply` (Decision 4). */
  readonly mediationClass: MediationClass;
}

/** One top-level verb (e.g. `roadmap`, `backlog`, `check-front-door`). */
export interface CommandDescriptor {
  /** e.g. "roadmap". */
  readonly verb: string;
  readonly description: string;
  /** [] for a single-action verb. */
  readonly subActions: readonly SubActionDescriptor[];
  /**
   * Verb-level flags for a SINGLE-action verb. For a MULTI-action verb
   * (`subActions.length > 0`) this is `[]` by contract — per-sub-action flags live
   * on each `SubActionDescriptor.flags`. (No current verb has cross-cutting flags
   * shared across all sub-actions; if one is added, a dedicated `sharedFlags` field
   * lands then — the flat-shape vs discriminated-union question is tracked as
   * backlog TASK-300, AUDIT-BARRAGE-claude-02.)
   */
  readonly flags: readonly FlagDescriptor[];
  /**
   * The verb's mediation class for a SINGLE-action verb. For a MULTI-action verb
   * (`subActions.length > 0`) this is `null` — the meaningful class lives on each
   * `SubActionDescriptor.mediationClass`. Typed `| null` (not a default) so the
   * compiler FORCES every consumer to branch: a guard that reads this field
   * without first handling the multi-action `null` case fails to type-check
   * rather than silently classifying a mutating sub-action as read-only
   * (AUDIT-BARRAGE-claude-01, 028 Phase 1 govern).
   */
  readonly mediationClass: MediationClass | null;
  /** e.g. check-editor-symmetry → check-module-symmetry; null when not an alias. */
  readonly deprecatedAliasOf: string | null;
}
