import { describe, it, expect } from 'vitest';
import { runScan } from '../close-shipped/scan.js';
import type { BundleSet, ScannedCommit } from '../close-shipped/types.js';

const fixtureCommits: readonly ScannedCommit[] = [
  { sha: 'aaa1234', subject: 'feat(x): subject (#42)', body: '' },
  { sha: 'bbb5678', subject: 'fix(y): another', body: 'Closes #43' },
];

const baseIssueInfo = (n: number) => ({
  number: n,
  title: `Issue ${n}`,
  state: 'OPEN' as const,
  body: '',
  recent_comments: [],
});

describe('runScan', () => {
  it('emits a BundleSet keyed by tag range with one bundle per candidate', () => {
    const result: BundleSet = runScan({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      repo: 'owner/repo',
      now: new Date('2026-05-30T00:00:00Z'),
      scanCommitsForRange: () => fixtureCommits,
      walkAuditLogEntries: () => [],
      walkWorkplanBackfills: () => [],
      resolvePrForRange: () => null,
      issueInfo: baseIssueInfo,
      runGit: () => '',
    });
    expect(result.from_tag).toBe('v1.0.0');
    expect(result.to_tag).toBe('v1.1.0');
    expect(result.repo).toBe('owner/repo');
    expect(result.bundles.map((b) => b.issue.number).sort()).toEqual([42, 43]);
  });

  it('embeds diff_stat from a runGit shortlog per commit', () => {
    const result = runScan({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      repo: 'owner/repo',
      now: new Date('2026-05-30T00:00:00Z'),
      scanCommitsForRange: () => [fixtureCommits[0]!],
      walkAuditLogEntries: () => [],
      walkWorkplanBackfills: () => [],
      resolvePrForRange: () => null,
      issueInfo: baseIssueInfo,
      runGit: (args) => {
        if (args[0] === 'show' && args.includes('--stat')) {
          return ' 5 files changed, 87 insertions(+), 23 deletions(-)';
        }
        return '';
      },
    });
    const b42 = result.bundles.find((b) => b.issue.number === 42);
    expect(b42?.commits[0]?.diff_stat).toContain('5 files changed');
  });

  it('attaches the PR to bundles for each issue referenced in the PR body', () => {
    const result = runScan({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      repo: 'owner/repo',
      now: new Date('2026-05-30T00:00:00Z'),
      scanCommitsForRange: () => [],
      walkAuditLogEntries: () => [],
      walkWorkplanBackfills: () => [],
      resolvePrForRange: () => ({
        number: 99,
        title: 'PR title',
        body: 'Closes #42 and #43',
      }),
      issueInfo: baseIssueInfo,
      runGit: () => '',
    });
    expect(result.bundles.find((b) => b.issue.number === 42)?.pr?.number).toBe(99);
    expect(result.bundles.find((b) => b.issue.number === 43)?.pr?.number).toBe(99);
  });
});
