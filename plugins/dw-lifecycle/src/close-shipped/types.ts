// Types for /dw-lifecycle:close-shipped — release-time pending-verification
// labeling for issues referenced in commits between two release tags.
//
// The skill scans `git log <from-tag>..<to-tag>`, extracts referenced issue
// numbers, then for each open issue: posts a verification-request comment +
// adds a `pending-verification` label. It does NOT close the issue — closure
// waits for operator verification per the project's "Issue closure requires
// verification in a formally-installed release" rule.
//
// Process-boundary callbacks (RunGh, RunGit) make the pipeline unit-testable
// against fixture data without forking real subprocesses. Same shape as the
// other hygiene-skill libraries; we re-export from the canonical locations so
// there's exactly one definition of each.

import type { RunGh } from '../triage-issues/types.js';
import type { RunGit } from '../debt-report/types.js';

export type { RunGh } from '../triage-issues/types.js';
export type { RunGit } from '../debt-report/types.js';

// A single commit identified during log scanning. The subject is the first
// line of the commit message; sha is the short hex SHA (`%h`).
export interface ScannedCommit {
  readonly sha: string;
  readonly subject: string;
  readonly body: string;
}

// One issue reference extracted from one commit. `verb` records HOW the
// issue was referenced (plain `#NNN`, `Closes #NNN`, `(#NNN)`, etc.). The
// verb is informational — the apply layer treats every reference the same
// way; the verb is surfaced in dry-run output so the operator can see the
// strength of the link.
export type ReferenceVerb =
  | 'plain'
  | 'closes'
  | 'fixes'
  | 'resolves'
  | 'refs'
  | 'parens';

export interface CommitIssueReference {
  readonly issue: number;
  readonly sha: string;
  readonly subject: string;
  readonly verb: ReferenceVerb;
}

// Deduplicated per-issue record: which issue, which commits contributed to
// it, and the most-actionable commit subject (the first commit in scan
// order — typically the closing commit on GitHub-PR-merge convention).
export interface IssueReferenceGroup {
  readonly issue: number;
  readonly commits: readonly ScannedCommit[];
  readonly verbs: readonly ReferenceVerb[];
  readonly primarySubject: string;
}

// Per-issue outcome from the apply step.
export type ApplyOutcomeKind =
  | 'labeled-and-commented'
  | 'comment-only'
  | 'label-only'
  | 'skipped-already-closed'
  | 'skipped-already-labeled'
  | 'failed-state-check'
  | 'failed-comment'
  | 'failed-label';

export interface CloseShippedOutcome {
  readonly issue: number;
  readonly applied: boolean;
  readonly action: ApplyOutcomeKind;
  readonly error: string | null;
}

export interface CloseShippedSummary {
  readonly commitsScanned: number;
  readonly issuesReferenced: number;
  readonly applied: number;
  readonly skippedClosed: number;
  readonly skippedAlreadyLabeled: number;
  readonly failed: number;
}

export interface CloseShippedResult {
  readonly fromTag: string;
  readonly toTag: string;
  readonly groups: readonly IssueReferenceGroup[];
  readonly outcomes: readonly CloseShippedOutcome[];
  readonly summary: CloseShippedSummary;
}

export interface CloseShippedOptions {
  readonly fromTag: string;
  readonly toTag: string;
  readonly repo: string;
  readonly label: string;
  readonly dryRun: boolean;
  readonly runGh: RunGh;
  readonly runGit: RunGit;
}
