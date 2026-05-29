// Scan orchestration for /dw-lifecycle:worktree-report.
//
// Walks `git worktree list --porcelain`, then dispatches to per-source
// probe modules (git-probes, gh-pr-state, feature-doc) to compute the
// nine staleness signals per worktree. Pure read; no mutations.

import { dirname } from 'node:path';
import {
  buildSignals,
  evaluateStaleness,
} from './staleness.js';
import {
  detectMainWorktreePath,
  detectCurrentWorktreePath,
  readAheadBehind,
  readWorkingTreeState,
  readLastCommit,
  branchGoneFromOrigin,
  localOnlyCommits,
  detectDivergence,
} from './git-probes.js';
import { gatherPrStates, prStateFor } from './gh-pr-state.js';
import { detectFeatureDoc, findOrphanDirs } from './feature-doc.js';
import type {
  StalenessSignal,
  WorktreeEntry,
  WorktreeReport,
  WorktreeReportOptions,
} from './types.js';

interface RawPorcelainEntry {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
  readonly bare: boolean;
  readonly prunable: boolean;
  readonly prunableReason?: string;
}

/**
 * Parse `git worktree list --porcelain` output.
 *
 * Format (per `git worktree list --help`):
 *   worktree <path>
 *   HEAD <sha>
 *   [bare | branch <refname> | detached]
 *   [prunable [<reason>]]
 *   <blank line>
 */
export function parsePorcelain(out: string): RawPorcelainEntry[] {
  const entries: RawPorcelainEntry[] = [];
  const blocks = out.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    let path = '';
    let head = '';
    let branch: string | null = null;
    let bare = false;
    let prunable = false;
    let prunableReason: string | undefined;
    let detached = false;
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length).trim();
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length).trim();
      } else if (line === 'bare') {
        bare = true;
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        branch = ref.replace(/^refs\/heads\//, '');
      } else if (line === 'detached') {
        detached = true;
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        prunable = true;
        const rest = line.slice('prunable'.length).trim();
        if (rest.length > 0) prunableReason = rest;
      }
    }
    if (path.length === 0 || head.length === 0) continue;
    const entry: RawPorcelainEntry = {
      path, head, branch: detached ? null : branch, bare, prunable,
    };
    entries.push(prunableReason !== undefined ? { ...entry, prunableReason } : entry);
  }
  return entries;
}

export function autoDetectWorktreeBase(porcelain: readonly RawPorcelainEntry[]): string {
  const paths = porcelain.filter((e) => !e.bare).map((e) => e.path);
  if (paths.length === 0) return '';
  if (paths.length === 1) return dirname(paths[0]!);
  let prefix = paths[0]!;
  for (const p of paths.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < p.length && prefix[i] === p[i]) i++;
    prefix = prefix.slice(0, i);
  }
  const lastSep = prefix.lastIndexOf('/');
  return lastSep >= 0 ? prefix.slice(0, lastSep) : prefix;
}

function buildEntryForRegisteredWorktree(
  raw: RawPorcelainEntry,
  opts: WorktreeReportOptions,
  ctx: {
    currentPath: string;
    mainPath: string;
    prByBranch: Map<string, { number: number; state: 'OPEN' | 'CLOSED' | 'MERGED'; headRefName: string }>;
    branchOccurrences: Map<string, number>;
  },
): WorktreeEntry {
  const isCurrent = raw.path === ctx.currentPath;
  const isMain = raw.path === ctx.mainPath;
  const aheadBehind = readAheadBehind(opts.runGit, raw.path, raw.branch, 'origin/main');
  const workingTree = readWorkingTreeState(opts.runGit, raw.path);
  const lastCommit = readLastCommit(opts.runGit, raw.path);
  const gh = raw.branch !== null ? ctx.prByBranch.get(raw.branch) : undefined;
  const prState = prStateFor(gh);
  const featureDoc = detectFeatureDoc(opts.projectRoot, raw.branch, opts.statDir, opts.readDir);

  // Nine signals.
  const branchFullyMerged = raw.branch !== null && aheadBehind.ahead === 0;
  const prMergedOrClosed = prState === 'merged' || prState === 'closed';
  const featureDocComplete = featureDoc.location === 'complete';
  let noRecentCommits = false;
  let lastCommitNote: string | undefined;
  if (lastCommit.date.length > 0) {
    const last = new Date(lastCommit.date);
    const ageDays = (opts.now.getTime() - last.getTime()) / 86400_000;
    noRecentCommits = ageDays > opts.daysThreshold;
    lastCommitNote = `last commit ${Math.floor(ageDays)} days ago`;
  }
  const branchGone = branchGoneFromOrigin(opts.runGit, raw.path, raw.branch);
  const workingTreeClean = workingTree === 'clean';
  const commitsOnOrigin = !localOnlyCommits(opts.runGit, raw.path, raw.branch);

  const rawSignals: Record<StalenessSignal, boolean> = {
    'branch-fully-merged': branchFullyMerged,
    'pr-merged-or-closed': prMergedOrClosed,
    'feature-doc-complete': featureDocComplete,
    'no-recent-commits': noRecentCommits,
    'branch-gone-from-origin': branchGone,
    'working-tree-clean': workingTreeClean,
    'commits-on-origin': commitsOnOrigin,
    'prunable': raw.prunable,
    'orphan-directory': false,
  };
  const notes: Partial<Record<StalenessSignal, string>> = {};
  if (lastCommitNote !== undefined) notes['no-recent-commits'] = lastCommitNote;
  if (aheadBehind.ahead > 0 || aheadBehind.behind > 0) {
    notes['branch-fully-merged'] = `ahead ${aheadBehind.ahead}, behind ${aheadBehind.behind}`;
  }
  if (raw.prunableReason !== undefined) notes['prunable'] = raw.prunableReason;
  if (gh !== undefined) notes['pr-merged-or-closed'] = `PR #${gh.number} ${gh.state.toLowerCase()}`;
  const signals = buildSignals(rawSignals, notes);

  const isCorrupt = raw.branch !== null && (ctx.branchOccurrences.get(raw.branch) ?? 0) > 1;
  const isDivergent = detectDivergence(opts.runGit, raw.path, raw.branch, raw.head);

  const verdictResult = evaluateStaleness({
    signals,
    thresholdCount: opts.thresholdCount,
    isCurrent,
    isMain,
    isOrphan: false,
    isDivergent,
    isCorrupt,
    hasNovelCommitsAheadOfMain: aheadBehind.ahead > 0,
  });

  return {
    path: raw.path,
    branch: raw.branch,
    head: raw.head,
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
    last_commit_sha: lastCommit.sha,
    last_commit_date: lastCommit.date,
    working_tree_state: workingTree,
    pr_state: prState,
    ...(gh !== undefined ? { pr_number: gh.number } : {}),
    feature_doc: featureDoc,
    signals,
    verdict: verdictResult.verdict,
    recommended_disposition: verdictResult.disposition,
    is_current: isCurrent,
    is_main: isMain,
  };
}

function buildOrphanEntry(
  path: string,
  thresholdCount: number,
): WorktreeEntry {
  const signals = buildSignals({
    'branch-fully-merged': false,
    'pr-merged-or-closed': false,
    'feature-doc-complete': false,
    'no-recent-commits': false,
    'branch-gone-from-origin': false,
    'working-tree-clean': false,
    'commits-on-origin': false,
    'prunable': false,
    'orphan-directory': true,
  });
  const verdictResult = evaluateStaleness({
    signals, thresholdCount,
    isCurrent: false, isMain: false, isOrphan: true,
    isDivergent: false, isCorrupt: false,
    hasNovelCommitsAheadOfMain: false,
  });
  return {
    path, branch: null, head: '',
    ahead: 0, behind: 0,
    last_commit_sha: '', last_commit_date: '',
    working_tree_state: 'clean',
    pr_state: 'no-pr',
    feature_doc: { location: 'none' },
    signals,
    verdict: verdictResult.verdict,
    recommended_disposition: verdictResult.disposition,
    is_current: false, is_main: false,
  };
}

const VERDICT_ORDER = ['stale', 'orphan', 'divergent', 'corrupt', 'keep', 'current', 'main'] as const;

export function runWorktreeReport(opts: WorktreeReportOptions): WorktreeReport {
  const porcelain = parsePorcelain(opts.runGit(['worktree', 'list', '--porcelain']));
  const mainPath = detectMainWorktreePath(opts.runGit, opts.projectRoot);
  const currentPath = detectCurrentWorktreePath(opts.runGit, opts.projectRoot);
  const autoBase = autoDetectWorktreeBase(porcelain);
  const worktreeBase = opts.worktreeBase ?? autoBase;

  const branchOccurrences = new Map<string, number>();
  for (const entry of porcelain) {
    if (entry.branch !== null) {
      branchOccurrences.set(entry.branch, (branchOccurrences.get(entry.branch) ?? 0) + 1);
    }
  }
  const prByBranch = gatherPrStates(
    opts.runGh,
    porcelain.map((e) => e.branch).filter((b): b is string => b !== null),
  );
  const ctx = { currentPath, mainPath, prByBranch, branchOccurrences };

  const entries: WorktreeEntry[] = [];
  for (const raw of porcelain) {
    if (raw.bare) continue;
    if (!opts.allowExternal && worktreeBase.length > 0) {
      const isCurrent = raw.path === currentPath;
      const isMain = raw.path === mainPath;
      if (!raw.path.startsWith(worktreeBase) && !isCurrent && !isMain) continue;
    }
    entries.push(buildEntryForRegisteredWorktree(raw, opts, ctx));
  }

  const registeredPaths = new Set(porcelain.map((e) => e.path));
  for (const orphanPath of findOrphanDirs(worktreeBase, registeredPaths, opts.readDir, opts.statDir)) {
    entries.push(buildOrphanEntry(orphanPath, opts.thresholdCount));
  }

  entries.sort((a, b) => {
    const av = VERDICT_ORDER.indexOf(a.verdict);
    const bv = VERDICT_ORDER.indexOf(b.verdict);
    if (av !== bv) return av - bv;
    return a.path.localeCompare(b.path);
  });

  return {
    generated_at: opts.now.toISOString(),
    days_threshold: opts.daysThreshold,
    threshold_count: opts.thresholdCount,
    worktree_base: worktreeBase,
    entries,
  };
}
