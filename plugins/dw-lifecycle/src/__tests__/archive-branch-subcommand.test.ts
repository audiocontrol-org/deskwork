import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  parseArchiveBranchArgs,
  runArchiveBranch,
} from '../subcommands/archive-branch.js';
import type { RunGit } from '../debt-report/types.js';
import type { RunPush } from '../archive-branch/types.js';

describe('parseArchiveBranchArgs', () => {
  it('parses bare branch name with defaults', () => {
    const opts = parseArchiveBranchArgs(['feature/parked']);
    expect(opts.branch).toBe('feature/parked');
    expect(opts.rationale).toBeNull();
    expect(opts.noPush).toBe(false);
    expect(opts.dryRun).toBe(false);
    expect(opts.force).toBe(false);
    expect(opts.compareRef).toBeNull();
  });

  it('parses --compare-ref with a value', () => {
    const opts = parseArchiveBranchArgs([
      'feature/parked',
      '--compare-ref',
      'upstream/master',
    ]);
    expect(opts.compareRef).toBe('upstream/master');
  });

  it('throws when --compare-ref has no value', () => {
    expect(() =>
      parseArchiveBranchArgs(['feature/x', '--compare-ref']),
    ).toThrow(/--compare-ref requires/);
  });

  it('parses --rationale with a value', () => {
    const opts = parseArchiveBranchArgs([
      'feature/parked',
      '--rationale',
      'no longer needed',
    ]);
    expect(opts.rationale).toBe('no longer needed');
  });

  it('parses --no-push', () => {
    const opts = parseArchiveBranchArgs(['feature/parked', '--no-push']);
    expect(opts.noPush).toBe(true);
  });

  it('parses --local-only as an alias for --no-push', () => {
    const opts = parseArchiveBranchArgs(['feature/parked', '--local-only']);
    expect(opts.noPush).toBe(true);
  });

  it('parses --dry-run', () => {
    const opts = parseArchiveBranchArgs(['feature/parked', '--dry-run']);
    expect(opts.dryRun).toBe(true);
  });

  it('parses --force', () => {
    const opts = parseArchiveBranchArgs(['feature/parked', '--force']);
    expect(opts.force).toBe(true);
  });

  it('parses all flags together', () => {
    const opts = parseArchiveBranchArgs([
      'feature/x',
      '--rationale',
      'r',
      '--no-push',
      '--dry-run',
      '--force',
    ]);
    expect(opts.branch).toBe('feature/x');
    expect(opts.rationale).toBe('r');
    expect(opts.noPush).toBe(true);
    expect(opts.dryRun).toBe(true);
    expect(opts.force).toBe(true);
  });

  it('throws when no branch is supplied', () => {
    expect(() => parseArchiveBranchArgs([])).toThrow(/Usage:/);
  });

  it('throws when --rationale has no value', () => {
    expect(() =>
      parseArchiveBranchArgs(['feature/x', '--rationale']),
    ).toThrow(/--rationale requires/);
  });

  it('throws on unknown flag', () => {
    expect(() =>
      parseArchiveBranchArgs(['feature/x', '--banana']),
    ).toThrow(/Unknown flag/);
  });

  it('throws on a second positional argument', () => {
    expect(() =>
      parseArchiveBranchArgs(['feature/x', 'extra']),
    ).toThrow(/Unexpected positional/);
  });
});

interface CapturedStreams {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly stdoutText: () => string;
  readonly stderrText: () => string;
}

function captureStreams(): CapturedStreams {
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  stdout.write = ((data: unknown): boolean => {
    outChunks.push(typeof data === 'string' ? data : String(data));
    return true;
  }) as NodeJS.WriteStream['write'];
  stderr.write = ((data: unknown): boolean => {
    errChunks.push(typeof data === 'string' ? data : String(data));
    return true;
  }) as NodeJS.WriteStream['write'];
  return {
    stdout,
    stderr,
    stdoutText: () => outChunks.join(''),
    stderrText: () => errChunks.join(''),
  };
}

function makeStubGit(
  responses: ReadonlyArray<{
    match: (args: readonly string[]) => boolean;
    respond: (args: readonly string[]) => string;
  }>,
): RunGit {
  return (args: readonly string[]): string => {
    for (const r of responses) {
      if (r.match(args)) return r.respond(args);
    }
    throw new Error(`Unstubbed git call: ${args.join(' ')}`);
  };
}

describe('runArchiveBranch — dry-run', () => {
  it('prints the planned commands without executing them', () => {
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
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
        respond: () => '3\n',
      },
    ]);
    const runPush: RunPush = () => {
      throw new Error('runPush MUST NOT be called in dry-run');
    };
    const cap = captureStreams();
    const code = runArchiveBranch({
      opts: {
        branch: 'feature/parked',
        rationale: 'r',
        noPush: false,
        dryRun: true,
        force: false,
        compareRef: null,
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
    });
    expect(code).toBe(0);
    const out = cap.stdoutText();
    expect(out).toContain('Dry-run plan');
    expect(out).toContain('archived/feature-parked-2026-05-28');
    // Tag-message is rendered as its own section, separate from the
    // command list; the tag command references it indirectly so a
    // copy-paste from the dry-run output doesn't collapse newlines via
    // JS string escaping.
    expect(out).toContain('git tag -a archived/feature-parked-2026-05-28 feature/parked -m <see "Tag message" below>');
    expect(out).toContain('git push origin refs/tags/');
    expect(out).toContain('git branch -D feature/parked');
    expect(out).toContain('git push origin --delete feature/parked');
    expect(out).toContain('Tag message:');
    expect(out).toContain('Source branch: feature/parked');
    expect(out).toContain('Archive date: 2026-05-28');
    expect(out).toContain('No mutations performed');
    // Force-mode line is absent when --force was NOT passed.
    expect(out).not.toContain('Force mode:');
  });

  it('surfaces --force in dry-run output when the gate is bypassed', () => {
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
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
    ]);
    const runPush: RunPush = () => {
      throw new Error('runPush MUST NOT be called in dry-run');
    };
    const cap = captureStreams();
    const code = runArchiveBranch({
      opts: {
        branch: 'feature/parked',
        rationale: 'r',
        noPush: false,
        dryRun: true,
        force: true,
        compareRef: null,
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
    });
    expect(code).toBe(0);
    const out = cap.stdoutText();
    expect(out).toContain('Force mode: novel-commits gate skipped.');
  });

  it('honors --compare-ref over the configCompareRef default', () => {
    let revListArgs: readonly string[] | null = null;
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
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
        respond: (a) => {
          revListArgs = a;
          return '3\n';
        },
      },
    ]);
    const runPush: RunPush = () => {
      throw new Error('runPush MUST NOT be called in dry-run');
    };
    const cap = captureStreams();
    const code = runArchiveBranch({
      opts: {
        branch: 'feature/parked',
        rationale: 'r',
        noPush: false,
        dryRun: true,
        force: false,
        compareRef: 'upstream/master',
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
      // Config says origin/develop; CLI flag --compare-ref=upstream/master wins.
      configCompareRef: 'origin/develop',
    });
    expect(code).toBe(0);
    expect(revListArgs).not.toBeNull();
    if (revListArgs) {
      const a: readonly string[] = revListArgs;
      expect(a[3]).toBe('^upstream/master');
    }
  });

  it('honors configCompareRef when no --compare-ref flag is passed', () => {
    let revListArgs: readonly string[] | null = null;
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
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
        respond: (a) => {
          revListArgs = a;
          return '3\n';
        },
      },
    ]);
    const runPush: RunPush = () => {
      throw new Error('runPush MUST NOT be called in dry-run');
    };
    const cap = captureStreams();
    runArchiveBranch({
      opts: {
        branch: 'feature/parked',
        rationale: 'r',
        noPush: false,
        dryRun: true,
        force: false,
        compareRef: null,
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
      configCompareRef: 'origin/develop',
    });
    expect(revListArgs).not.toBeNull();
    if (revListArgs) {
      const a: readonly string[] = revListArgs;
      expect(a[3]).toBe('^origin/develop');
    }
  });

  it('returns exit code 2 on pre-flight failure', () => {
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => {
          throw new Error('fatal: bad ref');
        },
      },
    ]);
    const runPush: RunPush = () => '';
    const cap = captureStreams();
    const code = runArchiveBranch({
      opts: {
        branch: 'nope',
        rationale: null,
        noPush: false,
        dryRun: true,
        force: false,
        compareRef: null,
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
    });
    expect(code).toBe(2);
    expect(cap.stderrText()).toContain('Unknown branch: nope');
  });
});

describe('runArchiveBranch — apply', () => {
  it('returns exit code 0 and prints summary on happy path', () => {
    let tagCreated = false;
    let branchDeleted = false;
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
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
        respond: () => 'last subject\n',
      },
      {
        match: (a) => a[0] === 'rev-list' && a[1] === '--count',
        respond: () => '3\n',
      },
      {
        match: (a) => a[0] === 'tag' && a[1] === '-a',
        respond: () => {
          tagCreated = true;
          return '';
        },
      },
      {
        match: (a) => a[0] === 'branch' && a[1] === '-D',
        respond: () => {
          branchDeleted = true;
          return '';
        },
      },
    ]);
    const runPush: RunPush = () => '';
    const cap = captureStreams();
    const code = runArchiveBranch({
      opts: {
        branch: 'feature/parked',
        rationale: null,
        noPush: false,
        dryRun: false,
        force: false,
        compareRef: null,
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
    });
    expect(code).toBe(0);
    expect(tagCreated).toBe(true);
    expect(branchDeleted).toBe(true);
    const out = cap.stdoutText();
    expect(out).toContain('Archived feature/parked');
    expect(out).toContain('archived/feature-parked-2026-05-28');
    expect(out).toContain('Tag pushed to origin');
    expect(out).toContain('Remote branch deleted');
    expect(out).toContain('To restore: git checkout -b feature/parked archived/feature-parked-2026-05-28');
  });

  it('returns exit code 1 on apply-stage failure (tag-push)', () => {
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => 'abc\n',
      },
      {
        match: (a) => a[0] === 'worktree',
        respond: () => '',
      },
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/tags/') === true,
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
        respond: () => 'last subject\n',
      },
      {
        match: (a) => a[0] === 'rev-list' && a[1] === '--count',
        respond: () => '3\n',
      },
      {
        match: (a) => a[0] === 'tag' && a[1] === '-a',
        respond: () => '',
      },
    ]);
    const runPush: RunPush = () => {
      throw new Error('fatal: network unreachable');
    };
    const cap = captureStreams();
    const code = runArchiveBranch({
      opts: {
        branch: 'feature/parked',
        rationale: null,
        noPush: false,
        dryRun: false,
        force: false,
        compareRef: null,
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
    });
    expect(code).toBe(1);
    expect(cap.stderrText()).toContain('tag');
    expect(cap.stderrText()).toContain('--no-push');
  });

  it('returns exit code 2 on pre-flight failure', () => {
    const runGit = makeStubGit([
      {
        match: (a) => a[0] === 'rev-parse' && a[1] === '--verify' && a[2]?.startsWith('refs/heads/') === true,
        respond: () => {
          throw new Error('fatal: bad ref');
        },
      },
    ]);
    const runPush: RunPush = () => '';
    const cap = captureStreams();
    const code = runArchiveBranch({
      opts: {
        branch: 'nope',
        rationale: null,
        noPush: false,
        dryRun: false,
        force: false,
        compareRef: null,
      },
      projectRoot: '/repo',
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGit,
      runPush,
      stdout: cap.stdout,
      stderr: cap.stderr,
    });
    expect(code).toBe(2);
    expect(cap.stderrText()).toContain('Unknown branch: nope');
  });
});
