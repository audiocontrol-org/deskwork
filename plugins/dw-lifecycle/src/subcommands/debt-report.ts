import { execFileSync } from 'node:child_process';
import { repoRoot } from '../repo.js';
import { runDebtReport } from '../debt-report/index.js';
import { formatJson, formatMarkdown } from '../debt-report/formatters.js';

export interface DebtReportCliOptions {
  json: boolean;
  staleDays: number;
  commentStaleDays: number;
  parkedDays: number;
  sampleSize: number;
  issueLimit: number;
  includeGh: boolean;
  includeWorkplan: boolean;
  includeBranches: boolean;
  repo?: string;
}

function defaults(): DebtReportCliOptions {
  return {
    json: false,
    staleDays: 30,
    commentStaleDays: 7,
    parkedDays: 30,
    sampleSize: 5,
    issueLimit: 1000,
    includeGh: true,
    includeWorkplan: true,
    includeBranches: true,
  };
}

function parsePositiveInt(flag: string, raw: string | undefined): number {
  if (raw === undefined) {
    throw new Error(`${flag} requires a numeric value.`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer (got '${raw}').`);
  }
  return n;
}

export function parseDebtReportArgs(args: readonly string[]): DebtReportCliOptions {
  const opts = defaults();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    switch (flag) {
      case '--json':
        opts.json = true;
        break;
      case '--no-gh':
        opts.includeGh = false;
        break;
      case '--no-workplan':
        opts.includeWorkplan = false;
        break;
      case '--no-branches':
        opts.includeBranches = false;
        break;
      case '--repo': {
        const next = args[++i];
        if (next === undefined) throw new Error('--repo requires a value.');
        opts.repo = next;
        break;
      }
      case '--stale-days':
        opts.staleDays = parsePositiveInt('--stale-days', args[++i]);
        break;
      case '--comment-stale-days':
        opts.commentStaleDays = parsePositiveInt('--comment-stale-days', args[++i]);
        break;
      case '--parked-days':
        opts.parkedDays = parsePositiveInt('--parked-days', args[++i]);
        break;
      case '--limit':
        opts.issueLimit = parsePositiveInt('--limit', args[++i]);
        break;
      case '--sample-size':
        opts.sampleSize = parsePositiveInt('--sample-size', args[++i]);
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return opts;
}

function defaultRunGh(args: readonly string[]): string {
  return execFileSync('gh', args as string[], { encoding: 'utf8' });
}

function defaultRunGit(cwd: string) {
  return (args: readonly string[]): string =>
    execFileSync('git', args as string[], { cwd, encoding: 'utf8' });
}

export async function debtReport(rawArgs: string[]): Promise<void> {
  const opts = parseDebtReportArgs(rawArgs);
  const root = repoRoot();

  const report = await runDebtReport({
    projectRoot: root,
    staleDays: opts.staleDays,
    commentStaleDays: opts.commentStaleDays,
    parkedDays: opts.parkedDays,
    sampleSize: opts.sampleSize,
    issueLimit: opts.issueLimit,
    includeGh: opts.includeGh,
    includeWorkplan: opts.includeWorkplan,
    includeBranches: opts.includeBranches,
    ...(opts.repo !== undefined ? { repo: opts.repo } : {}),
    now: new Date(),
    runGh: defaultRunGh,
    runGit: defaultRunGit(root),
  });

  const out = opts.json ? formatJson(report) : formatMarkdown(report);
  process.stdout.write(out);
  if (!out.endsWith('\n')) process.stdout.write('\n');
}
