// Types for /dw-lifecycle:debt-report — a read-only cross-source debt snapshot.
//
// The skill emits three sections: GitHub issues, workplan TBDs, and parked
// branches. Each section has a count + a sample list. The shapes are the
// schema both for the JSON output and for the in-memory pipeline between
// scanners and formatters.

export interface IssueSample {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly updatedAt: string;
}

export interface GhIssuesReport {
  readonly total_open: number;
  readonly by_label: Record<string, number>;
  readonly unlabeled: {
    readonly count: number;
    readonly sample: readonly IssueSample[];
  };
  readonly stale: {
    readonly threshold_days: number;
    readonly count: number;
    readonly sample: readonly IssueSample[];
  };
  readonly stale_since_last_comment: {
    readonly threshold_days: number;
    readonly count: number;
    readonly sample: readonly IssueSample[];
  };
}

export interface WorkplanFeatureCounts {
  readonly slug: string;
  readonly target_version: string;
  readonly path: string;
  readonly counts: {
    readonly tbd: number;
    readonly defer: number;
    readonly follow_up: number;
    readonly out_of_scope: number;
    readonly total: number;
  };
}

export interface WorkplanTbdsReport {
  readonly total: number;
  readonly features: readonly WorkplanFeatureCounts[];
}

export interface BranchSample {
  readonly refname: string;
  readonly ahead: number;
  readonly behind: number;
  readonly last_commit_date: string;
}

export interface ParkedBranchesReport {
  readonly parked_threshold_days: number;
  readonly parked: readonly BranchSample[];
  readonly other_branches: readonly BranchSample[];
}

export interface DebtReport {
  readonly generated_at: string;
  readonly github_issues: GhIssuesReport | null;
  readonly workplan_tbds: WorkplanTbdsReport | null;
  readonly parked_branches: ParkedBranchesReport | null;
}

// Process-boundary callbacks. Wrapping `gh` and `git` invocations behind
// these stubs is what makes the scanners unit-testable without forking
// real subprocesses — the same pattern as runShell in src/tracking-github.ts
// would have used had it been parameterized.
export type RunGh = (args: readonly string[]) => string;
export type RunGit = (args: readonly string[]) => string;

export interface DebtReportOptions {
  readonly projectRoot: string;
  readonly staleDays: number;
  readonly commentStaleDays: number;
  readonly parkedDays: number;
  readonly sampleSize: number;
  readonly issueLimit: number;
  readonly includeGh: boolean;
  readonly includeWorkplan: boolean;
  readonly includeBranches: boolean;
  readonly repo?: string;
  readonly now: Date;
  readonly runGh: RunGh;
  readonly runGit: RunGit;
}
