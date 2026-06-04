/**
 * Phase 28 Task 1 — pure-fn library test.
 *
 * Covers detectBranchStaleness() across the four documented boundary
 * cases + the --no-fetch contract + the real-git fixture path that
 * binds the helper to actual git behavior (parallel to the
 * git-ancestry real-git tests).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectBranchStaleness,
  type BranchStalenessDeps,
  type DetectBranchStalenessArgs,
} from '../../lifecycle-integration/branch-staleness.js';

function makeDeps(behind: number): {
  deps: BranchStalenessDeps;
  fetchSpy: ReturnType<typeof vi.fn>;
  logCountSpy: ReturnType<typeof vi.fn>;
} {
  const fetchSpy = vi.fn();
  const logCountSpy = vi.fn().mockReturnValue(behind);
  return {
    deps: {
      gitFetch: fetchSpy as unknown as BranchStalenessDeps['gitFetch'],
      gitLogCount: logCountSpy as unknown as BranchStalenessDeps['gitLogCount'],
    },
    fetchSpy,
    logCountSpy,
  };
}

function baseArgs(overrides: Partial<DetectBranchStalenessArgs> = {}): DetectBranchStalenessArgs {
  return {
    branch: 'feature/scope-discovery',
    upstreamRemote: 'origin',
    upstreamBranch: 'main',
    threshold: 5,
    fetch: true,
    ...overrides,
  };
}

describe('detectBranchStaleness — pure-fn boundary cases', () => {
  it('behind=0, threshold=5 → nudgeRequired: false', () => {
    const { deps } = makeDeps(0);
    const snap = detectBranchStaleness(baseArgs(), deps);
    expect(snap.behind).toBe(0);
    expect(snap.threshold).toBe(5);
    expect(snap.nudgeRequired).toBe(false);
    expect(snap.remoteRef).toBe('origin/main');
  });

  it('behind=5, threshold=5 → nudgeRequired: false (boundary inclusive — behind <= threshold is OK)', () => {
    const { deps } = makeDeps(5);
    const snap = detectBranchStaleness(baseArgs(), deps);
    expect(snap.behind).toBe(5);
    expect(snap.nudgeRequired).toBe(false);
  });

  it('behind=6, threshold=5 → nudgeRequired: true', () => {
    const { deps } = makeDeps(6);
    const snap = detectBranchStaleness(baseArgs(), deps);
    expect(snap.nudgeRequired).toBe(true);
  });

  it('behind=24, threshold=5 → nudgeRequired: true (cont. 5 real value)', () => {
    const { deps } = makeDeps(24);
    const snap = detectBranchStaleness(baseArgs(), deps);
    expect(snap.behind).toBe(24);
    expect(snap.nudgeRequired).toBe(true);
  });
});

describe('detectBranchStaleness — fetch DI contract', () => {
  it('fetch=true → gitFetch invoked exactly once with (remote, branch)', () => {
    const { deps, fetchSpy } = makeDeps(0);
    detectBranchStaleness(baseArgs({ fetch: true }), deps);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('origin', 'main');
  });

  it('fetch=false → gitFetch NOT invoked (offline / test path)', () => {
    const { deps, fetchSpy, logCountSpy } = makeDeps(3);
    detectBranchStaleness(baseArgs({ fetch: false }), deps);
    expect(fetchSpy).not.toHaveBeenCalled();
    // gitLogCount still runs — we count against the local copy of the upstream ref.
    expect(logCountSpy).toHaveBeenCalledTimes(1);
    expect(logCountSpy).toHaveBeenCalledWith('feature/scope-discovery', 'origin/main');
  });
});

describe('detectBranchStaleness — return-shape invariants', () => {
  it('echoes branch + remoteRef + threshold from inputs', () => {
    const { deps } = makeDeps(0);
    const snap = detectBranchStaleness(
      baseArgs({
        branch: 'feature/x',
        upstreamRemote: 'upstream',
        upstreamBranch: 'master',
        threshold: 12,
      }),
      deps,
    );
    expect(snap.branch).toBe('feature/x');
    expect(snap.remoteRef).toBe('upstream/master');
    expect(snap.threshold).toBe(12);
  });
});

// Real-git fixture: bind the helper to actual git behavior, parallel
// to the git-ancestry real-git tests. Catches drift between the DI
// contract and what the wrapper around `execFileSync('git', ...)`
// actually returns.

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();
}

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'branch-staleness-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('detectBranchStaleness — real-git fixture (binds DI contract to actual git output)', () => {
  it('feature branch 6 commits behind synthetic upstream main → behind=6, nudgeRequired at threshold 5', () => {
    const repoRoot = join(workDir, 'six-behind');
    mkdirSync(repoRoot, { recursive: true });
    // Build: A on main; branch feature off A; advance main with 6 more commits.
    git(repoRoot, 'init', '--initial-branch=main');
    writeFileSync(join(repoRoot, 'a.txt'), 'a');
    git(repoRoot, 'add', 'a.txt');
    git(repoRoot, 'commit', '-m', 'A');
    git(repoRoot, 'checkout', '-b', 'feature/x');
    git(repoRoot, 'checkout', 'main');
    for (let i = 0; i < 6; i++) {
      writeFileSync(join(repoRoot, `m${i}.txt`), `m${i}`);
      git(repoRoot, 'add', `m${i}.txt`);
      git(repoRoot, 'commit', '-m', `M${i}`);
    }
    git(repoRoot, 'checkout', 'feature/x');

    // Local-only upstream — wire the deps to count against 'main' (no
    // remote in this fixture; we use the local branch as the upstream ref).
    const deps: BranchStalenessDeps = {
      gitFetch: () => undefined, // local-only fixture; no network fetch
      gitLogCount: (branch, upstreamRef) => {
        const out = execFileSync(
          'git',
          ['rev-list', '--count', `${branch}..${upstreamRef}`],
          { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );
        return parseInt(out.trim(), 10);
      },
    };

    const snap = detectBranchStaleness(
      {
        branch: 'feature/x',
        // For the local-only fixture, the "upstream ref" is just 'main'.
        // The DI contract doesn't care — gitLogCount receives whatever ref
        // we ask it to compare against.
        upstreamRemote: '',
        upstreamBranch: 'main',
        threshold: 5,
        fetch: false,
      },
      deps,
    );

    expect(snap.behind).toBe(6);
    expect(snap.nudgeRequired).toBe(true);
  });

  it('feature branch at tip of main → behind=0, no nudge', () => {
    const repoRoot = join(workDir, 'zero-behind');
    mkdirSync(repoRoot, { recursive: true });
    git(repoRoot, 'init', '--initial-branch=main');
    writeFileSync(join(repoRoot, 'a.txt'), 'a');
    git(repoRoot, 'add', 'a.txt');
    git(repoRoot, 'commit', '-m', 'A');
    git(repoRoot, 'checkout', '-b', 'feature/x');

    const deps: BranchStalenessDeps = {
      gitFetch: () => undefined,
      gitLogCount: (branch, upstreamRef) => {
        const out = execFileSync(
          'git',
          ['rev-list', '--count', `${branch}..${upstreamRef}`],
          { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );
        return parseInt(out.trim(), 10);
      },
    };

    const snap = detectBranchStaleness(
      {
        branch: 'feature/x',
        upstreamRemote: '',
        upstreamBranch: 'main',
        threshold: 5,
        fetch: false,
      },
      deps,
    );
    expect(snap.behind).toBe(0);
    expect(snap.nudgeRequired).toBe(false);
  });
});
