import { describe, it, expect } from 'vitest';
import {
  CommitScanError,
  extractReferencesFromCommit,
  groupReferencesByIssue,
  parseLogOutput,
  scanCommits,
} from '../close-shipped/commit-scanner.js';
import type { RunGit, ScannedCommit } from '../close-shipped/types.js';

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

function makeLogOutput(
  commits: ReadonlyArray<{
    readonly sha: string;
    readonly subject: string;
    readonly body: string;
  }>,
): string {
  return commits
    .map(
      (c) =>
        `${c.sha}${FIELD_SEPARATOR}${c.subject}${FIELD_SEPARATOR}${c.body}${RECORD_SEPARATOR}`,
    )
    .join('');
}

describe('parseLogOutput', () => {
  it('parses a single commit record', () => {
    const raw = makeLogOutput([
      {
        sha: 'abc1234567890abcdef',
        subject: 'feat: subject',
        body: 'body line one\nbody line two',
      },
    ]);
    const commits = parseLogOutput(raw);
    expect(commits.length).toBe(1);
    const first = commits[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.sha).toBe('abc1234');
    expect(first.subject).toBe('feat: subject');
    expect(first.body).toBe('body line one\nbody line two');
  });

  it('parses multiple commits', () => {
    const raw = makeLogOutput([
      { sha: 'aaaaaaa0000000000000', subject: 's1', body: 'b1' },
      { sha: 'bbbbbbb0000000000000', subject: 's2', body: 'b2' },
      { sha: 'ccccccc0000000000000', subject: 's3', body: 'b3' },
    ]);
    const commits = parseLogOutput(raw);
    expect(commits.length).toBe(3);
    expect(commits.map((c) => c.subject)).toEqual(['s1', 's2', 's3']);
  });

  it('returns empty list on empty input', () => {
    expect(parseLogOutput('')).toEqual([]);
  });

  it('skips records with too few fields', () => {
    const raw = `abcdefg${FIELD_SEPARATOR}only-subject${RECORD_SEPARATOR}`;
    expect(parseLogOutput(raw)).toEqual([]);
  });

  it('preserves bodies that contain blank lines', () => {
    const raw = makeLogOutput([
      {
        sha: 'aaaaaaa0000000000000',
        subject: 'subject',
        body: 'line one\n\nline two after blank',
      },
    ]);
    const parsed = parseLogOutput(raw);
    expect(parsed.length).toBe(1);
    const first = parsed[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.body).toBe('line one\n\nline two after blank');
  });
});

describe('scanCommits', () => {
  it('passes the correct args to git and parses the output', () => {
    const calls: string[][] = [];
    const runGit: RunGit = (args) => {
      calls.push([...args]);
      return makeLogOutput([
        { sha: 'abc1234zzzzzzzzzzzzz', subject: 'feat: x', body: '' },
      ]);
    };
    const commits = scanCommits({
      fromTag: 'v1.0.0',
      toTag: 'v1.1.0',
      runGit,
    });
    expect(commits.length).toBe(1);
    expect(calls.length).toBe(1);
    const first = calls[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first[0]).toBe('log');
    expect(first[1]).toBe('v1.0.0..v1.1.0');
    expect(first[2]).toMatch(/^--format=/);
  });

  it('wraps git failures in CommitScanError', () => {
    const runGit: RunGit = () => {
      throw new Error('fatal: bad revision');
    };
    expect(() =>
      scanCommits({ fromTag: 'vX', toTag: 'vY', runGit }),
    ).toThrow(CommitScanError);
  });
});

describe('extractReferencesFromCommit', () => {
  function mkCommit(subject: string, body = ''): ScannedCommit {
    return { sha: 'aaaaaaa', subject, body };
  }

  it('extracts plain #NNN references', () => {
    const refs = extractReferencesFromCommit(mkCommit('see #42'));
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(42);
    expect(first.verb).toBe('plain');
  });

  it('extracts Closes #NNN as closes (case-insensitive)', () => {
    const refs = extractReferencesFromCommit(mkCommit('fix: thing\n\nCloses #123'));
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(123);
    expect(first.verb).toBe('closes');

    const lower = extractReferencesFromCommit(mkCommit('fix: thing\n\ncloses #99'));
    const lowerFirst = lower[0];
    expect(lowerFirst).toBeDefined();
    if (lowerFirst === undefined) return;
    expect(lowerFirst.verb).toBe('closes');
  });

  it('extracts Fixes/Fixed/Resolves/Resolved variants', () => {
    expect(extractReferencesFromCommit(mkCommit('Fixes #10'))[0]?.verb).toBe(
      'fixes',
    );
    expect(extractReferencesFromCommit(mkCommit('Fixed #11'))[0]?.verb).toBe(
      'fixes',
    );
    expect(extractReferencesFromCommit(mkCommit('Resolves #12'))[0]?.verb).toBe(
      'resolves',
    );
    expect(extractReferencesFromCommit(mkCommit('Resolved #13'))[0]?.verb).toBe(
      'resolves',
    );
  });

  it('extracts Refs as refs verb', () => {
    const refs = extractReferencesFromCommit(mkCommit('docs: note\n\nRefs #88'));
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(88);
    expect(first.verb).toBe('refs');
  });

  it('extracts (#NNN) at end of subject as parens verb', () => {
    const refs = extractReferencesFromCommit(
      mkCommit('feat(area): subject (#7)'),
    );
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(7);
    expect(first.verb).toBe('parens');
  });

  it('picks the strongest verb when the same issue appears multiple times', () => {
    // Plain reference in subject + Closes in body -> closes wins.
    const commit = mkCommit('mention #50 in passing', 'Closes #50');
    const refs = extractReferencesFromCommit(commit);
    expect(refs.length).toBe(1);
    const first = refs[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(50);
    expect(first.verb).toBe('closes');
  });

  it('skips numbers embedded in URLs', () => {
    const commit = mkCommit(
      'merge PR https://github.com/owner/repo/pull/9999',
      'no other refs here',
    );
    const refs = extractReferencesFromCommit(commit);
    expect(refs.length).toBe(0);
  });

  it('extracts real refs when the URL also appears', () => {
    const commit = mkCommit(
      'feat: subject (#42)',
      'Closes #43.\n\nSee https://github.com/owner/repo/pull/100 for context.',
    );
    const refs = extractReferencesFromCommit(commit);
    const issues = refs.map((r) => r.issue).sort((a, b) => a - b);
    expect(issues).toEqual([42, 43]);
  });

  it('handles multiple distinct issues in one commit', () => {
    const commit = mkCommit('chore: subject', 'Closes #10, #11, #12.');
    const refs = extractReferencesFromCommit(commit);
    const issues = refs.map((r) => r.issue).sort((a, b) => a - b);
    expect(issues).toEqual([10, 11, 12]);
  });

  it('ignores non-digit "#word" shapes', () => {
    const refs = extractReferencesFromCommit(mkCommit('docs: header #foo bar'));
    expect(refs.length).toBe(0);
  });
});

describe('groupReferencesByIssue', () => {
  it('groups multiple commits referencing the same issue', () => {
    const c1: ScannedCommit = { sha: 'aaa1', subject: 's1', body: '' };
    const c2: ScannedCommit = { sha: 'bbb2', subject: 's2', body: '' };
    const refs = [
      { issue: 5, sha: 'aaa1', subject: 's1', verb: 'closes' as const },
      { issue: 5, sha: 'bbb2', subject: 's2', verb: 'fixes' as const },
      { issue: 7, sha: 'aaa1', subject: 's1', verb: 'plain' as const },
    ];
    const groups = groupReferencesByIssue(refs, [c1, c2]);
    expect(groups.length).toBe(2);
    const g5 = groups.find((g) => g.issue === 5);
    expect(g5).toBeDefined();
    if (g5 === undefined) return;
    expect(g5.commits.length).toBe(2);
    expect(g5.verbs.includes('closes')).toBe(true);
    expect(g5.verbs.includes('fixes')).toBe(true);
    expect(g5.primarySubject).toBe('s1');
  });

  it('sorts groups by issue number ascending', () => {
    const c1: ScannedCommit = { sha: 'a', subject: 's', body: '' };
    const refs = [
      { issue: 100, sha: 'a', subject: 's', verb: 'plain' as const },
      { issue: 1, sha: 'a', subject: 's', verb: 'plain' as const },
      { issue: 50, sha: 'a', subject: 's', verb: 'plain' as const },
    ];
    const groups = groupReferencesByIssue(refs, [c1]);
    expect(groups.map((g) => g.issue)).toEqual([1, 50, 100]);
  });
});
