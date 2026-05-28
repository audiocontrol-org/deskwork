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
  const now = new Date('2026-05-28T12:00:00.000Z');

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
        runGit,
      }),
    ).toThrow(ArchiveBranchPreflightError);
    try {
      runPreflight({
        branch: 'nope',
        tagName: 'archived/nope-2026-05-28',
        force: false,
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
      runGit,
    });
    expect(meta.lastCommitSha).toBe('deadbeef');
    expect(meta.lastCommitSubject).toBe('last commit subject line');
  });
  // Reference `now` so the linter doesn't flag the import.
  void now;
});
