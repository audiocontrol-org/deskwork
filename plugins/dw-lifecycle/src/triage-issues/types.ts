// Types for /dw-lifecycle:triage-issues — operator-triggered batched-proposal
// cycle for stale GitHub issues.
//
// Two verbs share these shapes:
//   propose → fetches issues for a bucket and emits a JSON proposal file +
//             a markdown table for the orchestrator agent to fill in.
//   apply   → reads a filled-in proposal file and dispatches one gh mutation
//             per approved row, surfacing partial-success per item.

// Process-boundary callback. The only subprocess seam: every gh call goes
// through this so the library is unit-testable without forking real gh.
// Mirrors the RunGh shape in src/debt-report/types.ts (declared independently
// per the workplan's instruction not to import across hygiene-skill libraries).
export type RunGh = (args: readonly string[]) => string;

// The three built-in bucket names. Operators may override the query string
// per name (or add new names) via .dw-lifecycle/triage-buckets.yaml; an
// unknown bucket throws before any gh call fires.
export type BucketName = string;

// Each disposition shape the orchestrator agent may propose. The propose
// step leaves these null; the agent populates them before apply runs.
export type DispositionKind =
  | 'close-wontfix'
  | 'label'
  | 'duplicate'
  | 'leave-with-comment';

export interface CloseWontfixFields {
  readonly reason: string;
}

export interface LabelFields {
  // Comma-tolerant; the apply layer issues one --add-label per entry.
  readonly labels: readonly string[];
}

export interface DuplicateFields {
  readonly dup_of: number;
  readonly reason: string;
}

export interface LeaveWithCommentFields {
  readonly comment: string;
}

export type DispositionFields =
  | CloseWontfixFields
  | LabelFields
  | DuplicateFields
  | LeaveWithCommentFields;

export interface ProposalItem {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly age_days: number;
  readonly comment_age_days: number | null;
  readonly labels: readonly string[];
  readonly body_excerpt: string;
  // Filled in by the orchestrator agent before `apply` runs. Null after
  // `propose` writes the file.
  readonly disposition: DispositionKind | null;
  readonly disposition_fields: DispositionFields | null;
  // Filled in by `apply`. Null until then.
  readonly applied: boolean | null;
  readonly apply_error: string | null;
  readonly result: string | null;
}

// The top-level JSON shape written by `propose` and consumed by `apply`.
// Adopters may version-control or hand-edit this file; the schema is the
// contract between the two verbs.
export interface ProposalFile {
  readonly generated_at: string;
  readonly bucket: BucketName;
  readonly query: string;
  readonly repo: string;
  // Gate field. `propose` writes null; the operator (or their agent) writes
  // 'y' / 'n' / a comma-separated 1-based index list before invoking apply.
  readonly approval: string | null;
  readonly items: readonly ProposalItem[];
}

// Raw issue shape returned by `gh issue list --json` for the propose step.
export interface RawIssueForProposal {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
  readonly comments: ReadonlyArray<{ readonly createdAt: string }>;
}
