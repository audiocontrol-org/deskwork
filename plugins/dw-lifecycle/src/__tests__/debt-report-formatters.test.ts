import { describe, it, expect } from 'vitest';
import { formatMarkdown, formatJson } from '../debt-report/formatters.js';
import type { DebtReport } from '../debt-report/types.js';

function fixtureReport(overrides?: Partial<DebtReport>): DebtReport {
  return {
    generated_at: '2026-05-28T12:00:00.000Z',
    github_issues: {
      total_open: 5,
      by_label: { bug: 2, enhancement: 1 },
      unlabeled: {
        count: 2,
        sample: [
          {
            number: 99,
            title: 'sample title',
            url: 'https://example.com/99',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
        ],
      },
      stale: {
        threshold_days: 30,
        count: 1,
        sample: [
          {
            number: 12,
            title: 'old',
            url: 'https://example.com/12',
            updated_at: '2026-03-01T00:00:00.000Z',
          },
        ],
      },
      stale_since_last_comment: {
        threshold_days: 7,
        count: 0,
        sample: [],
      },
    },
    workplan_tbds: {
      total: 3,
      features: [
        {
          slug: 'hygiene',
          target_version: '1.0',
          path: '/abs/docs/1.0/001-IN-PROGRESS/hygiene/workplan.md',
          counts: {
            tbd: 1,
            defer: 1,
            follow_up: 0,
            out_of_scope: 1,
            total: 3,
          },
        },
      ],
    },
    parked_branches: {
      parked_threshold_days: 30,
      parked: [
        {
          refname: 'feature/old-stuff',
          ahead: 5,
          behind: 12,
          last_commit_date: '2026-01-01T00:00:00.000Z',
        },
      ],
      other_branches: [
        {
          refname: 'feature/active',
          ahead: 2,
          behind: 1,
          last_commit_date: '2026-05-20T00:00:00.000Z',
        },
      ],
    },
    ...overrides,
  };
}

describe('formatMarkdown', () => {
  it('produces a single markdown document with all three sections', () => {
    const md = formatMarkdown(fixtureReport());
    expect(md).toContain('# Debt report');
    expect(md).toMatch(/Generated at: 2026-05-28T12:00:00\.000Z/);
    expect(md).toContain('## GitHub issues');
    expect(md).toContain('## Workplan TBDs');
    expect(md).toContain('## Parked branches');
  });

  it('renders gh issue label counts and sample numbers/titles', () => {
    const md = formatMarkdown(fixtureReport());
    expect(md).toContain('Total open: **5**');
    expect(md).toContain('| bug | 2 |');
    expect(md).toContain('| enhancement | 1 |');
    expect(md).toMatch(/#99/);
    expect(md).toContain('sample title');
  });

  it('renders workplan TBD totals per feature', () => {
    const md = formatMarkdown(fixtureReport());
    expect(md).toContain('Total: **3**');
    expect(md).toContain('| hygiene | 1.0 | 1 | 1 | 0 | 1 | 3 |');
  });

  it('renders parked branches with ahead/behind', () => {
    const md = formatMarkdown(fixtureReport());
    expect(md).toContain('Parked (threshold: 30 days): **1**');
    expect(md).toContain('feature/old-stuff');
    expect(md).toContain('| feature/old-stuff | 5 | 12 |');
    // Other-branches section listed separately.
    expect(md).toContain('Other branches: **1**');
    expect(md).toContain('feature/active');
  });

  it('renders a (skipped) marker for null sections so absence is obvious', () => {
    const md = formatMarkdown(
      fixtureReport({ github_issues: null, parked_branches: null }),
    );
    // Section headers stay so the reader can see "this section was skipped"
    // rather than having to remember three sections existed in the first
    // place. The "(skipped via --no-X)" marker is the discriminator.
    expect(md).toContain('## GitHub issues');
    expect(md).toContain('(skipped via --no-gh)');
    expect(md).toContain('## Workplan TBDs');
    expect(md).toContain('## Parked branches');
    expect(md).toContain('(skipped via --no-branches)');
    // The skipped sections must not carry their normal content tables.
    expect(md).not.toContain('Total open: **');
    expect(md).not.toContain('Parked (threshold:');
  });

  it('renders "no findings" lines when a section has zero items', () => {
    const empty = fixtureReport({
      github_issues: {
        total_open: 0,
        by_label: {},
        unlabeled: { count: 0, sample: [] },
        stale: { threshold_days: 30, count: 0, sample: [] },
        stale_since_last_comment: { threshold_days: 7, count: 0, sample: [] },
      },
      workplan_tbds: { total: 0, features: [] },
      parked_branches: {
        parked_threshold_days: 30,
        parked: [],
        other_branches: [],
      },
    });
    const md = formatMarkdown(empty);
    expect(md).toContain('Total open: **0**');
    expect(md).toContain('Total: **0**');
    expect(md).toContain('Parked (threshold: 30 days): **0**');
    expect(md).toContain('Other branches: **0**');
  });
});

describe('formatJson', () => {
  it('emits a parseable JSON object preserving snake_case keys', () => {
    const json = formatJson(fixtureReport());
    const parsed = JSON.parse(json);
    expect(parsed.generated_at).toBe('2026-05-28T12:00:00.000Z');
    expect(parsed.github_issues.total_open).toBe(5);
    expect(parsed.github_issues.stale.threshold_days).toBe(30);
    expect(parsed.workplan_tbds.features[0].counts.out_of_scope).toBe(1);
    expect(parsed.parked_branches.parked[0].refname).toBe('feature/old-stuff');
  });

  it('preserves null entries for skipped sections', () => {
    const json = formatJson(
      fixtureReport({ github_issues: null, parked_branches: null }),
    );
    const parsed = JSON.parse(json);
    expect(parsed.github_issues).toBeNull();
    expect(parsed.parked_branches).toBeNull();
    expect(parsed.workplan_tbds).not.toBeNull();
  });
});
