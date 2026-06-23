// Typed protocol records for the parseable lifecycle workflow engine
// (022 data-model.md). These are the shapes the grammar binding produces and the
// derivation / gate-eval / effect engine consume. Every record is plain data;
// behavior lives in the focused engine modules (Constitution Principle VI).

/**
 * A phase id is read FROM the governed WORKFLOW.md (FR-005) — never hardcoded —
 * so the engine boundary types it as a plain string. `DEFAULT_PHASES` records
 * the canonical bundled lifecycle for fixtures/tests; it is reference data, not
 * a vocabulary the engine enforces.
 */
export type PhaseId = string;

/**
 * The canonical bundled lifecycle phase ids (the `templates/WORKFLOW.md` default).
 * `closed` is the post-ship TERMINAL phase (031) — `shipped` is no longer the end of
 * the lifecycle; the operator-confirmed `advance --to closed` is the final move.
 */
export const DEFAULT_PHASES = [
  'captured',
  'planned',
  'designing',
  'specifying',
  'implementing',
  'governing',
  'shipped',
  'closed',
] as const;

/**
 * Terminal side-states (FR-004) — reachable from any phase via an induct-style
 * move, reported as-is by the query verbs. Fixed by the constitution, so this is
 * a closed union (unlike the doc-driven phase vocabulary).
 */
export const SIDE_STATES = ['blocked', 'cancelled', 'retired'] as const;
export type SideState = (typeof SIDE_STATES)[number];

/** The result of phase derivation: a derived pipeline phase OR a terminal side-state. */
export type DerivedPhase =
  | { readonly kind: 'phase'; readonly id: PhaseId }
  | { readonly kind: 'side-state'; readonly id: SideState };

/**
 * The criterion kinds an entrance/exit/exit-gate predicate may use (data-model
 * § Criterion). Every one evaluates to a definite boolean; a judgment is encoded
 * as `approval-marker` / `node-marker` (a recorded fact on the node), never a
 * subjective evaluation at gate time (FR-009).
 */
export const CRITERION_KINDS = [
  'file-exists',
  'section-present',
  'count-gte',
  'tasks-complete',
  'tree-clean',
  'pointer-set',
  'record-converged',
  'approval-marker',
  'node-marker',
  // 030 US2 (FR-018, clean break): the graduate gate evaluates SOLELY on a converged
  // whole-feature convergence record. The per-phase `all-phase-checkpoints-current`
  // criterion is DELETED (one govern path, one graduation criterion).
  'graduate-impl',
] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

/** A single computable true/false gate predicate over existing artifacts. */
export interface Criterion {
  readonly kind: CriterionKind;
  /** The artifact / node field / count / mode the predicate reads. */
  readonly target: string;
  /** Threshold (count-gte) or section name (section-present); absent otherwise. */
  readonly param?: string | number;
}

/**
 * The derive-predicate kinds (data-model § Phase.derive). Distinct from gate
 * `Criterion` kinds: these place an item AT a phase from the pre-existing
 * artifacts. Read FROM the doc per phase (FR-005). `node-marker`/`record-converged`
 * mirror the gate kinds; `backlog-only`/`node-present`/`release-tagged` are the
 * structural anchors of the pipeline. `never` is the by-name-only sentinel: a
 * phase whose `derive: never` is NEVER placed by the artifact loop — it is
 * reachable solely by the recorded-status by-name rule (031: the terminal
 * `closed` phase, an explicit operator-confirmed action, not an artifact).
 */
export const DERIVE_KINDS = [
  'backlog-only',
  'node-present',
  'pointer-set',
  'node-marker',
  'record-converged',
  'tasks-complete',
  'release-tagged',
  'never',
] as const;
export type DeriveKind = (typeof DERIVE_KINDS)[number];

/** A phase's derive predicate — the artifact condition that places an item here. */
export interface DerivePredicate {
  readonly kind: DeriveKind;
  /** Pointer name (`design`/`spec`), node-marker field, or record mode; absent for backlog-only/node-present/tasks-complete/release-tagged. */
  readonly target?: string;
}

/**
 * The fixed v1 effect vocabulary (FR-018, data-model § Effect). `commit` is
 * ALWAYS last (the atomic boundary). A transition needing a verb outside this
 * palette is resolved by ADDING a verb (FR-020), never a prose effect.
 */
export const EFFECT_VERBS = [
  'roadmap-advance',
  'roadmap-reconcile',
  'journal-append',
  'doc-set-status-field',
  'workflow-link-design',
  'workflow-link-spec',
  'commit',
] as const;
export type EffectVerb = (typeof EFFECT_VERBS)[number];

/**
 * Heavy/interactive verbs that MUST NOT appear as advance effects (FR-017): they
 * are the explicit phase work `workflow next` names, never lightweight bookkeeping.
 */
export const FORBIDDEN_EFFECT_VERBS = [
  'design',
  'define',
  'extend',
  'execute',
  'govern',
  'release',
  'speckit-implement',
] as const;

/** One effect: a call to a governed verb with template-bound args. */
export interface Effect {
  readonly verb: EffectVerb;
  /** Template params bound at advance time (`{item}`, `{status}`, `{spec-dir}`, `{design-doc}`, `{message}`). */
  readonly args: Readonly<Record<string, string>>;
}

/** A WORKFLOW.md `phase` unit (data-model § Phase). */
export interface Phase {
  readonly id: PhaseId;
  readonly derive: DerivePredicate;
  /** The skill/verb that performs this phase's work (named by `workflow next`). */
  readonly work: string;
  readonly entrance: readonly Criterion[];
  readonly exit: readonly Criterion[];
  readonly next: PhaseId | null;
}

/** A WORKFLOW.md `transition` unit (data-model § Transition). */
export interface Transition {
  readonly codename: string;
  /** Source phase id, or `*` for an any-phase re-entry. */
  readonly from: string;
  readonly to: PhaseId;
  readonly exitGate: readonly Criterion[];
  /** Ordered effect manifest; `commit` is the last entry when present. */
  readonly effects: readonly Effect[];
}

/** Where the resolved WORKFLOW.md came from (FR-005a override stack). */
export type WorkflowDocSource = 'bundled' | 'override';

/** A parsed, grammar-bound WORKFLOW.md (data-model § WorkflowDoc). */
export interface WorkflowDoc {
  readonly phases: readonly Phase[];
  readonly transitions: readonly Transition[];
  readonly source: WorkflowDocSource;
  /** The on-disk path the doc resolved to. */
  readonly path: string;
}

/**
 * A durable, mode-keyed govern-convergence record (data-model §
 * GovernConvergenceRecord; TASK-19). Reuses the 021 checkpoint fingerprint shape
 * so a later in-scope change can mark it stale.
 */
export interface GovernConvergenceRecord {
  readonly version: 1;
  readonly mode: 'spec' | 'impl';
  /** The roadmap node id. */
  readonly item: string;
  readonly scopeFingerprint: string;
  readonly converged: boolean;
  readonly recordedAt: string;
  /** The installation root the record is written under. */
  readonly anchorRoot: string;
  /**
   * specs/029 US4 (FR-018): true when this graduation was an operator `--override`
   * short-circuit, NOT a real convergence — so a durable downstream consumer can
   * DISTINGUISH the two (stderr is transient; FR-017 fires zero barrage so there is
   * no run artifact either). Absent/false on a genuine convergence graduation.
   */
  readonly override?: boolean;
  /** specs/029 US4 (FR-018): the operator's `--override` reason, when `override` is true. */
  readonly overrideReason?: string;
}

/** How strongly a house rule is enforced (data-model § HouseRulesBlock). */
export type RuleBacking = 'soft' | 'mechanical' | 'operator';

/** One rule in the design frontend's single-source opinion. */
export interface Rule {
  readonly id: string;
  readonly statement: string;
  readonly backedBy: RuleBacking;
}

/**
 * The design frontend's named, single-source opinion (FR-024): injected into the
 * backend conversation AND checked by the `design-to-spec` exit gate.
 */
export interface HouseRulesBlock {
  readonly id: string;
  readonly rules: readonly Rule[];
}

/** The required sections of a design record (FR-026, data-model § DesignRecord). */
export const DESIGN_RECORD_SECTIONS = [
  'problem-domain',
  'solution-space',
  'decisions',
  'open-questions',
  'provenance',
] as const;
export type DesignRecordSection = (typeof DESIGN_RECORD_SECTIONS)[number];

/** Fail-loud workflow-engine error (Principle V) — carries an actionable message. */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

// ── Lifecycle compass (024) ──────────────────────────────────────────────────

/**
 * The classification of an intended action against an item's live phase (024
 * data-model § Verdict, FR-002). `on-course` = the legitimate next move; `ahead`
 * = the action belongs to a later phase (a step is skipped); `behind` = an earlier
 * phase (re-entry / redundant — allowed); `off-rail` = no node or a terminal
 * side-state (refuse).
 */
export const VERDICT_OUTCOMES = ['on-course', 'ahead', 'behind', 'off-rail'] as const;
export type VerdictOutcome = (typeof VERDICT_OUTCOMES)[number];

/**
 * Verdict → process exit code (024 FR-003): a skill body gates on the code without
 * parsing prose. `on-course`/`behind` proceed (0); `ahead`/`off-rail` refuse with
 * DISTINCT non-zero codes so the embedding skill names the precise violated
 * invariant. Usage/parse/unknown-intent errors use a separate code (2) at the CLI.
 */
export const VERDICT_EXIT = {
  'on-course': 0,
  behind: 0,
  ahead: 3,
  'off-rail': 4,
} as const satisfies Record<VerdictOutcome, number>;

/** A compass verdict (024 data-model § Verdict). Plain data; computed purely. */
export interface Verdict {
  readonly outcome: VerdictOutcome;
  /** The item's derived phase (reused from 022 derivation). */
  readonly currentPhase: DerivedPhase;
  /**
   * The phase the intent maps to. Null in three valid cases: orientation mode (no
   * intent), off-rail with no resolvable node, AND a phase-NEUTRAL intent (e.g.
   * `session-end`) — which yields a successful `on-course` verdict with a null
   * `intentPhase` (AUDIT-BARRAGE-codex-02). Null is therefore NOT an error sentinel;
   * read `outcome` for the verdict, never `intentPhase === null`.
   */
  readonly intentPhase: PhaseId | null;
  /** The single legitimate next phase (null at a terminal phase / side-state). */
  readonly legitimateNext: PhaseId | null;
  /** The first jumped phase — non-null when `ahead` due to a skipped phase (FR-002, SC-001). */
  readonly skippedStep: PhaseId | null;
  /**
   * The unmet exit-gate criteria of the legitimate-next transition (T040/codex-01).
   * Non-empty makes a graduation intent (`release`/`ship`) `ahead` instead of `on-course`
   * when its `governing → shipped` gate is unmet — so the compass cannot green-light a
   * release without the recorded convergence. Empty on a met gate / non-graduation intents.
   */
  readonly unmetGate: readonly string[];
  /** Actionable message naming the violated invariant (for the skill refusal). */
  readonly reason: string;
  /** Process exit code mirroring `VERDICT_EXIT[outcome]` (FR-003). */
  readonly exitCode: number;
}

// 024 data-model § Intent: the realized intent contract is the DISCRIMINATED
// `IntentResolution` in `intent-vocabulary.ts` (`kind: 'phase' | 'neutral'`, with
// `phase: null` for a phase-neutral intent such as `session-end`). A phase-only
// `Intent { name; phase }` type is intentionally NOT published here — it would
// contradict the accepted phase-neutral inputs (AUDIT-BARRAGE-codex-01). Consumers
// import `IntentResolution`, not a phase-only shape.
