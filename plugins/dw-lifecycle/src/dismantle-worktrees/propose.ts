// propose: reads worktree-report output (or runs it inline); emits a
// proposal JSON file pre-filled with recommended dispositions, one
// row per stale/orphan entry. Operator fills in `decision` between
// propose and apply.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runWorktreeReport } from '../worktree-report/scan.js';
import type { WorktreeReportOptions } from '../worktree-report/types.js';
import type { ProposalFile, ProposalItem } from './types.js';

export class ProposalOutputExistsError extends Error {
  override name = 'ProposalOutputExistsError';
}

export interface ProposeArgs {
  readonly opts: WorktreeReportOptions;
  /**
   * Output path. Defaults to:
   *   <projectRoot>/.dw-lifecycle/dismantle-worktrees/proposals-<iso>.json
   */
  readonly outputPath?: string;
  /** When true, an existing file at outputPath is overwritten. */
  readonly force?: boolean;
}

export interface ProposeResult {
  readonly proposalFile: ProposalFile;
  readonly outputPath: string;
  readonly markdownTable: string;
  readonly itemCount: number;
}

function defaultOutputPath(projectRoot: string, isoNow: string): string {
  const tsSlug = isoNow.replace(/[:.]/g, '-');
  return join(
    projectRoot,
    '.dw-lifecycle',
    'dismantle-worktrees',
    `proposals-${tsSlug}.json`,
  );
}

function renderMarkdownTable(items: readonly ProposalItem[]): string {
  if (items.length === 0) {
    return '_No stale or orphan worktrees to propose. Nothing to dismantle._\n';
  }
  const header = '| # | Path | Branch | Verdict | Recommended | Decision |';
  const sep = '|---|---|---|---|---|---|';
  const rows = items.map((it, i) => {
    const branch = it.branch ?? '(detached)';
    return `| ${i + 1} | \`${it.path}\` | \`${branch}\` | ${it.verdict} | ${it.recommended_disposition} | _(operator)_ |`;
  });
  return [header, sep, ...rows].join('\n') + '\n';
}

export function propose(args: ProposeArgs): ProposeResult {
  const report = runWorktreeReport(args.opts);

  const items: ProposalItem[] = [];
  for (const entry of report.entries) {
    // Only stale + orphan entries land in the proposal — keep / current /
    // main are never dismantle candidates; divergent + corrupt need
    // operator-triage before they enter the propose flow.
    if (entry.verdict !== 'stale' && entry.verdict !== 'orphan') continue;
    items.push({
      path: entry.path,
      branch: entry.branch,
      verdict: entry.verdict,
      recommended_disposition: entry.recommended_disposition,
      decision: '',
    });
  }

  const proposalFile: ProposalFile = {
    generated_at: report.generated_at,
    project_root: args.opts.projectRoot,
    days_threshold: report.days_threshold,
    threshold_count: report.threshold_count,
    worktree_base: report.worktree_base,
    items,
  };

  const outputPath = args.outputPath ?? defaultOutputPath(
    args.opts.projectRoot,
    report.generated_at,
  );

  if (existsSync(outputPath) && !args.force) {
    throw new ProposalOutputExistsError(
      `Proposal file already exists at ${outputPath}. Pass --force to overwrite.`,
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(proposalFile, null, 2) + '\n');

  return {
    proposalFile,
    outputPath,
    markdownTable: renderMarkdownTable(items),
    itemCount: items.length,
  };
}
