// Types for /dw-lifecycle:dismantle-worktrees propose|apply.
//
// Mirrors the promote-deferrals shape: a ProposalFile is the durable
// JSON intermediate; propose writes it pre-filled with recommended
// dispositions; the operator fills in decisions; apply reads it and
// dispatches one worktree at a time.

import type { RunGit } from '../debt-report/types.js';
import type { WorktreeEntry, RecommendedDisposition } from '../worktree-report/types.js';

export type OperatorDecision =
  | 'dismantle'                // remove the worktree
  | 'archive-then-dismantle'   // tag-archive the branch, then remove the worktree
  | 'prune-orphan'             // call `git worktree prune` (orphan-directory verdict)
  | 'skip'                     // leave alone this cycle
  | '';                         // unset; apply refuses on unset

export interface ProposalItem {
  readonly path: string;
  readonly branch: string | null;
  readonly verdict: WorktreeEntry['verdict'];
  readonly recommended_disposition: RecommendedDisposition;
  /** Operator-decision field. Set by the operator between propose and apply. */
  decision: OperatorDecision;
  /** Required when decision is `dismantle` with --allow-dirty or --force-discard. */
  reason?: string;
  /** Optional: whether to compose with archive-branch (sets `--archive-first` at dismantle time). */
  archive_first?: boolean;
}

export interface ProposalFile {
  readonly generated_at: string;
  readonly project_root: string;
  readonly days_threshold: number;
  readonly threshold_count: number;
  readonly worktree_base: string;
  readonly items: ProposalItem[];
}

export interface DismantleOptions {
  readonly archiveFirst: boolean;
  /** Allow dirty working tree. Requires a substantive reason. */
  readonly allowDirty: boolean;
  /** Allow forcing discard of local-only commits. Requires a substantive reason. */
  readonly forceDiscard: boolean;
  /** Accept divergence from origin (force-push detected). */
  readonly acceptDivergence: boolean;
  /** Allow worktrees outside the auto-detected base path. */
  readonly allowExternal: boolean;
  /** Operator-supplied reason (validated when allowDirty or forceDiscard). */
  readonly reason?: string;
}

export interface PerItemResult {
  readonly path: string;
  readonly decision: OperatorDecision;
  readonly success: boolean;
  readonly error?: string;
  readonly tagCreated?: string;
}

export interface ApplyResult {
  readonly applied: readonly PerItemResult[];
  readonly skipped: readonly PerItemResult[];
  readonly failed: readonly PerItemResult[];
}

export interface DismantleContext {
  readonly runGit: RunGit;
  readonly projectRoot: string;
  readonly currentWorktreePath: string;
  readonly mainWorktreePath: string;
  readonly worktreeBase: string;
}
