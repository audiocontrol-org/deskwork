import { describe, it, expect } from 'vitest';
import { scanParkedBranches } from '../debt-report/parked-branches.js';

interface GitStubCall {
  readonly args: readonly string[];
  readonly response: string;
}

function makeGitStub(scripted: readonly GitStubCall[]) {
  let i = 0;
  const calls: Array<readonly string[]> = [];
  const runGit = (args: readonly string[]): string => {
    calls.push(args);
    const next = scripted[i++];
    if (!next) {
      throw new Error(
        `Unexpected git call beyond scripted plan: ${args.join(' ')}`,
      );
    }
    return next.response;
  };
  return { runGit, calls };
}

const now = new Date('2026-05-28T12:00:00.000Z');
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 86400_000).toISOString();

describe('scanParkedBranches', () => {
  it('returns empty when no refs exist (other than main / current)', () => {
    const scripted: GitStubCall[] = [
      // for-each-ref returns no eligible refs
      {
        args: ['for-each-ref'],
        response: '',
      },
      // rev-parse current branch
      {
        args: ['rev-parse', '--abbrev-ref', 'HEAD'],
        response: 'main\n',
      },
    ];
    const { runGit } = makeGitStub(scripted);
    const report = scanParkedBranches({
      now,
      parkedDays: 30,
      runGit,
    });
    expect(report.parked).toEqual([]);
    expect(report.other_branches).toEqual([]);
    expect(report.parked_threshold_days).toBe(30);
  });

  it('classifies branches as parked when ahead > 0 AND last commit > parkedDays old', () => {
    // for-each-ref returns three refs:
    //   feature/active   — ahead, recent
    //   feature/parked   — ahead, very old (>30d)
    //   feature/stale-nochange — behind only, ignored from "parked" since no ahead
    const refOut = [
      `feature/active|origin/main|aaaaaaaa|${daysAgo(2)}`,
      `feature/parked|origin/main|bbbbbbbb|${daysAgo(120)}`,
      `feature/no-ahead|origin/main|cccccccc|${daysAgo(200)}`,
      `main|origin/main|dddddddd|${daysAgo(1)}`,
    ].join('\n');

    const scripted: GitStubCall[] = [
      { args: ['for-each-ref'], response: refOut },
      // rev-parse current branch
      { args: ['rev-parse', '--abbrev-ref', 'HEAD'], response: 'main\n' },
      // rev-list ahead/behind feature/active
      { args: ['rev-list'], response: '3\t1\n' },
      // rev-list ahead/behind feature/parked
      { args: ['rev-list'], response: '10\t40\n' },
      // rev-list ahead/behind feature/no-ahead
      { args: ['rev-list'], response: '0\t5\n' },
    ];
    const { runGit, calls } = makeGitStub(scripted);
    const report = scanParkedBranches({
      now,
      parkedDays: 30,
      runGit,
    });

    expect(report.parked.map((b) => b.refname)).toEqual(['feature/parked']);
    expect(report.parked[0]?.ahead).toBe(10);
    expect(report.parked[0]?.behind).toBe(40);

    // active + no-ahead are "other branches" — they showed up but didn't qualify
    const others = report.other_branches.map((b) => b.refname).sort();
    expect(others).toEqual(['feature/active', 'feature/no-ahead']);

    // main was excluded.
    expect(report.parked.find((b) => b.refname === 'main')).toBeUndefined();
    expect(
      report.other_branches.find((b) => b.refname === 'main'),
    ).toBeUndefined();

    // Validate the for-each-ref invocation shape so future readers see
    // what columns we depend on.
    const fer = calls[0];
    if (!fer) throw new Error('expected for-each-ref call');
    expect(fer[0]).toBe('for-each-ref');
    expect(fer.join(' ')).toContain('refs/heads/');
  });

  it('excludes the current branch even if it would otherwise qualify as parked', () => {
    const refOut = [
      `feature/parked-current|origin/main|aaaaaaaa|${daysAgo(200)}`,
      `feature/parked-other|origin/main|bbbbbbbb|${daysAgo(200)}`,
    ].join('\n');
    const scripted: GitStubCall[] = [
      { args: ['for-each-ref'], response: refOut },
      {
        args: ['rev-parse', '--abbrev-ref', 'HEAD'],
        response: 'feature/parked-current\n',
      },
      // Only one rev-list call expected since current branch is skipped.
      { args: ['rev-list'], response: '5\t0\n' },
    ];
    const { runGit } = makeGitStub(scripted);
    const report = scanParkedBranches({
      now,
      parkedDays: 30,
      runGit,
    });
    expect(report.parked.map((b) => b.refname)).toEqual([
      'feature/parked-other',
    ]);
  });

  it('handles refs without an upstream (treats compare as origin/main)', () => {
    const refOut = `feature/no-upstream||aaaaaaaa|${daysAgo(120)}`;
    const scripted: GitStubCall[] = [
      { args: ['for-each-ref'], response: refOut },
      { args: ['rev-parse', '--abbrev-ref', 'HEAD'], response: 'main\n' },
      { args: ['rev-list'], response: '2\t9\n' },
    ];
    const { runGit, calls } = makeGitStub(scripted);
    const report = scanParkedBranches({
      now,
      parkedDays: 30,
      runGit,
    });
    expect(report.parked.map((b) => b.refname)).toEqual([
      'feature/no-upstream',
    ]);
    // rev-list should have been called with origin/main as the comparator.
    const revListCall = calls[2];
    if (!revListCall) throw new Error('expected rev-list call');
    expect(revListCall.join(' ')).toContain('origin/main');
  });
});
