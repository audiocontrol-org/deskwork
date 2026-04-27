/**
 * Doctor — type definitions.
 *
 * `deskwork doctor` walks calendar + content tree + workflow store and
 * produces structured reports. Each rule audits, optionally proposes a
 * repair plan, and (with operator consent) applies the plan. The runner
 * orchestrates rule execution; this module owns the data shapes.
 *
 * Sibling-relative imports per the project convention — `@/` doesn't
 * resolve under tsx at runtime in this package's `src/`, only in tests.
 */

import type { DeskworkConfig } from '../config.ts';
import type { EditorialCalendar } from '../types.ts';
import type { ContentIndex } from '../content-index.ts';
import type { DraftWorkflowItem } from '../review/types.ts';

/** Severity for a finding — used only to color text-mode output. */
export type FindingSeverity = 'error' | 'warning' | 'info';

/**
 * A single audit finding produced by a rule. The `details` map is rule-
 * specific and meant for both human display and for `plan()` to reuse
 * without re-walking the world.
 */
export interface Finding {
  /** Stable rule id (matches `DoctorRule.id`). */
  ruleId: string;
  /** Site slug the finding belongs to (multi-site projects). */
  site: string;
  /** Severity bucket. */
  severity: FindingSeverity;
  /** Short human-readable label, suitable for one-line text output. */
  message: string;
  /** Rule-defined payload (entry id, file paths, etc.). */
  details: Readonly<Record<string, unknown>>;
}

/**
 * What a rule would do if applied. `kind` discriminates: rules either
 * have a concrete repair (`apply`), need operator input (`prompt`), or
 * can only be reported on (`report-only`).
 *
 * The runner uses `kind` to decide whether to ask the operator (in
 * interactive mode) or skip with a clear message (in `--yes` mode).
 */
export type RepairPlan =
  | {
      kind: 'apply';
      /** The finding this plan addresses. */
      finding: Finding;
      /** One-line summary the runner shows before applying. */
      summary: string;
      /** Rule-defined payload — passed verbatim to `apply()`. */
      payload: Readonly<Record<string, unknown>>;
    }
  | {
      kind: 'prompt';
      finding: Finding;
      /** Operator-facing question. */
      question: string;
      /** Possible answers — first is the default. */
      choices: ReadonlyArray<RepairChoice>;
    }
  | {
      kind: 'report-only';
      finding: Finding;
      /** Why no repair is offered (e.g. "operator must decide manually"). */
      reason: string;
    };

/** A single choice the operator can pick when a plan is `prompt`. */
export interface RepairChoice {
  /** Stable id — what the runner records when the operator picks this. */
  id: string;
  /** Operator-facing label. */
  label: string;
  /** Rule-defined payload to pass to `apply()` if chosen. */
  payload: Readonly<Record<string, unknown>>;
}

/** Outcome of applying a repair plan. */
export interface RepairResult {
  finding: Finding;
  /** True when the repair landed on disk. */
  applied: boolean;
  /** Human-readable summary of what happened (or why it was skipped). */
  message: string;
  /** Optional rule-defined details — e.g. paths written. */
  details?: Readonly<Record<string, unknown>>;
}

/**
 * Operator interaction adapter. Rules don't depend on the runner's UI;
 * they declare prompts in their `plan()` and the runner provides an
 * interaction implementation (interactive readline, `--yes` auto-pick,
 * or a test stub).
 */
export interface DoctorInteraction {
  /**
   * Resolve a `prompt` plan to a single choice id. Returns `undefined`
   * to skip without applying — `--yes` mode does this for ambiguous
   * cases; interactive mode does it when the operator declines.
   */
  pickChoice(plan: Extract<RepairPlan, { kind: 'prompt' }>): Promise<string | undefined>;
  /**
   * Confirm an `apply` plan. Returns `true` to apply, `false` to skip.
   * `--yes` mode always returns `true`; interactive mode shows the
   * summary and asks.
   */
  confirmApply(plan: Extract<RepairPlan, { kind: 'apply' }>): Promise<boolean>;
}

/**
 * Carrier of every per-site input a rule needs. Rules receive this and
 * return findings without re-walking the calendar or re-reading config.
 */
export interface DoctorContext {
  projectRoot: string;
  config: DeskworkConfig;
  /** Site slug the runner is currently auditing. */
  site: string;
  /** Calendar for `site` — already parsed. */
  calendar: EditorialCalendar;
  /** Content index for `site` — already built. */
  index: ContentIndex;
  /** Workflows from the review store, scoped to `site`. */
  workflows: ReadonlyArray<DraftWorkflowItem>;
  /** Operator interaction — used by the runner during repair. */
  interaction: DoctorInteraction;
}

/**
 * The contract every rule implements.
 *
 * `audit` is a pure read of the world. `plan` decides what (if anything)
 * the rule would do for a finding. `apply` executes the plan. The runner
 * decides whether to chain these — audit-only mode stops after `audit`.
 */
export interface DoctorRule {
  /** Stable identifier — appears in `--fix=<id>`. Use kebab-case. */
  readonly id: string;
  /** One-line operator-facing label. */
  readonly label: string;
  audit(ctx: DoctorContext): Promise<Finding[]>;
  plan(ctx: DoctorContext, finding: Finding): Promise<RepairPlan>;
  apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult>;
}

/** Aggregate report returned by the runner. */
export interface DoctorReport {
  /** Per-site findings, in rule iteration order. */
  findings: Finding[];
  /** Per-site repair results — empty in audit-only mode. */
  repairs: RepairResult[];
  /** Sites the runner exercised, in iteration order. */
  sites: string[];
}
