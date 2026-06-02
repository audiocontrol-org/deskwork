/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/types.ts
 *
 * Types for /dw-lifecycle:promote-findings — the structural bridge between
 * audit-log open findings and the workplan implementation loop. Mirrors
 * the shape pattern of `../../promote-deferrals/types.ts` (Phase 3 hygiene
 * skill) — propose-then-apply protocol, fs-seam read/write callbacks, all
 * inputs read-only.
 *
 * The contract Phase 13 closes: audit-findings get scoped INTO the workplan
 * with a TDD-first task shape, NOT filed-and-forgotten. The default
 * disposition is `promote-to-workplan`; the agent CAN ONLY pick that one.
 * `acknowledged` requires a substantive-reason that passes the validator
 * (≥40 chars, no gaming phrases). `informational` requires an operator-
 * supplied rationale.
 *
 * Why mirror promote-deferrals rather than depend on it: the two skills
 * solve sibling problems (deferral discipline) but operate on different
 * artifacts (audit-log vs workplan-TBD), with different status formats,
 * different disposition kinds, and different rendering contracts. A
 * shared type tax would couple the skills without consolidating any
 * meaningful invariants. The substantive-reason validator's banned-list
 * IS the contract that overlaps; we duplicate it (per the task brief's
 * "duplicate the rules verbatim in this module's BANNED_PHRASES
 * constant" guidance) so each skill owns its own gate.
 */

// OpenFinding — one audit-log entry with Status: open extracted from the
// log. Built by `audit-log-walker.ts` from the existing parser's
// `ParsedAuditEntry` shape; the walker's job is the status filter +
// stamping the absolute audit-log path on each finding so downstream
// consumers don't need to re-thread it.
export interface OpenFinding {
  /** Finding-ID — e.g., `AUDIT-20260529-12`. */
  readonly findingId: string;
  /** The `### <heading>` line content (no `### ` prefix). */
  readonly heading: string;
  /** Severity (`blocking | high | medium | low | informational`). Optional. */
  readonly severity?: string;
  /** Surface — free-form file/path/section the finding affects. Optional. */
  readonly surface?: string;
  /** Raw markdown body of the entry (trim-trailing-newlines only). */
  readonly body: string;
  /** 1-based line number of the heading in audit-log.md. */
  readonly lineNumber: number;
  /** Absolute path to the audit-log file the finding came from. */
  readonly auditLogPath: string;
}

// DispositionKind — three options. Only `promote-to-workplan` is agent-
// pickable; the other two require operator authorship per project rule
// "operator owns scope decisions".
export type DispositionKind =
  | 'promote-to-workplan'
  | 'acknowledged'
  | 'informational';

// PromoteToWorkplanFields — operator confirms placement. The library
// renders the task block from the OpenFinding; the operator picks the
// phase heading and the insertion anchor.
export interface PromoteToWorkplanFields {
  /** e.g., '## Phase 13: Audit-finding lifecycle ...' — must exist in the workplan verbatim. */
  readonly phaseHeading: string;
  /** 1-based line in workplan; the rendered task block is inserted after this line. */
  readonly insertAfterLine: number;
}

// AcknowledgedFields — operator-supplied deferral. The substantive-reason
// validator gates the `reason` field (≥40 chars; no gaming phrases). The
// optional `ref` becomes the audit-log Status suffix:
// `acknowledged-<ref>`. When omitted, the apply step uses a feature-slug
// fallback so the new Status is operator-readable.
export interface AcknowledgedFields {
  readonly reason: string;
  readonly ref?: string;
}

// InformationalFields — operator-supplied observation. The audit-log
// Status flips to `informational` outright; the rationale is captured
// in the proposal file for the audit trail but not appended to the
// audit-log entry body (the entry body is preserved verbatim).
export interface InformationalFields {
  readonly rationale: string;
}

export type DispositionFields =
  | PromoteToWorkplanFields
  | AcknowledgedFields
  | InformationalFields;

// PromotionProposal — one OpenFinding + its disposition assignment.
// Surfaced for tests + by the orchestrator-agent's reading of the
// proposal JSON file before `apply` runs.
export interface PromotionProposal {
  readonly finding: OpenFinding;
  readonly disposition: DispositionKind;
  readonly fields: DispositionFields;
}

// WorkplanInsertion — the rendered task block + the anchor point.
// `insertTaskBlock` consumes a list of these and applies them atomically
// (validates all anchors first, then writes once).
export interface WorkplanInsertion {
  readonly findingId: string;
  /** Multi-line markdown content rendered by `workplan-task-renderer.ts`. */
  readonly taskBlock: string;
  readonly phaseHeading: string;
  readonly insertAfterLine: number;
}

// DeferralRecord — outcome of applying an `acknowledged` disposition.
// Captured per-item for the post-apply summary line.
export interface DeferralRecord {
  readonly findingId: string;
  readonly reason: string;
  readonly ref?: string;
  readonly previousStatus: string;
  /** e.g., 'acknowledged-#NNN' or 'acknowledged-<feature-slug>'. */
  readonly newStatus: string;
}

// InformationalRecord — outcome of applying an `informational`
// disposition.
export interface InformationalRecord {
  readonly findingId: string;
  readonly rationale: string;
  readonly previousStatus: string;
  readonly newStatus: 'informational';
}

// File-system seams. Tests inject in-memory shims; production uses
// node:fs via the subcommand's wiring.
export type ReadAuditLog = (path: string) => Promise<string>;
export type WriteAuditLog = (path: string, content: string) => Promise<void>;
export type ReadWorkplan = (path: string) => Promise<string>;
export type WriteWorkplan = (path: string, content: string) => Promise<void>;

// ProposalItem — one row in the proposal JSON file. `propose` writes
// the file with `disposition: null` per item; the operator fills the
// fields in before invoking `apply`.
export interface ProposalItem {
  readonly finding: OpenFinding;
  readonly disposition: DispositionKind | null;
  readonly fields: DispositionFields | null;
  readonly applied: boolean | null;
  readonly apply_error: string | null;
  readonly result: string | null;
}

// ProposalFile — top-level JSON shape written by `propose` and consumed
// by `apply`. Same protocol shape as promote-deferrals's ProposalFile.
export interface ProposalFile {
  readonly generated_at: string;
  readonly feature_slug: string;
  readonly audit_log_path: string;
  readonly workplan_path: string;
  readonly items: readonly ProposalItem[];
}
