import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { propose } from '../triage-issues/propose.js';

interface RawIssue {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  labels: Array<{ name: string }>;
  comments: Array<{ createdAt: string }>;
}

function iso(daysAgo: number, now: Date): string {
  return new Date(now.getTime() - daysAgo * 86400_000).toISOString();
}

function makeStub(payload: readonly RawIssue[]) {
  let lastArgs: readonly string[] | null = null;
  const runGh = (args: readonly string[]): string => {
    lastArgs = args;
    return JSON.stringify(payload);
  };
  return { runGh, getLast: () => lastArgs };
}

describe('propose', () => {
  const now = new Date('2026-05-28T12:00:00.000Z');
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'propose-'));
  });

  it('fetches issues for the bucket and writes a proposal JSON file', () => {
    const issues: RawIssue[] = [
      {
        number: 101,
        title: 'Stale issue',
        url: 'https://github.com/foo/bar/issues/101',
        createdAt: iso(45, now),
        updatedAt: iso(35, now),
        body: 'Hello world.',
        labels: [{ name: 'bug' }],
        comments: [{ createdAt: iso(20, now) }],
      },
    ];
    const { runGh, getLast } = makeStub(issues);
    const result = propose({
      bucket: 'stale-30d',
      limit: 10,
      repo: 'foo/bar',
      projectRoot,
      now,
      runGh,
    });

    // gh was called with the resolved bucket query.
    const args = getLast();
    expect(args).toBeTruthy();
    if (!args) throw new Error('expected args');
    expect(args).toContain('--search');
    expect(args).toContain('state:open updated:<2026-04-28');
    expect(args).toContain('--repo');
    expect(args).toContain('foo/bar');

    // Proposal file shape.
    expect(result.proposalFile.bucket).toBe('stale-30d');
    expect(result.proposalFile.query).toBe('state:open updated:<2026-04-28');
    expect(result.proposalFile.repo).toBe('foo/bar');
    expect(result.proposalFile.approval).toBeNull();
    expect(result.proposalFile.items).toHaveLength(1);
    const item = result.proposalFile.items[0];
    if (!item) throw new Error('expected item');
    expect(item.number).toBe(101);
    expect(item.age_days).toBe(45);
    expect(item.comment_age_days).toBe(20);
    expect(item.labels).toEqual(['bug']);
    expect(item.disposition).toBeNull();
    expect(item.disposition_fields).toBeNull();
    expect(item.applied).toBeNull();

    // The file was actually written.
    expect(existsSync(result.outputPath)).toBe(true);
    const round = JSON.parse(readFileSync(result.outputPath, 'utf8'));
    expect(round.items[0].number).toBe(101);
  });

  it('emits a markdown table with one row per issue plus FILL IN columns', () => {
    const issues: RawIssue[] = [
      {
        number: 5,
        title: 'A | with pipe',
        url: 'u',
        createdAt: iso(30, now),
        updatedAt: iso(30, now),
        body: 'short body',
        labels: [],
        comments: [],
      },
    ];
    const { runGh } = makeStub(issues);
    const result = propose({
      bucket: 'unlabeled',
      limit: 5,
      repo: 'foo/bar',
      projectRoot,
      now,
      runGh,
    });
    expect(result.markdownTable).toMatch(/\| # \| Number \|/);
    expect(result.markdownTable).toMatch(/Proposed disposition \(FILL IN\)/);
    expect(result.markdownTable).toMatch(/Rationale \(FILL IN\)/);
    expect(result.markdownTable).toMatch(/_\(fill in\)_/);
    expect(result.markdownTable).toMatch(/#5/);
    // Pipe in title is escaped.
    expect(result.markdownTable).toMatch(/A \\\| with pipe/);
    // Empty labels rendered as _(none)_.
    expect(result.markdownTable).toMatch(/_\(none\)_/);
  });

  it('truncates long bodies to a 240-char excerpt with ellipsis', () => {
    const longBody = 'a'.repeat(500);
    const issues: RawIssue[] = [
      {
        number: 1,
        title: 't',
        url: 'u',
        createdAt: iso(1, now),
        updatedAt: iso(1, now),
        body: longBody,
        labels: [],
        comments: [],
      },
    ];
    const { runGh } = makeStub(issues);
    const result = propose({
      bucket: 'unlabeled',
      limit: 5,
      repo: 'foo/bar',
      projectRoot,
      now,
      runGh,
    });
    const item = result.proposalFile.items[0];
    if (!item) throw new Error('expected item');
    expect(item.body_excerpt.length).toBeLessThanOrEqual(240);
    expect(item.body_excerpt.endsWith('…')).toBe(true);
  });

  it('uses the explicit outputPath override when supplied', () => {
    const { runGh } = makeStub([]);
    const outputPath = join(projectRoot, 'custom', 'proposals.json');
    const result = propose({
      bucket: 'unlabeled',
      limit: 5,
      repo: 'foo/bar',
      projectRoot,
      now,
      runGh,
      outputPath,
    });
    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('throws when the bucket is unknown', () => {
    const { runGh } = makeStub([]);
    expect(() =>
      propose({
        bucket: 'banana',
        limit: 5,
        repo: 'foo/bar',
        projectRoot,
        now,
        runGh,
      }),
    ).toThrow(/Unknown bucket: banana/);
  });

  it('throws when gh output is not parseable JSON', () => {
    const runGh = (): string => 'not-json';
    expect(() =>
      propose({
        bucket: 'unlabeled',
        limit: 5,
        repo: 'foo/bar',
        projectRoot,
        now,
        runGh,
      }),
    ).toThrow(/Could not parse gh issue list output/);
  });

  it('records null comment_age_days for issues with no comments', () => {
    const issues: RawIssue[] = [
      {
        number: 7,
        title: 'no-comments',
        url: 'u',
        createdAt: iso(10, now),
        updatedAt: iso(10, now),
        body: '',
        labels: [],
        comments: [],
      },
    ];
    const { runGh } = makeStub(issues);
    const result = propose({
      bucket: 'unlabeled',
      limit: 5,
      repo: 'foo/bar',
      projectRoot,
      now,
      runGh,
    });
    const item = result.proposalFile.items[0];
    if (!item) throw new Error('expected item');
    expect(item.comment_age_days).toBeNull();
  });
});
