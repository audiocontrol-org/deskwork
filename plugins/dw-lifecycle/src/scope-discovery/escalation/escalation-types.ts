/**
 * plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-types.ts
 *
 * Phase 11 Task 9 — Operator escalation surface.
 *
 * Escalation should be rare, high-information, asynchronous-friendly
 * (operator decision 2026-05-26). The orchestrator-agent emits an
 * `EscalationRequest` when policy + skills + metrics don't yield a
 * confident next action; the request is persisted as a single JSON
 * artifact under
 * `.dw-lifecycle/scope-discovery/orchestrator-runtime/pending-escalations/<id>.json`.
 *
 * The operator opens the artifact (the markdown renderer in
 * `escalation-render.ts` produces an operator-readable view of the same
 * data), picks one of the proposed options or writes a free-form
 * decision, and the next `/dw-lifecycle:implement` invocation reads
 * the resolution via `escalation-queue.ts` and proceeds.
 *
 * # Why a single JSON file (per escalation)?
 *
 *   - Editor-friendly: the operator opens one file, scans the proposal,
 *     leaves a decision inline.
 *   - Provenance trail: resolved escalations move to a sibling
 *     `resolved-escalations/<id>.json` (NEVER deleted) so the audit
 *     trail survives across sessions and across orchestrator restarts.
 *   - No silent fallback: malformed JSON throws; the agent surfaces the
 *     parse error and does NOT silently pretend the escalation didn't
 *     exist (per project's no-fallback rule).
 *
 * # Lifecycle
 *
 *   queued     — file exists in `pending-escalations/<id>.json`; no
 *                operator decision present.
 *   resolved   — operator wrote a `resolution:` field; the queue's
 *                `resolveEscalation` call MOVES the file to
 *                `resolved-escalations/<id>.json`.
 *
 * The `decisionTaken` field on the artifact distinguishes the two; the
 * queue API enforces the transition.
 */

/**
 * One option the orchestrator surfaces for the operator to pick from.
 *
 * `id` is short + stable so the operator can name the option in
 * free-form prose ("pick option `cursed-blanket`"); the resolution
 * machinery matches against `id` first, then against `summary`.
 *
 * Options are NOT a closed set — operators may write a free-form
 * decision via `decisionFreeText` and the queue records that verbatim.
 */
export interface EscalationOption {
  readonly id: string;
  readonly summary: string;
  /**
   * Optional richer explanation. Renderers display this as a bullet
   * beneath the option's summary; the queue stores it verbatim.
   */
  readonly detail?: string;
}

/**
 * Evidence the orchestrator has attached to the escalation. Free-form
 * but typed enough that the renderer can format it consistently.
 *
 *   - `summary` is the one-line description ("3 of 4 negative-space
 *     findings overturned by auditor this week").
 *   - `links` are file paths / GitHub issue URLs the operator can open
 *     to inspect the context.
 *   - `excerpts` are short multi-line snippets (commit diffs, audit-log
 *     entries) the operator can scan without opening external links.
 */
export interface EscalationEvidence {
  readonly summary: string;
  readonly links: ReadonlyArray<string>;
  readonly excerpts: ReadonlyArray<string>;
}

/**
 * The orchestrator's resolution of an escalation, captured AFTER the
 * operator's decision is read back. Note that `decisionTaken` is the
 * verbatim text the operator left in the file or in chat; the resolution
 * does NOT impose a structured outcome on the operator's words.
 *
 * `selectedOptionId` is filled when the operator picked one of the
 * pre-supplied options (by id match); `null` when the operator wrote a
 * free-form decision that didn't match any option id verbatim.
 */
export interface EscalationResolution {
  readonly resolvedAt: string;
  readonly selectedOptionId: string | null;
  readonly decisionTaken: string;
}

/**
 * The on-disk shape of an escalation. Versioned so future schema
 * changes can be detected at parse time and surfaced as actionable
 * errors (rather than silently skipped).
 *
 * Fields:
 *   id              — stable per-escalation identifier (timestamp+hex).
 *   queued_at       — ISO-8601 timestamp the orchestrator emitted at.
 *   action_proposed — short imperative the orchestrator wants approval
 *                     for ("set status=cursed on negative-space-12").
 *   evidence        — structured evidence block (summary + links +
 *                     excerpts).
 *   reasoning       — the orchestrator's own narrative for WHY this
 *                     decision is uncertain enough to escalate; the
 *                     operator reads this before picking an option.
 *   question        — the explicit question being asked of the operator
 *                     ("should this become a blanket-cursed pattern, or
 *                     is the audiocontrol case the only valid hit?").
 *   options         — non-empty list of EscalationOption.
 *   resolution      — present iff the escalation has been resolved; the
 *                     queue's `resolveEscalation` writes this field and
 *                     moves the file to `resolved-escalations/`.
 */
export interface EscalationRequest {
  readonly version: 1;
  readonly id: string;
  readonly queuedAt: string;
  readonly actionProposed: string;
  readonly evidence: EscalationEvidence;
  readonly reasoning: string;
  readonly question: string;
  readonly options: ReadonlyArray<EscalationOption>;
  readonly resolution: EscalationResolution | null;
}

/**
 * Input shape for `enqueueEscalation`. The caller supplies everything
 * EXCEPT `version` (always 1), `queuedAt` (defaulted to
 * `new Date().toISOString()` if omitted), and `resolution` (always
 * `null` at queue time).
 *
 * The optional `id` + `queuedAt` overrides are test entry points; the
 * library defaults them when omitted.
 */
export interface EscalationRequestInput {
  readonly id?: string;
  readonly queuedAt?: string;
  readonly actionProposed: string;
  readonly evidence: EscalationEvidence;
  readonly reasoning: string;
  readonly question: string;
  readonly options: ReadonlyArray<EscalationOption>;
}

/**
 * Subdirectory of `<orchestratorRuntimeDir>` where pending escalation
 * artifacts live. Resolved escalations live alongside in
 * `RESOLVED_ESCALATIONS_SUBDIR`.
 */
export const PENDING_ESCALATIONS_SUBDIR = 'pending-escalations';
export const RESOLVED_ESCALATIONS_SUBDIR = 'resolved-escalations';
