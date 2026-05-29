// Types for /dw-lifecycle:complete-parent-closure -- the phase-parent closure
// gate that runs as part of /dw-lifecycle:complete. Two verbs share these
// shapes:
//   propose -> walks the closing feature's GitHub issue tree from THREE
//              sources (title-search, parent timeline, workplan-anchored
//              child enumeration), unions + dedupes the results, classifies
//              each candidate parent issue, and emits a proposal JSON file
//              plus a markdown table.
//   apply   -> reads the filled-in proposal file, validates each approved
//              row, and dispatches one gh mutation per approved row.

// Process-boundary callback. Mirrors the RunGh shape used elsewhere in the
// hygiene libraries -- declared independently rather than imported because
// the workplan calls out gh-runtime consolidation as a downstream concern
// (#335).
export type RunGh = (args: readonly string[]) => string;

// Subprocess seam for `git` so tests can stub the closing-commit SHA lookup
// without forking real git. The propose layer reads HEAD via this callback.
export type RunGit = (args: readonly string[]) => string;

// Per-row disposition shapes. The propose step leaves these null; the
// operator (or an orchestrator agent) populates them before apply runs.
//
//   close-all-children-closed: parent + every enumerated child is closed.
//                              Closure is the natural disposition.
//   close-with-open-children:  some children are still open, but the
//                              feature reaches feature-complete this
//                              commit. The operator chooses to close the
//                              parent anyway; apply logs a per-item warning
//                              naming the open children.
//   skip:                      operator chose not to act this run.
//   leave-open:                operator deliberately leaves the parent open
//                              (e.g. children represent active sibling
//                              tracks the operator wants to keep visible).
export type DispositionKind =
  | 'close-all-children-closed'
  | 'close-with-open-children'
  | 'skip'
  | 'leave-open';

// Heuristic classification produced by the propose-step's walker. The
// operator selects the actual disposition; the auto-classification is a
// hint surfaced in the markdown table to seed their choice.
//
//   close-all-children-closed: ALL enumerated children are closed AND
//                              parent is open. Closure is straightforward.
//   close-with-open-children:  parent is open; at least one enumerated
//                              child is still open. Operator must decide
//                              (strand the open children or leave parent
//                              open for them).
//   skip-already-closed:       parent is already closed. Skipped before
//                              the proposal file is written.
//   skip-not-this-feature:     a title-search hit that doesn't match the
//                              expected child set OR is not the feature's
//                              own parent issue. Skipped before the
//                              proposal file is written.
export type ClassificationKind =
  | 'close-all-children-closed'
  | 'close-with-open-children'
  | 'skip-already-closed'
  | 'skip-not-this-feature';

export interface ChildIssueRef {
  readonly number: number;
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly title: string | null;
}

// A single parent-candidate row in the proposal file. The propose step
// records the walker's union of child issue numbers + per-child state;
// the apply step uses the same row to drive the gh mutation.
export interface ProposalItem {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly child_issues: readonly ChildIssueRef[];
  readonly classification: ClassificationKind;
  // The orchestrator agent fills these two fields in before apply runs.
  // `disposition` is the verb the operator chose; `closure_comment` is the
  // body of the gh comment posted at close time (auto-drafted by propose
  // for `close-*` classifications; operator may edit before apply).
  readonly disposition: DispositionKind | null;
  readonly closure_comment: string | null;
  // Populated by apply.
  readonly applied: boolean | null;
  readonly apply_error: string | null;
  readonly result: string | null;
}

// The top-level JSON shape written by `propose` and consumed by `apply`.
// Adopters may version-control or hand-edit this file; the schema is the
// contract between the two verbs.
export interface ProposalFile {
  readonly generated_at: string;
  readonly feature_slug: string;
  readonly parent_issue: number;
  readonly feature_complete_sha: string;
  readonly repo: string;
  // Gate field. `propose` writes null; the operator writes 'y' / 'n' / a
  // comma-separated 1-based index list before invoking apply.
  readonly approval: string | null;
  readonly items: readonly ProposalItem[];
}

// Raw gh issue shape returned by `gh issue list --json number,title,state,url`
// for the title-search source.
export interface RawIssueForSearch {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly url: string;
}
