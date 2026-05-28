import { describe, it, expect } from 'vitest';
import { scanGhIssues } from '../debt-report/gh-issues.js';

interface RawIssue {
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  labels: Array<{ name: string }>;
  comments: Array<{ createdAt: string }>;
}

function makeStub(payload: readonly RawIssue[]) {
  let lastArgs: readonly string[] | null = null;
  const runGh = (args: readonly string[]): string => {
    lastArgs = args;
    return JSON.stringify(payload);
  };
  const getLast = () => lastArgs;
  return { runGh, getLast };
}

function iso(daysAgo: number, now: Date): string {
  return new Date(now.getTime() - daysAgo * 86400_000).toISOString();
}

describe('scanGhIssues', () => {
  const now = new Date('2026-05-28T12:00:00.000Z');

  it('returns zeroed report when no issues', () => {
    const { runGh } = makeStub([]);
    const report = scanGhIssues({
      repo: 'foo/bar',
      staleDays: 30,
      commentStaleDays: 7,
      sampleSize: 5,
      limit: 1000,
      now,
      runGh,
    });
    expect(report.total_open).toBe(0);
    expect(report.by_label).toEqual({});
    expect(report.unlabeled.count).toBe(0);
    expect(report.stale.count).toBe(0);
    expect(report.stale_since_last_comment.count).toBe(0);
  });

  it('counts total_open and buckets by label', () => {
    const issues: RawIssue[] = [
      {
        number: 1,
        title: 'a',
        url: 'u1',
        updatedAt: iso(1, now),
        labels: [{ name: 'bug' }, { name: 'enhancement' }],
        comments: [],
      },
      {
        number: 2,
        title: 'b',
        url: 'u2',
        updatedAt: iso(2, now),
        labels: [{ name: 'bug' }],
        comments: [],
      },
      {
        number: 3,
        title: 'c',
        url: 'u3',
        updatedAt: iso(3, now),
        labels: [],
        comments: [],
      },
    ];
    const { runGh, getLast } = makeStub(issues);
    const report = scanGhIssues({
      repo: 'foo/bar',
      staleDays: 30,
      commentStaleDays: 7,
      sampleSize: 5,
      limit: 1000,
      now,
      runGh,
    });
    expect(report.total_open).toBe(3);
    expect(report.by_label).toEqual({ bug: 2, enhancement: 1 });
    expect(report.unlabeled.count).toBe(1);
    expect(report.unlabeled.sample[0]?.number).toBe(3);

    // The stub was invoked with the documented gh issue list call shape.
    const args = getLast();
    expect(args).toBeTruthy();
    if (!args) throw new Error('expected args');
    expect(args.slice(0, 4)).toEqual(['issue', 'list', '--state', 'open']);
    expect(args).toContain('--repo');
    expect(args).toContain('foo/bar');
    expect(args).toContain('--json');
  });

  it('buckets stale issues by updatedAt threshold', () => {
    const issues: RawIssue[] = [
      {
        number: 10,
        title: 'fresh',
        url: 'u',
        updatedAt: iso(5, now),
        labels: [],
        comments: [],
      },
      {
        number: 11,
        title: 'older',
        url: 'u',
        updatedAt: iso(45, now),
        labels: [],
        comments: [],
      },
      {
        number: 12,
        title: 'oldest',
        url: 'u',
        updatedAt: iso(120, now),
        labels: [],
        comments: [],
      },
    ];
    const { runGh } = makeStub(issues);
    const report = scanGhIssues({
      repo: 'foo/bar',
      staleDays: 30,
      commentStaleDays: 7,
      sampleSize: 5,
      limit: 1000,
      now,
      runGh,
    });
    expect(report.stale.threshold_days).toBe(30);
    expect(report.stale.count).toBe(2);
    // Oldest-first ordering in the sample.
    expect(report.stale.sample.map((s) => s.number)).toEqual([12, 11]);
  });

  it('buckets stale_since_last_comment using latest comment createdAt', () => {
    const issues: RawIssue[] = [
      {
        number: 20,
        title: 'recently-commented',
        url: 'u',
        updatedAt: iso(60, now), // would be stale by updatedAt …
        labels: [],
        comments: [{ createdAt: iso(2, now) }], // … but comment is fresh → excluded
      },
      {
        number: 21,
        title: 'stale-comment',
        url: 'u',
        updatedAt: iso(60, now),
        labels: [],
        comments: [{ createdAt: iso(45, now) }],
      },
      {
        number: 22,
        title: 'no-comment-old-issue',
        url: 'u',
        updatedAt: iso(60, now),
        labels: [],
        comments: [],
      },
      {
        number: 23,
        title: 'no-comment-new-issue',
        url: 'u',
        updatedAt: iso(3, now), // opened < 7d ago → excluded
        labels: [],
        comments: [],
      },
    ];
    const { runGh } = makeStub(issues);
    const report = scanGhIssues({
      repo: 'foo/bar',
      staleDays: 30,
      commentStaleDays: 7,
      sampleSize: 5,
      limit: 1000,
      now,
      runGh,
    });
    expect(report.stale_since_last_comment.threshold_days).toBe(7);
    // 21 (stale comment), 22 (no comment + old issue) — but NOT 20 (fresh comment) or 23 (recent open).
    const nums = report.stale_since_last_comment.sample.map((s) => s.number).sort();
    expect(nums).toEqual([21, 22]);
    expect(report.stale_since_last_comment.count).toBe(2);
  });

  it('limits sample sizes to sampleSize', () => {
    const issues: RawIssue[] = Array.from({ length: 20 }).map((_, i) => ({
      number: 100 + i,
      title: `t${i}`,
      url: 'u',
      updatedAt: iso(45 + i, now), // all stale
      labels: [],
      comments: [],
    }));
    const { runGh } = makeStub(issues);
    const report = scanGhIssues({
      repo: 'foo/bar',
      staleDays: 30,
      commentStaleDays: 7,
      sampleSize: 5,
      limit: 1000,
      now,
      runGh,
    });
    expect(report.stale.count).toBe(20);
    expect(report.stale.sample).toHaveLength(5);
    expect(report.unlabeled.sample).toHaveLength(5);
  });

  it('throws when gh stub returns non-JSON', () => {
    const runGh = () => 'not-json-at-all';
    expect(() =>
      scanGhIssues({
        repo: 'foo/bar',
        staleDays: 30,
        commentStaleDays: 7,
        sampleSize: 5,
        limit: 1000,
        now,
        runGh,
      }),
    ).toThrow();
  });
});
