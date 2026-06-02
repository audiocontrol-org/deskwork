import { describe, it, expect } from 'vitest';
import {
  ArchiveBranchPreflightError,
  buildTagName,
  runPreflight,
} from '../archive-branch/preflight.js';

interface GitStubCall {
  readonly match: (args: readonly string[]) => boolean;
  readonly respond: (args: readonly string[]) => string;
}

function makeStub(scripts: readonly GitStubCall[]) {
  const calls: Array<readonly string[]> = [];
  const runGit = (args: readonly string[]): string => {
    calls.push(args);
    for (const s of scripts) {
      if (s.match(args)) return s.respond(args);
    }
    throw new Error(`No stub matched git args: ${args.join(' ')}`);
  };
  return { runGit, calls };
}

describe('buildTagName', () => {
  it('produces archived/<branch>-<YYYY-MM-DD> when branch has no slashes', () => {
    const tag = buildTagName('foo', new Date('2026-05-28T12:00:00.000Z'));
    expect(tag).toBe('archived/foo-2026-05-28');
  });

  it('replaces slashes in the branch name with dashes', () => {
    const tag = buildTagName(
      'feature/studio-bridge',
      new Date('2026-05-28T12:00:00.000Z'),
    );
    expect(tag).toBe('archived/feature-studio-bridge-2026-05-28');
  });

  it('replaces every slash, not just the first', () => {
    const tag = buildTagName(
      'feature/sub/branch',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(tag).toBe('archived/feature-sub-branch-2026-01-01');
  });

  it('uses UTC components for the date, regardless of local timezone', () => {
    // 2026-12-31T23:59:00Z is still 2026-12-31 in UTC even if local TZ
    // ahead would tick to 2027-01-01.
    const tag = buildTagName('x', new Date('2026-12-31T23:59:00.000Z'));
    expect(tag).toBe('archived/x-2026-12-31');
  });
});

describe('runPreflight', () => {
  it('throws unknown-branch when rev-parse refs/heads/<branch> fails', () => {
    const { runGit } = makeStub([
      {
        match: (a) => a[0] === 'rev-parse' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => {
          throw new Error('fatal: bad revision');
        },
      },
    ]);
    expect(() =>
      runPreflight({
        branch: 'nope',
        tagName: 'archived/nope-2026-05-28',
        force: false,
        compareRef: 'origin/main',
        runGit,
      }),
    ).toThrow(ArchiveBranchPreflightError);
    try {
      runPreflight({
        branch: 'nope',
        tagName: 'archived/nope-2026-05-28',
        force: false,
        compareRef: 'origin/main',
        runGit,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ArchiveBranchPreflightError);
      if (err instanceof ArchiveBranchPreflightError) {
        expect(err.kind).toBe('unknown-branch');
        expect(err.message).toContain('nope');
      }
    }
  });

  it('throws branch-checked-out when a worktree references the branch', () => {
    const worktreeOutput = [
      'worktree /Users/op/main',
      'HEAD abc',
      'branch refs/heads/main',
      '',
      'worktree /Users/op/feat',
      'HEAD def',
      'branch refs/heads/feature/parked',
      '',
    ].join('\n');
    const { runGit } = makeStub([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => worktreeOutput,
      },
    ]);
    try {
      runPreflight({
        branch: 'feature/parked',
        tagName: 'archived/feature-parked-2026-05-28',
        force: false,
        compareRef: 'origin/main',
        runGit,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchiveBranchPreflightError);
      if (err instanceof ArchiveBranchPreflightError) {
        expect(err.kind).toBe('branch-checked-out');
        expect(err.message).toContain('/Users/op/feat');
        expect(err.message).toContain('git worktree remove');
      }
    }
  });

  it('passes tag-doesnotexist when runGit returns empty on failure (swallowing variant)', () => {
    // Regression for the Phase 11 dogfood failure: `dismantle-worktrees
    // apply` calls archive-branch with `runGitStdout` from
    // subcommands/lib/process-probes.ts. That runner SWALLOWS non-zero
    // exits and returns the empty string instead of throwing. The
    // pre-fix preflight assumed an exception-on-failure runGit and
    // false-failed every "tag does not exist" probe (rev-parse returns
    // empty → no throw → `exists = true` → tag-exists thrown). The fix
    // checks the returned value too. This test exercises the swallow-
    // and-return-empty contract end-to-end.
    const { runGit } = makeStub([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
        // Swallowing runGit: returns empty string instead of throwing
        // when git rev-parse exits non-zero on a missing tag.
        respond: () => '',
      },
      {
        match: (a) => a[0] === 'rev-parse' && a.length === 2,
        respond: () => 'shashasha\n',
      },
      {
        match: (a) => a[0] === 'log',
        respond: () => 'subject\n',
      },
      {
        match: (a) => a[0] === 'rev-list' && a[1] === '--count',
        respond: () => '5\n',
      },
    ]);
    expect(() =>
      runPreflight({
        branch: 'feature/parked',
        tagName: 'archived/feature-parked-2026-05-29',
        force: false,
        compareRef: 'origin/main',
        runGit,
      }),
    ).not.toThrow();
  });

  it('throws tag-exists when the candidate tag already exists', () => {
    const { runGit } = makeStub([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
        respond: () => 'tagsha\n',
      },
    ]);
    try {
      runPreflight({
        branch: 'feature/parked',
        tagName: 'archived/feature-parked-2026-05-28',
        force: false,
        compareRef: 'origin/main',
        runGit,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchiveBranchPreflightError);
      if (err instanceof ArchiveBranchPreflightError) {
        expect(err.kind).toBe('tag-exists');
        expect(err.message).toContain('archived/feature-parked-2026-05-28');
      }
    }
  });

  it('throws no-novel-commits when branch has zero commits ahead of origin/main', () => {
    const { runGit } = makeStub([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
        respond: () => {
          throw new Error('fatal: ref not found');
        },
      },
      {
        match: (a) => a[0] === 'rev-parse' && a.length === 2,
        respond: () => 'shashasha\n',
      },
      {
        match: (a) => a[0] === 'log',
        respond: () => 'subject\n',
      },
      {
        match: (a) => a[0] === 'rev-list' && a[1] === '--count',
        respond: () => '0\n',
      },
    ]);
    try {
      runPreflight({
        branch: 'feature/empty',
        tagName: 'archived/feature-empty-2026-05-28',
        force: false,
        compareRef: 'origin/main',
        runGit,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchiveBranchPreflightError);
      if (err instanceof ArchiveBranchPreflightError) {
        expect(err.kind).toBe('no-novel-commits');
        expect(err.message).toContain('--force');
      }
    }
  });

  it('skips the novel-commits gate when --force is passed', () => {
    const { runGit, calls } = makeStub([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
        respond: () => {
          throw new Error('fatal: ref not found');
        },
      },
      {
        match: (a) => a[0] === 'rev-parse' && a.length === 2,
        respond: () => 'shashasha\n',
      },
      {
        match: (a) => a[0] === 'log',
        respond: () => 'subject of last commit\n',
      },
    ]);
    const meta = runPreflight({
      branch: 'feature/x',
      tagName: 'archived/feature-x-2026-05-28',
      force: true,
      compareRef: 'origin/main',
      runGit,
    });
    expect(meta.lastCommitSha).toBe('shashasha');
    expect(meta.lastCommitSubject).toBe('subject of last commit');
    // rev-list should NOT have been called when --force is set.
    const sawRevList = calls.some(
      (a) => a[0] === 'rev-list' && a[1] === '--count',
    );
    expect(sawRevList).toBe(false);
  });

  it('returns last-commit sha + subject when every gate passes', () => {
    const { runGit } = makeStub([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
        respond: () => {
          throw new Error('fatal: ref not found');
        },
      },
      {
        match: (a) => a[0] === 'rev-parse' && a.length === 2,
        respond: () => 'deadbeef\n',
      },
      {
        match: (a) => a[0] === 'log',
        respond: () => 'last commit subject line\n',
      },
      {
        match: (a) => a[0] === 'rev-list' && a[1] === '--count',
        respond: () => '7\n',
      },
    ]);
    const meta = runPreflight({
      branch: 'feature/parked',
      tagName: 'archived/feature-parked-2026-05-28',
      force: false,
      compareRef: 'origin/main',
      runGit,
    });
    expect(meta.lastCommitSha).toBe('deadbeef');
    expect(meta.lastCommitSubject).toBe('last commit subject line');
  });

  it('honors a non-default compareRef (e.g. upstream/master)', () => {
    // Asserts that the rev-list invocation uses the operator-supplied
    // compare-ref rather than hardcoded origin/main. The stub records
    // which args were called so we can verify the actual ref used.
    const { runGit, calls } = makeStub([
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
        respond: () => {
          throw new Error('fatal: ref not found');
        },
      },
      {
        match: (a) => a[0] === 'rev-parse' && a.length === 2,
        respond: () => 'deadbeef\n',
      },
      {
        match: (a) => a[0] === 'log',
        respond: () => 'subject\n',
      },
      {
        match: (a) => a[0] === 'rev-list' && a[1] === '--count',
        respond: () => '4\n',
      },
    ]);
    runPreflight({
      branch: 'feature/parked',
      tagName: 'archived/feature-parked-2026-05-28',
      force: false,
      compareRef: 'upstream/master',
      runGit,
    });
    const revList = calls.find(
      (a) => a[0] === 'rev-list' && a[1] === '--count',
    );
    expect(revList).toBeDefined();
    if (revList) {
      expect(revList[2]).toBe('feature/parked');
      expect(revList[3]).toBe('^upstream/master');
    }
  });

  it('surfaces the configured compareRef in the no-novel-commits error message', () => {
    const { runGit } = makeStub([
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
        respond: () => {
          throw new Error('fatal: ref not found');
        },
      },
      {
        match: (a) => a[0] === 'rev-parse' && a.length === 2,
        respond: () => 'aaa\n',
      },
      {
        match: (a) => a[0] === 'log',
        respond: () => 'subj\n',
      },
      {
        match: (a) => a[0] === 'rev-list' && a[1] === '--count',
        respond: () => '0\n',
      },
    ]);
    try {
      runPreflight({
        branch: 'feature/merged',
        tagName: 'archived/feature-merged-2026-05-28',
        force: false,
        compareRef: 'upstream/trunk',
        runGit,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchiveBranchPreflightError);
      if (err instanceof ArchiveBranchPreflightError) {
        expect(err.kind).toBe('no-novel-commits');
        expect(err.message).toContain('upstream/trunk');
      }
    }
  });

  it('parses worktree output with no trailing blank (single-block, older git)', () => {
    // Older git versions may emit porcelain output without a trailing
    // blank line after the last block. The parser must still find the
    // branch reference inside that single block.
    const worktreeOutput = [
      'worktree /Users/op/feat',
      'HEAD def',
      'branch refs/heads/feature/parked',
    ].join('\n');
    const { runGit } = makeStub([
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'def\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => worktreeOutput,
      },
    ]);
    try {
      runPreflight({
        branch: 'feature/parked',
        tagName: 'archived/feature-parked-2026-05-28',
        force: false,
        compareRef: 'origin/main',
        runGit,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchiveBranchPreflightError);
      if (err instanceof ArchiveBranchPreflightError) {
        expect(err.kind).toBe('branch-checked-out');
        expect(err.message).toContain('/Users/op/feat');
      }
    }
  });

  it('parses two consecutive worktree blocks separated by only one newline', () => {
    // Defensive: the split-on-^worktree anchor must still pick out the
    // second block's branch line independently of the first, even when
    // the blocks aren't separated by a blank line.
    const worktreeOutput = [
      'worktree /Users/op/main',
      'HEAD abc',
      'branch refs/heads/main',
      'worktree /Users/op/feat',
      'HEAD def',
      'branch refs/heads/feature/parked',
    ].join('\n');
    const { runGit } = makeStub([
      {
        match: (a) =>
          a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'def\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => worktreeOutput,
      },
    ]);
    try {
      runPreflight({
        branch: 'feature/parked',
        tagName: 'archived/feature-parked-2026-05-28',
        force: false,
        compareRef: 'origin/main',
        runGit,
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ArchiveBranchPreflightError);
      if (err instanceof ArchiveBranchPreflightError) {
        expect(err.kind).toBe('branch-checked-out');
        // The second block's worktree path is the one that should trip
        // the gate — not the first block's mainline path.
        expect(err.message).toContain('/Users/op/feat');
        expect(err.message).not.toContain('/Users/op/main');
      }
    }
  });
});
