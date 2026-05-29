// Types for /dw-lifecycle:worktree-report — a read-only snapshot of all
// git-registered worktrees + their staleness verdicts.
//
// The shapes here are the schema for the JSON output AND the in-memory
// pipeline between scan (which gathers raw state) and staleness (which
// classifies each entry into a verdict bucket).

import type { RunGh, RunGit } from '../debt-report/types.js';

/**
 * The nine staleness signals enumerated in PRD § Phase 11. Each is a
 * single observable fact; `evaluateStaleness` composes them into a verdict.
 */
export type StalenessSignal =
  | 'branch-fully-merged'    // 0 commits ahead of main
  | 'pr-merged-or-closed'    // gh shows PR in {merged, closed}
  | 'feature-doc-complete'   // 003-COMPLETE/<slug> exists
  | 'no-recent-commits'      // last commit older than --days threshold
  | 'branch-gone-from-origin' // origin doesn't know the branch
  | 'working-tree-clean'      // no modified/untracked files
  | 'commits-on-origin'      // no local-only commits ahead of origin
  | 'prunable'               // git worktree list marks it prunable
  | 'orphan-directory';      // path on disk; git worktree list doesn't know it

export type WorktreeVerdict =
  | 'keep'             // not stale (< threshold signals)
  | 'stale'            // >= threshold signals; safe-ish to dismantle
  | 'orphan'           // directory on disk; git doesn't know it
  | 'divergent'        // local branch sha != origin branch sha for same name
  | 'corrupt'          // multi-worktree same branch, etc.
  | 'current'          // the worktree we're running from
  | 'main';            // the main worktree of the repo

export type RecommendedDisposition =
  | 'keep'                        // verdict: keep
  | 'dismantle'                   // verdict: stale; --archive-first not advised
  | 'archive-then-dismantle'      // verdict: stale; branch has novel work worth preserving
  | 'prune-orphan'                // verdict: orphan
  | 'operator-triage';            // verdict: divergent | corrupt

export interface PerSignalCheck {
  readonly signal: StalenessSignal;
  readonly held: boolean;
  readonly note?: string;  // optional human-readable detail (e.g. "ahead 7, behind 2")
}

export type PrState = 'open' | 'merged' | 'closed' | 'no-pr' | 'unknown';

export type WorkingTreeState = 'clean' | { dirty: number };  // dirty: number of changed files

export type FeatureDocLocation =
  | { location: 'in-progress'; slug: string; targetVersion: string }
  | { location: 'complete'; slug: string; targetVersion: string }
  | { location: 'none' };

export interface WorktreeEntry {
  readonly path: string;
  readonly branch: string | null;  // null when detached HEAD
  readonly head: string;            // SHA at the worktree's HEAD
  readonly ahead: number;
  readonly behind: number;
  readonly last_commit_sha: string;
  readonly last_commit_date: string;  // ISO-8601
  readonly working_tree_state: WorkingTreeState;
  readonly pr_state: PrState;
  readonly pr_number?: number;
  readonly feature_doc: FeatureDocLocation;
  readonly signals: readonly PerSignalCheck[];
  readonly verdict: WorktreeVerdict;
  readonly recommended_disposition: RecommendedDisposition;
  readonly is_current: boolean;
  readonly is_main: boolean;
}

export interface WorktreeReport {
  readonly generated_at: string;
  readonly days_threshold: number;
  readonly threshold_count: number;
  readonly worktree_base: string;
  readonly entries: readonly WorktreeEntry[];
}

export interface WorktreeReportOptions {
  readonly projectRoot: string;
  readonly daysThreshold: number;        // staleness window in days (default 30)
  readonly thresholdCount: number;       // minimum signals to flag stale (default 3)
  readonly worktreeBase?: string;        // override; default = auto-detect
  readonly allowExternal: boolean;        // include worktrees outside the base path
  readonly now: Date;
  readonly runGit: RunGit;
  readonly runGh: RunGh;
  /** filesystem probe for orphan-directory + feature-doc checks. */
  readonly readDir: (path: string) => readonly string[];
  /** filesystem probe — true if path is a directory that exists. */
  readonly statDir: (path: string) => boolean;
}
