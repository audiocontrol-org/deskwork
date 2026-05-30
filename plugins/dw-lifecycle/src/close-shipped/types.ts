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

// Source identifiers for the four evidence walkers. The commit-log
// scanner produces 'commit-log' findings; the audit-log walker produces
// 'audit-log' findings (one per `Status: fixed-<sha>` entry whose SHA is
// reachable in the release range); the tooling-feedback walker produces
// 'tooling-feedback' findings; the workplan-checkbox walker produces
// 'workplan-checkbox' findings (one per checked task carrying a
// `· [#NNN](url)` back-fill).
export type EvidenceSource =
  | 'commit-log'
  | 'audit-log'
  | 'tooling-feedback'
  | 'workplan-checkbox';

// Per-source provenance entry. Sources (a)/(b)/(c) carry a SHA that
// roots the finding in a specific commit. Source (d) is the checkbox
// itself — no SHA association. All sources carry a path that points
// the operator at the on-disk evidence.
export interface ProvenanceEntry {
  readonly source: EvidenceSource;
  readonly sha: string | null;
  readonly path: string | null;
  readonly detail: string | null;
}

// Per-issue merged evidence: which sources flagged it, the dedup'd
// commit set across sources, the verb history from the commit-log
// scanner (when present), the per-source provenance trail, and the
// orphan-source flag when two sources cite mutually-exclusive SHAs.
export interface MergedIssueEvidence {
  readonly issue: number;
  readonly sources: readonly EvidenceSource[];
  readonly commits: readonly ScannedCommit[];
  readonly verbs: readonly ReferenceVerb[];
  readonly primarySubject: string;
  readonly provenance: readonly ProvenanceEntry[];
  readonly orphanSource: boolean;
  readonly orphanReason: string | null;
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
  readonly merged: readonly MergedIssueEvidence[];
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

// === Phase 15 redesign types ===
//
// Phase 15 retires the per-walker prose-grammar architecture in favor of
// mechanical narrowing + Agent-tool dispatch from within the agent's
// Claude Code session + operator-curated propose|apply. The types below
// are the data shapes the new flow exchanges between mechanical helpers
// (scan, propose, apply-v2) and the SKILL.md prose orchestration.

/**
 * Per-candidate evidence bundle the agent reads to render a verdict.
 * Mechanically assembled by bundle.ts — no judgment, no filtering.
 */
export interface CandidateBundle {
  readonly issue: {
    readonly number: number;
    readonly title: string;
    readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
    readonly body: string;
    readonly recent_comments: readonly string[];
  };
  readonly commits: readonly {
    readonly sha: string;
    readonly subject: string;
    readonly body: string;
    readonly diff_stat: string;
  }[];
  readonly pr: {
    readonly number: number;
    readonly title: string;
    readonly body: string;
  } | null;
  readonly audit_log_entries: readonly {
    readonly finding_id: string | null;
    readonly status: string;
    readonly tracks_issue: number | null;
    readonly surface: string;
    readonly body: string;
  }[];
  readonly workplan_backfills: readonly {
    readonly file: string;
    readonly line: number;
    readonly text: string;
  }[];
}

/** The entire `close-shipped scan` output. */
export interface BundleSet {
  readonly generated_at: string;
  readonly from_tag: string;
  readonly to_tag: string;
  readonly repo: string;
  readonly bundles: readonly CandidateBundle[];
}

/** One agent verdict for one candidate. */
export interface Verdict {
  readonly issue: number;
  readonly verdict: 'shipped' | 'not-shipped' | 'uncertain' | 'error';
  readonly reason: string;
}

/** Agent verdicts collected by SKILL.md orchestration, passed to propose. */
export interface VerdictSet {
  readonly verdicts: readonly Verdict[];
}

export type ProposalDecision =
  | 'accept-verdict'
  | 'override-shipped'
  | 'override-not-shipped'
  | 'skip';

/** Per-proposal-row record. `decision` is mutable so the operator can fill it in. */
export interface ProposalItem {
  readonly issue: number;
  readonly issue_title: string;
  readonly issue_state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly agent_verdict: Verdict['verdict'];
  readonly agent_reason: string;
  readonly evidence_summary: string;
  decision: ProposalDecision | '';
}

/** The proposal JSON file. */
export interface Proposal {
  readonly generated_at: string;
  readonly from_tag: string;
  readonly to_tag: string;
  readonly repo: string;
  readonly items: readonly ProposalItem[];
}
