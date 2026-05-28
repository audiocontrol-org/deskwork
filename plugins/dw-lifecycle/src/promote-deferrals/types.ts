// Types for /dw-lifecycle:promote-deferrals — operator-triggered batched
// promotion cycle for workplan-TBD markers.
//
// Two verbs share these shapes:
//   propose → scans a single workplan, extracts containing-task + parent-phase
//             context around each TBD line, and emits a JSON proposal file +
//             a markdown table for the orchestrator agent to fill in.
//   apply   → reads a filled-in proposal file, runs the all-or-nothing
//             pre-validation gate, dispatches gh issue create for promote
//             rows, and rewrites the workplan in place for both dispositions.
//
// Mechanically enforces the project's "Just for now is bullshit" rule: every
// bare TBD on a workplan must terminate in either a tracking issue (with the
// [debt: #NNN] back-link recorded in the line) or an inline substantive
// reason that documents why the work won't happen. The substantive-reason
// validator (substantive-reason.ts) refuses the gaming phrases that the rule
// names as unacceptable dispositions.

// Import the canonical RunGh shape from triage-issues (Phase 2 ships it).
// The cross-skill import is intentional: Phase 3's batched-proposal protocol
// is built on top of Phase 2's primitives, so the dependency is honest.
// Tracked at #335 alongside the debt-report copy.
import type { RunGh } from '../triage-issues/types.js';

export type { RunGh };

// File-system writer seam. The apply layer's workplan-edit step calls this
// to mutate the workplan file. Tests inject an in-memory writer; production
// uses node:fs writeFileSync.
export type WriteWorkplanFile = (path: string, content: string) => void;
export type ReadWorkplanFile = (path: string) => string;

// The two disposition shapes. Mirrors Phase 1's WorkplanMarkerKey but at the
// per-line decision level rather than the marker-classification level.
export type DispositionKind = 'promote-to-issue' | 'inline-wontfix';

// promote-to-issue: the orchestrator agent supplies the issue title + body
// (the body should embed the containing-task + parent-phase context that
// propose collected, plus the agent's rationale for why this needs tracking).
// The apply step calls `gh issue create`, captures the issue number from the
// returned URL, and appends ` [debt: #<n>]` to the original TBD line.
export interface PromoteToIssueFields {
  readonly title: string;
  readonly body: string;
}

// inline-wontfix: the orchestrator agent supplies a substantive reason that
// passes the gaming-phrase validator (≥40 chars, no banned substrings). The
// apply step rewrites the TBD line by stripping the marker keyword and
// appending ` (wontfix: <reason>)`.
export interface InlineWontfixFields {
  readonly reason: string;
}

export type DispositionFields = PromoteToIssueFields | InlineWontfixFields;

// Each scanned TBD line that the agent will dispose of.
export interface ProposalItem {
  // 1-based line number in the workplan file. Used to locate the line for
  // the apply step's in-place edit (with a text-excerpt sanity check to
  // catch a workplan that's drifted since propose ran).
  readonly lineNumber: number;
  // Marker keyword that triggered the match (`tbd` / `defer` / `follow_up` /
  // `out_of_scope`). Surfaced in the markdown table and the audit trail.
  readonly markerKey: 'tbd' | 'defer' | 'follow_up' | 'out_of_scope';
  // Text excerpt of the matched line (post-trim, capped at 200 chars by the
  // single-file scanner). The apply step compares this against the live
  // file's line content to detect drift.
  readonly text: string;
  // The containing task heading ("### Task N: ...") if one was found above
  // the matched line. Null when the marker fell outside any task heading.
  readonly containingTask: string | null;
  // The parent phase heading ("## Phase N: ...") if one was found above the
  // matched line. Null when the marker fell outside any phase heading.
  readonly parentPhase: string | null;
  // The 1-based line number of the containing task heading (or null when
  // containingTask is null). Used to anchor the apply step's audit-trail
  // surface.
  readonly containingTaskLine: number | null;
  // The 1-based line number of the parent phase heading.
  readonly parentPhaseLine: number | null;
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
// Same protocol shape as Phase 2's ProposalFile (separate type — the items
// list carries different per-row fields).
export interface ProposalFile {
  readonly generated_at: string;
  // Absolute path to the workplan that was scanned. The apply step re-opens
  // this file to write the in-place edits.
  readonly workplan_path: string;
  // Repo for `gh issue create`. Captured at propose time so re-running apply
  // targets the same repository even if the operator's cwd has changed.
  readonly repo: string;
  // Gate field. `propose` writes null; the operator (or their agent) writes
  // 'y' / 'n' / a comma-separated 1-based index list before invoking apply.
  readonly approval: string | null;
  readonly items: readonly ProposalItem[];
}
