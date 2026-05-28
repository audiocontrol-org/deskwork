import { loadConfig } from '../config.js';
import { scanGhIssues } from './gh-issues.js';
import { scanParkedBranches } from './parked-branches.js';
import { scanWorkplanTbds } from './workplan-tbd.js';
import type {
  DebtReport,
  DebtReportOptions,
  GhIssuesReport,
  ParkedBranchesReport,
  WorkplanTbdsReport,
} from './types.js';

function detectRepoFromGit(runGit: DebtReportOptions['runGit']): string {
  const remote = runGit(['remote', 'get-url', 'origin']).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match) {
    throw new Error(
      `Could not detect GitHub repo from origin: ${remote}. Pass --repo <owner/repo>.`,
    );
  }
  const repo = match[1];
  if (!repo) {
    throw new Error(`Could not detect GitHub repo from origin: ${remote}.`);
  }
  return repo;
}

export async function runDebtReport(opts: DebtReportOptions): Promise<DebtReport> {
  let githubIssues: GhIssuesReport | null = null;
  let workplanTbds: WorkplanTbdsReport | null = null;
  let parkedBranches: ParkedBranchesReport | null = null;

  if (opts.includeGh) {
    const repo = opts.repo ?? detectRepoFromGit(opts.runGit);
    githubIssues = scanGhIssues({
      repo,
      staleDays: opts.staleDays,
      commentStaleDays: opts.commentStaleDays,
      sampleSize: opts.sampleSize,
      limit: opts.issueLimit,
      now: opts.now,
      runGh: opts.runGh,
    });
  }

  if (opts.includeWorkplan) {
    const config = loadConfig(opts.projectRoot);
    workplanTbds = scanWorkplanTbds({
      projectRoot: opts.projectRoot,
      config,
    });
  }

  if (opts.includeBranches) {
    parkedBranches = scanParkedBranches({
      now: opts.now,
      parkedDays: opts.parkedDays,
      runGit: opts.runGit,
    });
  }

  return {
    generated_at: opts.now.toISOString(),
    github_issues: githubIssues,
    workplan_tbds: workplanTbds,
    parked_branches: parkedBranches,
  };
}

export type {
  DebtReport,
  DebtReportOptions,
  GhIssuesReport,
  ParkedBranchesReport,
  WorkplanTbdsReport,
} from './types.js';
