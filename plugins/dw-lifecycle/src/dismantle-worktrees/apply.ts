// apply: reads the proposal file, validates every entry has a decision
// set, then dispatches per-worktree. All-or-nothing on validation;
// best-effort on per-item dismantle (records per-entry success/failure
// but continues with the rest).

import { readFileSync } from 'node:fs';
import {
  detectMainWorktreePath,
  detectCurrentWorktreePath,
} from '../worktree-report/git-probes.js';
import { parsePorcelain, autoDetectWorktreeBase } from '../worktree-report/scan.js';
import { dismantleWorktree } from './dismantle.js';
import type {
  ApplyResult,
  DismantleContext,
  DismantleOptions,
  OperatorDecision,
  PerItemResult,
  ProposalFile,
} from './types.js';
import type { RunGit } from '../debt-report/types.js';

export class ApplyValidationError extends Error {
  override name = 'ApplyValidationError';
}

const VALID_DECISIONS: ReadonlySet<OperatorDecision> = new Set([
  'dismantle',
  'archive-then-dismantle',
  'prune-orphan',
  'skip',
]);

export interface ApplyArgs {
  readonly proposalPath: string;
  readonly runGit: RunGit;
  readonly defaultOpts: Omit<DismantleOptions, 'archiveFirst'>;
}

function validateProposal(proposal: ProposalFile): void {
  const errors: string[] = [];
  for (let i = 0; i < proposal.items.length; i++) {
    const item = proposal.items[i]!;
    if (!VALID_DECISIONS.has(item.decision)) {
      errors.push(
        `item ${i + 1} (${item.path}): decision is "${item.decision || '<unset>'}"; ` +
        `must be one of: dismantle, archive-then-dismantle, prune-orphan, skip.`,
      );
    }
  }
  if (errors.length > 0) {
    throw new ApplyValidationError(
      `Proposal failed validation; refusing to apply.\n  ${errors.join('\n  ')}`,
    );
  }
}

function readProposal(path: string): ProposalFile {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as ProposalFile;
}

function pruneOrphan(runGit: RunGit, projectRoot: string): void {
  // `git worktree prune` removes administrative files for worktrees
  // whose paths no longer exist. The orphan-directory verdict already
  // names a path that's NOT registered with git; the prune step is a
  // best-effort cleanup of the .git/worktrees/ side. The directory
  // itself stays on disk for the operator to remove (rm -rf is too
  // destructive for the verb to do unprompted).
  try {
    runGit(['-C', projectRoot, 'worktree', 'prune']);
  } catch {
    // Best-effort: prune may exit non-zero if nothing to do.
  }
}

export function apply(args: ApplyArgs): ApplyResult {
  const proposal = readProposal(args.proposalPath);
  validateProposal(proposal);

  // Build the dismantle context once.
  const projectRoot = proposal.project_root;
  const mainPath = detectMainWorktreePath(args.runGit, projectRoot);
  const currentPath = detectCurrentWorktreePath(args.runGit, projectRoot);

  const porcelain = parsePorcelain(args.runGit(['worktree', 'list', '--porcelain']));
  const registeredPaths = new Set(porcelain.map((e) => e.path));
  const headByPath = new Map(porcelain.map((e) => [e.path, e.head]));
  const worktreeBase = proposal.worktree_base || autoDetectWorktreeBase(porcelain);

  const ctx: DismantleContext = {
    runGit: args.runGit,
    projectRoot,
    currentWorktreePath: currentPath,
    mainWorktreePath: mainPath,
    worktreeBase,
  };

  const applied: PerItemResult[] = [];
  const skipped: PerItemResult[] = [];
  const failed: PerItemResult[] = [];

  for (const item of proposal.items) {
    if (item.decision === 'skip') {
      skipped.push({
        path: item.path,
        decision: item.decision,
        success: true,
      });
      continue;
    }

    if (item.decision === 'prune-orphan') {
      pruneOrphan(args.runGit, projectRoot);
      applied.push({
        path: item.path,
        decision: item.decision,
        success: true,
      });
      continue;
    }

    const archiveFirst = item.decision === 'archive-then-dismantle' ||
      (item.archive_first === true);

    const opts: DismantleOptions = {
      ...args.defaultOpts,
      archiveFirst,
      ...(item.reason !== undefined ? { reason: item.reason } : {}),
    };

    try {
      const result = dismantleWorktree({
        worktreePath: item.path,
        branch: item.branch,
        head: headByPath.get(item.path) ?? '',
        ctx,
        opts,
        isKnownToGit: registeredPaths.has(item.path),
      });
      applied.push({
        path: item.path,
        decision: item.decision,
        success: true,
        ...(result.tagCreated !== null ? { tagCreated: result.tagCreated } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({
        path: item.path,
        decision: item.decision,
        success: false,
        error: msg,
      });
    }
  }

  return { applied, skipped, failed };
}
