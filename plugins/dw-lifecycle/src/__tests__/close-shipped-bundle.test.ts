import { describe, it, expect } from 'vitest';
import { assembleBundles } from '../close-shipped/bundle.js';
import type { ScannedCommit } from '../close-shipped/types.js';

describe('assembleBundles', () => {
  const commits: readonly ScannedCommit[] = [
    {
      sha: 'aaa1234',
      subject: 'feat(x): subject (#42)',
      body: 'Closes #43',
    },
    { sha: 'bbb5678', subject: 'fix(y): another (#43)', body: '' },
  ];

  const issueInfo = (n: number) => ({
    number: n,
    title: `Issue ${n} title`,
    state: 'OPEN' as const,
    body: `Body of issue ${n}`,
    recent_comments: [`Comment 1 on ${n}`, `Comment 2 on ${n}`],
  });

  it('produces one bundle per distinct issue number', () => {
    const result = assembleBundles({
      commits,
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    const issues = result.map((b) => b.issue.number).sort((a, b) => a - b);
    expect(issues).toEqual([42, 43]);
  });

  it('attaches every commit that mentions the issue (#42 → 1 commit; #43 → 2)', () => {
    const result = assembleBundles({
      commits,
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    const b42 = result.find((b) => b.issue.number === 42);
    const b43 = result.find((b) => b.issue.number === 43);
    expect(b42?.commits.map((c) => c.sha)).toEqual(['aaa1234']);
    expect(b43?.commits.map((c) => c.sha).sort()).toEqual(['aaa1234', 'bbb5678']);
  });

  it('truncates commit body to ~500 chars with trailing ellipsis', () => {
    const longBody = 'x'.repeat(600);
    const result = assembleBundles({
      commits: [{ sha: 'ccc9012', subject: 'subj', body: `Closes #99\n${longBody}` }],
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    const b99 = result.find((b) => b.issue.number === 99);
    expect(b99).toBeDefined();
    if (b99 === undefined) return;
    expect(b99.commits[0]?.body.length).toBeLessThanOrEqual(503);
    expect(b99.commits[0]?.body.endsWith('…')).toBe(true);
  });

  it('attaches audit-log entries whose body OR tracks_issue mentions the number', () => {
    const result = assembleBundles({
      commits: [],
      auditLogEntries: [
        {
          finding_id: 'AUDIT-1',
          status: 'fixed-aaa1234',
          tracks_issue: 42,
          surface: 'src/foo.ts',
          body: 'Body without #refs',
        },
        {
          finding_id: 'AUDIT-2',
          status: 'fixed-bbb5678',
          tracks_issue: null,
          surface: 'src/bar.ts',
          body: 'Mentions #43 in body',
        },
      ],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    expect(result.find((b) => b.issue.number === 42)?.audit_log_entries.length).toBe(1);
    expect(result.find((b) => b.issue.number === 43)?.audit_log_entries.length).toBe(1);
  });

  it('attaches workplan back-fills whose `text` mentions the issue number', () => {
    const result = assembleBundles({
      commits: [],
      auditLogEntries: [],
      workplanBackfills: [
        { file: 'docs/foo/workplan.md', line: 10, text: '[x] Step 1 · [#42](url)' },
      ],
      pr: null,
      issueInfo,
    });
    expect(result.find((b) => b.issue.number === 42)?.workplan_backfills.length).toBe(1);
  });

  it('returns empty bundle list when no source mentions any issue', () => {
    const result = assembleBundles({
      commits: [{ sha: 'aaa1234', subject: 'no refs', body: '' }],
      auditLogEntries: [],
      workplanBackfills: [],
      pr: null,
      issueInfo,
    });
    expect(result).toEqual([]);
  });
});
