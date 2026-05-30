import { describe, it, expect } from 'vitest';
import { composeProposal, renderMarkdownTable } from '../close-shipped/propose.js';
import type { BundleSet, VerdictSet } from '../close-shipped/types.js';

const FIXTURE_BUNDLES: BundleSet = {
  generated_at: '2026-05-30T03:15:22Z',
  from_tag: 'v0.27.0',
  to_tag: 'v0.28.1',
  repo: 'owner/repo',
  bundles: [
    {
      issue: { number: 361, title: 'session-end-hygiene sweep', state: 'OPEN', body: '', recent_comments: [] },
      commits: [{ sha: 'aaa1234', subject: 'feat: x', body: '', diff_stat: '5 files' }],
      pr: { number: 365, title: 'PR title', body: '' },
      audit_log_entries: [
        { finding_id: 'AUDIT-1', status: 'fixed-aaa1234', tracks_issue: 361, surface: 'src/foo.ts', body: '' },
      ],
      workplan_backfills: [],
    },
    {
      issue: { number: 353, title: 'audit-barrage Phase 12', state: 'OPEN', body: '', recent_comments: [] },
      commits: [{ sha: 'bbb5678', subject: 'docs: back-fill', body: '', diff_stat: '1 file' }],
      pr: null,
      audit_log_entries: [],
      workplan_backfills: [],
    },
  ],
};

const FIXTURE_VERDICTS: VerdictSet = {
  verdicts: [
    { issue: 361, verdict: 'shipped', reason: 'Phase 12 fix lands in 8841be9' },
    { issue: 353, verdict: 'not-shipped', reason: 'back-fill docs commit, not a fix' },
  ],
};

describe('composeProposal', () => {
  it('produces one item per bundle in issue-ascending order with empty decisions', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    expect(p.items.map((i) => i.issue)).toEqual([353, 361]);
    for (const item of p.items) expect(item.decision).toBe('');
  });

  it('mirrors tag range + generated_at + repo from the bundle set', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    expect(p.from_tag).toBe('v0.27.0');
    expect(p.to_tag).toBe('v0.28.1');
    expect(p.repo).toBe('owner/repo');
  });

  it('attaches the agent verdict + reason to each item', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    const i361 = p.items.find((i) => i.issue === 361);
    expect(i361?.agent_verdict).toBe('shipped');
    expect(i361?.agent_reason).toBe('Phase 12 fix lands in 8841be9');
  });

  it('writes a mechanical evidence_summary citing counts + PR linkage', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    const i361 = p.items.find((i) => i.issue === 361);
    expect(i361?.evidence_summary).toContain('1 commit');
    expect(i361?.evidence_summary).toContain('1 audit');
    expect(i361?.evidence_summary).toContain('PR #365');
    const i353 = p.items.find((i) => i.issue === 353);
    expect(i353?.evidence_summary).not.toContain('PR #');
  });

  it('marks a candidate `error` when there is no matching verdict in the set', () => {
    const orphan: BundleSet = {
      ...FIXTURE_BUNDLES,
      bundles: [...FIXTURE_BUNDLES.bundles, {
        issue: { number: 999, title: 'orphan', state: 'OPEN', body: '', recent_comments: [] },
        commits: [],
        pr: null,
        audit_log_entries: [],
        workplan_backfills: [],
      }],
    };
    const p = composeProposal(orphan, FIXTURE_VERDICTS);
    const i999 = p.items.find((i) => i.issue === 999);
    expect(i999?.agent_verdict).toBe('error');
    expect(i999?.agent_reason).toContain('no verdict');
  });
});

describe('renderMarkdownTable', () => {
  it('renders a header + one row per item', () => {
    const p = composeProposal(FIXTURE_BUNDLES, FIXTURE_VERDICTS);
    const table = renderMarkdownTable(p);
    expect(table).toContain('| Issue');
    expect(table).toContain('#361');
    expect(table).toContain('#353');
    expect(table).toContain('shipped');
    expect(table).toContain('not-shipped');
  });
});
