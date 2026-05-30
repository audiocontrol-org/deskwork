// scan runtime for `close-shipped scan` CLI verb. Pure: takes injected
// I/O callbacks, emits a BundleSet. The CLI wrapper in close-shipped.ts
// wires the real runGit / runGh / walkers into these callbacks.

import { assembleBundles } from './bundle.js';
import type {
  AuditLogEntryInput,
  IssueInfo,
  PrInput,
  WorkplanBackfillInput,
} from './bundle.js';
import type { BundleSet, RunGit, ScannedCommit } from './types.js';

export interface RunScanArgs {
  readonly fromTag: string;
  readonly toTag: string;
  readonly repo: string;
  readonly now: Date;
  readonly scanCommitsForRange: () => readonly ScannedCommit[];
  readonly walkAuditLogEntries: () => readonly AuditLogEntryInput[];
  readonly walkWorkplanBackfills: () => readonly WorkplanBackfillInput[];
  readonly resolvePrForRange: () => PrInput | null;
  readonly issueInfo: (n: number) => IssueInfo;
  readonly runGit: RunGit;
}

function diffStatFor(sha: string, runGit: RunGit): string {
  try {
    const raw = runGit(['show', '--stat', '--format=', sha]);
    const last = raw.trim().split('\n').filter((l) => l.trim().length > 0).pop();
    return last?.trim() ?? '';
  } catch {
    return '';
  }
}

export function runScan(args: RunScanArgs): BundleSet {
  const commits = args.scanCommitsForRange();
  const auditEntries = args.walkAuditLogEntries();
  const workplanBackfills = args.walkWorkplanBackfills();
  const pr = args.resolvePrForRange();

  const initialBundles = assembleBundles({
    commits,
    auditLogEntries: auditEntries,
    workplanBackfills,
    pr,
    issueInfo: args.issueInfo,
  });

  const diffStats = new Map<string, string>();
  for (const b of initialBundles) {
    for (const c of b.commits) {
      if (!diffStats.has(c.sha)) {
        diffStats.set(c.sha, diffStatFor(c.sha, args.runGit));
      }
    }
  }

  const bundles = initialBundles.map((b) => ({
    ...b,
    commits: b.commits.map((c) => ({
      ...c,
      diff_stat: diffStats.get(c.sha) ?? '',
    })),
  }));

  return {
    generated_at: args.now.toISOString(),
    from_tag: args.fromTag,
    to_tag: args.toTag,
    repo: args.repo,
    bundles,
  };
}
