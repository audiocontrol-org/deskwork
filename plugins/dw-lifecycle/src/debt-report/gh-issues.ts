import type { GhIssuesReport, IssueSample, RunGh } from './types.js';

export interface ScanGhIssuesArgs {
  readonly repo: string;
  readonly staleDays: number;
  readonly commentStaleDays: number;
  readonly sampleSize: number;
  readonly limit: number;
  readonly now: Date;
  readonly runGh: RunGh;
}

interface RawIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly updatedAt: string;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
  readonly comments: ReadonlyArray<{ readonly createdAt: string }>;
}

function isRawIssue(value: unknown): value is RawIssue {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.number === 'number' &&
    typeof v.title === 'string' &&
    typeof v.url === 'string' &&
    typeof v.updatedAt === 'string' &&
    Array.isArray(v.labels) &&
    Array.isArray(v.comments)
  );
}

function parseGhOutput(raw: string): RawIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Could not parse gh issue list output as JSON: ${(err as Error).message}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `gh issue list output was not a JSON array (got ${typeof parsed}).`,
    );
  }
  const issues: RawIssue[] = [];
  for (const item of parsed) {
    if (!isRawIssue(item)) {
      throw new Error(
        `gh issue list output contained an item missing expected fields: ${JSON.stringify(item).slice(0, 200)}`,
      );
    }
    issues.push(item);
  }
  return issues;
}

// Translates gh's camelCase `updatedAt` to our snake_case `updated_at` at the
// parse boundary — mirrors how parked-branches.ts translates git's
// `committerdate` to `last_commit_date`. Keeping the rename here means the
// rest of the pipeline + JSON output stays snake_case end-to-end.
function toSample(issue: RawIssue): IssueSample {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    updated_at: issue.updatedAt,
  };
}

function daysBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 86400_000;
}

function latestCommentDate(issue: RawIssue): Date | null {
  if (issue.comments.length === 0) return null;
  let latest = new Date(0);
  for (const c of issue.comments) {
    const d = new Date(c.createdAt);
    if (d.getTime() > latest.getTime()) latest = d;
  }
  return latest;
}

export function scanGhIssues(args: ScanGhIssuesArgs): GhIssuesReport {
  const { repo, staleDays, commentStaleDays, sampleSize, limit, now, runGh } = args;

  const ghArgs: string[] = [
    'issue',
    'list',
    '--state',
    'open',
    '--repo',
    repo,
    '--limit',
    String(limit),
    '--json',
    'number,title,url,updatedAt,labels,comments',
  ];
  const raw = runGh(ghArgs);
  const issues = parseGhOutput(raw);

  const byLabel: Record<string, number> = {};
  const unlabeled: RawIssue[] = [];
  const stale: RawIssue[] = [];
  const staleSinceComment: RawIssue[] = [];

  for (const issue of issues) {
    if (issue.labels.length === 0) {
      unlabeled.push(issue);
    } else {
      for (const label of issue.labels) {
        byLabel[label.name] = (byLabel[label.name] ?? 0) + 1;
      }
    }

    const updatedAt = new Date(issue.updatedAt);
    if (daysBetween(now, updatedAt) > staleDays) {
      stale.push(issue);
    }

    // Stale-since-last-comment: among issues opened > commentStaleDays ago,
    // surface those whose most-recent comment (or, in the no-comment case,
    // whose updatedAt) is also older than the threshold. The "opened > N
    // days ago" guard uses updatedAt as a proxy when no created field is
    // requested — gh's updatedAt is monotonically non-decreasing from the
    // creation date so issues with no events have updatedAt == createdAt.
    if (daysBetween(now, updatedAt) <= commentStaleDays) {
      // Recently active — no need to flag.
    } else {
      const latestComment = latestCommentDate(issue);
      const reference = latestComment ?? updatedAt;
      if (daysBetween(now, reference) > commentStaleDays) {
        staleSinceComment.push(issue);
      }
    }
  }

  // Stable oldest-first ordering for samples so the report is deterministic.
  const oldestFirst = (a: RawIssue, b: RawIssue): number =>
    new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();

  return {
    total_open: issues.length,
    by_label: byLabel,
    unlabeled: {
      count: unlabeled.length,
      sample: unlabeled.slice().sort(oldestFirst).slice(0, sampleSize).map(toSample),
    },
    stale: {
      threshold_days: staleDays,
      count: stale.length,
      sample: stale.slice().sort(oldestFirst).slice(0, sampleSize).map(toSample),
    },
    stale_since_last_comment: {
      threshold_days: commentStaleDays,
      count: staleSinceComment.length,
      sample: staleSinceComment.slice().sort(oldestFirst).slice(0, sampleSize).map(toSample),
    },
  };
}
