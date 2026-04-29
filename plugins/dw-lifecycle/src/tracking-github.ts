import { execFileSync } from 'node:child_process';

export interface CreateIssueArgs {
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface IssueRef {
  url: string;
  number: number;
}

export interface CreatePhaseIssuesArgs {
  repo: string;
  parentNumber: number;
  phases: Array<{ name: string; body: string }>;
  labels?: string[];
}

function parseIssueRef(stdout: string | Buffer): IssueRef {
  const text = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
  const url = text.trim();
  const match = /\/issues\/(\d+)/.exec(url);
  if (!match) throw new Error(`Could not parse gh issue URL: ${url}`);
  const numStr = match[1];
  if (!numStr) throw new Error(`Could not parse issue number from URL: ${url}`);
  return { url, number: parseInt(numStr, 10) };
}

function buildGhArgs(args: CreateIssueArgs): string[] {
  const ghArgs = [
    'issue',
    'create',
    '--repo',
    args.repo,
    '--title',
    args.title,
    '--body',
    args.body,
  ];
  for (const label of args.labels ?? []) {
    ghArgs.push('--label', label);
  }
  return ghArgs;
}

export function createParentIssue(args: CreateIssueArgs): IssueRef {
  const out = execFileSync('gh', buildGhArgs(args), { encoding: 'utf8' });
  return parseIssueRef(out);
}

export function createPhaseIssues(args: CreatePhaseIssuesArgs): IssueRef[] {
  return args.phases.map((p) => {
    const body = `${p.body}\n\nPart of #${args.parentNumber}.`;
    const out = execFileSync(
      'gh',
      buildGhArgs({
        repo: args.repo,
        title: p.name,
        body,
        labels: args.labels,
      }),
      { encoding: 'utf8' }
    );
    return parseIssueRef(out);
  });
}
