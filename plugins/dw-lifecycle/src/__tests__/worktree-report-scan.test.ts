import { describe, it, expect } from 'vitest';
import {
  parsePorcelain,
  autoDetectWorktreeBase,
  runWorktreeReport,
} from '../worktree-report/scan.js';
import type { WorktreeReportOptions } from '../worktree-report/types.js';

describe('parsePorcelain', () => {
  it('parses a main + linked-worktree porcelain stream', () => {
    const out = [
      'worktree /repo/main',
      'HEAD aaa1111aaa1111aaa1111aaa1111aaa1111aaa11',
      'branch refs/heads/main',
      '',
      'worktree /work/feat-a',
      'HEAD bbb2222bbb2222bbb2222bbb2222bbb2222bbb22',
      'branch refs/heads/feature/a',
      '',
    ].join('\n');
    const entries = parsePorcelain(out);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      path: '/repo/main',
      head: 'aaa1111aaa1111aaa1111aaa1111aaa1111aaa11',
      branch: 'main',
      bare: false,
      prunable: false,
    });
    expect(entries[1]).toMatchObject({
      path: '/work/feat-a',
      branch: 'feature/a',
    });
  });

  it('detects detached HEAD entries with null branch', () => {
    const out = [
      'worktree /work/detached',
      'HEAD ccc3333ccc3333ccc3333ccc3333ccc3333ccc33',
      'detached',
      '',
    ].join('\n');
    const [entry] = parsePorcelain(out);
    expect(entry).toBeDefined();
    expect(entry!.branch).toBeNull();
  });

  it('detects bare entries', () => {
    const out = [
      'worktree /repo/bare',
      'HEAD ddd4444ddd4444ddd4444ddd4444ddd4444ddd44',
      'bare',
      '',
    ].join('\n');
    const [entry] = parsePorcelain(out);
    expect(entry).toBeDefined();
    expect(entry!.bare).toBe(true);
  });

  it('parses prunable + prunable reason', () => {
    const out = [
      'worktree /work/gone',
      'HEAD eee5555eee5555eee5555eee5555eee5555eee55',
      'branch refs/heads/feature/dead',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n');
    const [entry] = parsePorcelain(out);
    expect(entry).toBeDefined();
    expect(entry!.prunable).toBe(true);
    expect(entry!.prunableReason).toContain('non-existent');
  });

  it('handles trailing-blank-line absence on the last entry', () => {
    const out = [
      'worktree /repo/main',
      'HEAD aaa1111aaa1111aaa1111aaa1111aaa1111aaa11',
      'branch refs/heads/main',
    ].join('\n');
    const entries = parsePorcelain(out);
    expect(entries).toHaveLength(1);
  });
});

describe('autoDetectWorktreeBase', () => {
  it('returns the common parent of all non-bare worktrees', () => {
    const entries = [
      { path: '/Users/x/work/deskwork', head: 'a', branch: 'main', bare: false, prunable: false },
      { path: '/Users/x/work/deskwork-work/feat-a', head: 'b', branch: 'feature/a', bare: false, prunable: false },
      { path: '/Users/x/work/deskwork-work/feat-b', head: 'c', branch: 'feature/b', bare: false, prunable: false },
    ];
    expect(autoDetectWorktreeBase(entries)).toBe('/Users/x/work');
  });

  it('excludes bare repos from the common prefix', () => {
    const entries = [
      { path: '/srv/bare-repo', head: 'a', branch: null, bare: true, prunable: false },
      { path: '/Users/x/work/feat-a', head: 'b', branch: 'feature/a', bare: false, prunable: false },
      { path: '/Users/x/work/feat-b', head: 'c', branch: 'feature/b', bare: false, prunable: false },
    ];
    expect(autoDetectWorktreeBase(entries)).toBe('/Users/x/work');
  });

  it('returns dirname of single entry', () => {
    const entries = [
      { path: '/Users/x/repo', head: 'a', branch: 'main', bare: false, prunable: false },
    ];
    expect(autoDetectWorktreeBase(entries)).toBe('/Users/x');
  });

  it('returns empty string when no non-bare worktrees', () => {
    expect(autoDetectWorktreeBase([])).toBe('');
  });
});

// In-memory stub helpers so the scan tests don't shell out.
interface ScriptedGit {
  readonly handlers: ReadonlyArray<{ match: (args: readonly string[]) => boolean; reply: string }>;
}

function makeGitStub(script: ScriptedGit) {
  return (args: readonly string[]): string => {
    for (const h of script.handlers) {
      if (h.match(args)) return h.reply;
    }
    return '';
  };
}

function makeGhStub(prJsonReply: string) {
  return (_args: readonly string[]): string => prJsonReply;
}

describe('runWorktreeReport — end-to-end with stubs', () => {
  const now = new Date('2026-05-29T00:00:00.000Z');

  function defaultOpts(overrides: Partial<WorktreeReportOptions> = {}): WorktreeReportOptions {
    return {
      projectRoot: '/Users/x/work/feat-a',
      daysThreshold: 30,
      thresholdCount: 3,
      allowExternal: true,
      now,
      runGit: () => '',
      runGh: () => '[]',
      readDir: () => [],
      statDir: () => false,
      ...overrides,
    };
  }

  it('produces an entries[] with one row per non-bare worktree', () => {
    const runGit = makeGitStub({
      handlers: [
        {
          match: (a) => a[0] === 'worktree' && a[1] === 'list',
          reply: [
            'worktree /Users/x/work/main',
            'HEAD aaa1111aaa1111aaa1111aaa1111aaa1111aaa11',
            'branch refs/heads/main',
            '',
            'worktree /Users/x/work/feat-a',
            'HEAD bbb2222bbb2222bbb2222bbb2222bbb2222bbb22',
            'branch refs/heads/feature/a',
            '',
          ].join('\n'),
        },
        {
          match: (a) => a.includes('--show-toplevel'),
          reply: '/Users/x/work/feat-a\n',
        },
        {
          match: (a) => a.includes('--git-common-dir'),
          reply: '/Users/x/work/main/.git\n',
        },
        // Generic stubs for ahead/behind, status, log, ls-remote, rev-list, etc.
        { match: (a) => a.includes('--left-right'), reply: '0\t0' },
        { match: (a) => a.includes('status'), reply: '' },
        { match: (a) => a.includes('log'), reply: 'bbb2222|2026-05-25T00:00:00Z' },
        { match: (a) => a.includes('ls-remote'), reply: 'abc refs/heads/feature/a' },
        { match: (a) => a.includes('rev-list') && a.includes('--count'), reply: '0' },
        { match: (a) => a.includes('merge-base'), reply: '' },
        { match: (a) => a.includes('rev-parse') && a.some((x) => x.startsWith('origin/')), reply: 'bbb2222bbb2222bbb2222bbb2222bbb2222bbb22' },
      ],
    });
    const report = runWorktreeReport(defaultOpts({ runGit }));
    expect(report.entries).toHaveLength(2);
    const main = report.entries.find((e) => e.path === '/Users/x/work/main');
    const feat = report.entries.find((e) => e.path === '/Users/x/work/feat-a');
    expect(main?.is_main).toBe(true);
    expect(feat?.is_current).toBe(true);
  });

  it('exposes the canonical 9 signals on every entry, regardless of verdict', () => {
    const runGit = makeGitStub({
      handlers: [
        {
          match: (a) => a[0] === 'worktree' && a[1] === 'list',
          reply: [
            'worktree /Users/x/work/feat-a',
            'HEAD bbb2222bbb2222bbb2222bbb2222bbb2222bbb22',
            'branch refs/heads/feature/a',
            '',
          ].join('\n'),
        },
        { match: (a) => a.includes('--show-toplevel'), reply: '/Users/x/work/feat-a\n' },
        { match: (a) => a.includes('--git-common-dir'), reply: '/Users/x/work/feat-a/.git\n' },
        { match: () => true, reply: '' },
      ],
    });
    const report = runWorktreeReport(defaultOpts({ runGit }));
    expect(report.entries[0]?.signals).toHaveLength(9);
  });

  it('detects corrupt (multi-worktree-same-branch)', () => {
    const runGit = makeGitStub({
      handlers: [
        {
          match: (a) => a[0] === 'worktree' && a[1] === 'list',
          reply: [
            'worktree /Users/x/work/dup1',
            'HEAD aaa1111aaa1111aaa1111aaa1111aaa1111aaa11',
            'branch refs/heads/feature/clone',
            '',
            'worktree /Users/x/work/dup2',
            'HEAD aaa1111aaa1111aaa1111aaa1111aaa1111aaa11',
            'branch refs/heads/feature/clone',
            '',
          ].join('\n'),
        },
        { match: (a) => a.includes('--show-toplevel'), reply: '/Users/x/work/feat-a\n' },
        { match: (a) => a.includes('--git-common-dir'), reply: '/Users/x/work/main/.git\n' },
        { match: () => true, reply: '' },
      ],
    });
    const report = runWorktreeReport(defaultOpts({ runGit, allowExternal: true }));
    const corrupt = report.entries.filter((e) => e.verdict === 'corrupt');
    expect(corrupt.length).toBe(2);
  });

  it('orphan directory in worktree-base lands as orphan verdict', () => {
    const runGit = makeGitStub({
      handlers: [
        {
          match: (a) => a[0] === 'worktree' && a[1] === 'list',
          reply: [
            'worktree /Users/x/work/feat-a',
            'HEAD bbb2222bbb2222bbb2222bbb2222bbb2222bbb22',
            'branch refs/heads/feature/a',
            '',
          ].join('\n'),
        },
        { match: (a) => a.includes('--show-toplevel'), reply: '/Users/x/work/feat-a\n' },
        { match: (a) => a.includes('--git-common-dir'), reply: '/Users/x/work/feat-a/.git\n' },
        { match: () => true, reply: '' },
      ],
    });
    const opts = defaultOpts({
      runGit,
      worktreeBase: '/Users/x/work',
      readDir: (path: string) => {
        if (path === '/Users/x/work') return ['feat-a', 'orphan-x'];
        return [];
      },
      statDir: (path: string) => {
        if (path === '/Users/x/work') return true;
        if (path === '/Users/x/work/feat-a') return true;
        if (path === '/Users/x/work/orphan-x') return true;
        return false;
      },
    });
    const report = runWorktreeReport(opts);
    const orphan = report.entries.find((e) => e.verdict === 'orphan');
    expect(orphan).toBeDefined();
    expect(orphan?.path).toBe('/Users/x/work/orphan-x');
  });
});
