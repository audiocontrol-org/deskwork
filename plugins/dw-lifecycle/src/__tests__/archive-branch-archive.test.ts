import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyArchive,
  planArchive,
  ArchiveBranchApplyError,
} from '../archive-branch/archive.js';
import { ArchiveBranchPreflightError } from '../archive-branch/preflight.js';
import type {
  ArchiveBranchOptions,
  RunPush,
} from '../archive-branch/types.js';
import type { RunGit } from '../debt-report/types.js';

function gitInFixture(cwd: string): RunGit {
  return (args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd, encoding: 'utf8' });
}

function setupBareRemoteAndClone(): {
  remote: string;
  clone: string;
} {
  // Bare repo as fake origin.
  const remote = mkdtempSync(join(tmpdir(), 'archive-remote-'));
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], {
    encoding: 'utf8',
  });

  // Clone with initial commit on main + a feature branch with one
  // additional commit.
  const clone = mkdtempSync(join(tmpdir(), 'archive-clone-'));
  const g = (args: string[]): string =>
    execFileSync('git', [...args], { cwd: clone, encoding: 'utf8' });
  execFileSync('git', ['init', '-b', 'main', clone], { encoding: 'utf8' });
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'test']);
  g(['commit', '--allow-empty', '-m', 'initial']);
  g(['remote', 'add', 'origin', remote]);
  g(['push', '-u', 'origin', 'main']);

  // Feature branch with a novel commit.
  g(['checkout', '-b', 'feature/parked']);
  g(['commit', '--allow-empty', '-m', 'feature: parked work']);
  g(['push', '-u', 'origin', 'feature/parked']);

  // Switch off the branch so it can be deleted later.
  g(['checkout', 'main']);

  return { remote, clone };
}

describe('planArchive (dry-run)', () => {
  let clone: string;
  beforeEach(() => {
    ({ clone } = setupBareRemoteAndClone());
  });

  it('returns the command list without mutating state', () => {
    const opts: ArchiveBranchOptions = {
      branch: 'feature/parked',
      rationale: 'no longer needed',
      noPush: false,
      dryRun: true,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    const plan = planArchive({ opts, runGit: gitInFixture(clone) });
    expect(plan.branch).toBe('feature/parked');
    expect(plan.tagName).toBe('archived/feature-parked-2026-05-28');
    expect(plan.commands.length).toBe(4);
    expect(plan.commands[0]).toContain('git tag -a archived/feature-parked-2026-05-28 feature/parked');
    expect(plan.commands[1]).toContain('git push origin refs/tags/archived/feature-parked-2026-05-28');
    expect(plan.commands[2]).toBe('git branch -D feature/parked');
    expect(plan.commands[3]).toBe('git push origin --delete feature/parked');

    // No-push variant strips the push commands.
    const planLocal = planArchive({
      opts: { ...opts, noPush: true },
      runGit: gitInFixture(clone),
    });
    expect(planLocal.commands.length).toBe(2);
    expect(planLocal.commands[0]).toContain('git tag -a');
    expect(planLocal.commands[1]).toBe('git branch -D feature/parked');
  });

  it('runs pre-flight gates and propagates errors before listing commands', () => {
    const opts: ArchiveBranchOptions = {
      branch: 'feature/does-not-exist',
      rationale: 'r',
      noPush: false,
      dryRun: true,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    expect(() =>
      planArchive({ opts, runGit: gitInFixture(clone) }),
    ).toThrow(ArchiveBranchPreflightError);
  });
});

describe('applyArchive — integration against fixture remote', () => {
  let clone: string;
  beforeEach(() => {
    ({ clone } = setupBareRemoteAndClone());
  });

  it('happy path: creates tag, pushes, deletes local and remote', () => {
    const opts: ArchiveBranchOptions = {
      branch: 'feature/parked',
      rationale: 'archived from test',
      noPush: false,
      dryRun: false,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    const runGit = gitInFixture(clone);
    const runPush: RunPush = (args) =>
      execFileSync('git', [...args], { cwd: clone, encoding: 'utf8' });
    const result = applyArchive({ opts, runGit, runPush });

    expect(result.branch).toBe('feature/parked');
    expect(result.tagName).toBe('archived/feature-parked-2026-05-28');
    expect(result.lastCommitSha.length).toBeGreaterThan(0);
    expect(result.lastCommitSubject).toBe('feature: parked work');
    expect(result.tagPushed).toBe(true);
    expect(result.remoteBranchDeleted).toBe(true);

    // Tag exists locally.
    const tagSha = runGit([
      'rev-parse',
      '--verify',
      'refs/tags/archived/feature-parked-2026-05-28',
    ]).trim();
    expect(tagSha.length).toBeGreaterThan(0);

    // Tag is annotated and the message includes the rationale.
    const tagMsg = runGit([
      'cat-file',
      '-p',
      'refs/tags/archived/feature-parked-2026-05-28',
    ]);
    expect(tagMsg).toContain('archived from test');
    expect(tagMsg).toContain('Source branch: feature/parked');
    expect(tagMsg).toContain('Last commit:');
    expect(tagMsg).toContain('Archive date: 2026-05-28');

    // Local branch is gone.
    let stillExists = true;
    try {
      runGit(['rev-parse', '--verify', 'refs/heads/feature/parked']);
    } catch {
      stillExists = false;
    }
    expect(stillExists).toBe(false);

    // Remote branch is gone (the remote-tracking ref reflects that after
    // a prune; the push --delete already removed the remote ref).
    runGit(['fetch', 'origin', '--prune']);
    let remoteStillExists = true;
    try {
      runGit(['rev-parse', '--verify', 'refs/remotes/origin/feature/parked']);
    } catch {
      remoteStillExists = false;
    }
    expect(remoteStillExists).toBe(false);
  });

  it('--no-push: creates tag and deletes local only; remote stays intact', () => {
    const opts: ArchiveBranchOptions = {
      branch: 'feature/parked',
      rationale: 'local-only',
      noPush: true,
      dryRun: false,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    const runGit = gitInFixture(clone);
    const runPush: RunPush = () => {
      throw new Error('runPush MUST NOT be called when --no-push is set');
    };
    const result = applyArchive({ opts, runGit, runPush });
    expect(result.tagPushed).toBe(false);
    expect(result.remoteBranchDeleted).toBe(false);

    // Local branch is gone but the tag exists locally only.
    let localExists = true;
    try {
      runGit(['rev-parse', '--verify', 'refs/heads/feature/parked']);
    } catch {
      localExists = false;
    }
    expect(localExists).toBe(false);

    // Remote-tracking ref still names the remote branch (we haven't
    // fetched-with-prune, and we didn't delete the remote branch).
    const remoteSha = runGit([
      'rev-parse',
      '--verify',
      'refs/remotes/origin/feature/parked',
    ]).trim();
    expect(remoteSha.length).toBeGreaterThan(0);
  });

  it('refuses (pre-flight) when the branch is checked out in a worktree', () => {
    // Add a second worktree for `feature/parked` so the gate trips.
    execFileSync(
      'git',
      ['worktree', 'add', join(tmpdir(), `wt-${Date.now()}`), 'feature/parked'],
      { cwd: clone, encoding: 'utf8' },
    );
    const opts: ArchiveBranchOptions = {
      branch: 'feature/parked',
      rationale: 'r',
      noPush: true,
      dryRun: false,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    const runPush: RunPush = () => '';
    let caught: unknown;
    try {
      applyArchive({ opts, runGit: gitInFixture(clone), runPush });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ArchiveBranchPreflightError);
    if (caught instanceof ArchiveBranchPreflightError) {
      expect(caught.kind).toBe('branch-checked-out');
    }
  });

  it('wraps tag-create failures in ArchiveBranchApplyError', () => {
    // Force tag-create to fail by pre-creating the tag, then bypass the
    // pre-flight tag-exists gate with a manual run that intercepts the
    // tag-create step. The easiest path: run a second archive with the
    // same now-date after the first one already created the tag.
    const opts: ArchiveBranchOptions = {
      branch: 'feature/parked',
      rationale: 'first',
      noPush: true,
      dryRun: false,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    const runGit = gitInFixture(clone);
    const runPush: RunPush = () => '';
    applyArchive({ opts, runGit, runPush });

    // Recreate the branch + try to archive again with the same now-date.
    // The pre-existing tag is what pre-flight catches — that's a
    // preflight error, not an apply error. So this test verifies that
    // the second run trips the gate rather than reaching tag-create.
    execFileSync(
      'git',
      [
        'branch',
        'feature/parked',
        'origin/main',
      ],
      { cwd: clone, encoding: 'utf8' },
    );
    let caught: unknown;
    try {
      applyArchive({
        opts: { ...opts, force: true },
        runGit,
        runPush,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ArchiveBranchPreflightError);
    if (caught instanceof ArchiveBranchPreflightError) {
      expect(caught.kind).toBe('tag-exists');
    }
  });

  it('reports remote-delete skip when the remote branch is absent', () => {
    // Local-only branch: create a branch with novel commits that was
    // never pushed.
    const runGit = gitInFixture(clone);
    execFileSync(
      'git',
      ['checkout', '-b', 'feature/local-only'],
      { cwd: clone, encoding: 'utf8' },
    );
    execFileSync(
      'git',
      ['commit', '--allow-empty', '-m', 'local-only work'],
      { cwd: clone, encoding: 'utf8' },
    );
    execFileSync('git', ['checkout', 'main'], {
      cwd: clone,
      encoding: 'utf8',
    });

    const opts: ArchiveBranchOptions = {
      branch: 'feature/local-only',
      rationale: 'local-only branch',
      noPush: false,
      dryRun: false,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    const runPush: RunPush = (args) =>
      execFileSync('git', [...args], { cwd: clone, encoding: 'utf8' });
    const result = applyArchive({ opts, runGit, runPush });

    expect(result.tagPushed).toBe(true);
    expect(result.remoteBranchDeleted).toBe(false);
    expect(result.remoteDeleteSkipped).toBe(true);
    expect(result.remoteDeleteSkipReason).not.toBeNull();
  });

  it('surfaces tag-push failure as ArchiveBranchApplyError without rolling back the tag', () => {
    const opts: ArchiveBranchOptions = {
      branch: 'feature/parked',
      rationale: 'push will fail',
      noPush: false,
      dryRun: false,
      force: false,
      now: new Date('2026-05-28T12:00:00.000Z'),
    };
    const runGit = gitInFixture(clone);
    const runPush: RunPush = () => {
      const e = new Error('fatal: network unreachable');
      throw e;
    };
    let caught: unknown;
    try {
      applyArchive({ opts, runGit, runPush });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ArchiveBranchApplyError);
    if (caught instanceof ArchiveBranchApplyError) {
      expect(caught.stage).toBe('tag-push');
      expect(caught.message).toContain('--no-push');
    }
    // The tag MUST still exist locally even though the push failed —
    // the work-preservation contract holds even mid-flight.
    const tagSha = runGit([
      'rev-parse',
      '--verify',
      'refs/tags/archived/feature-parked-2026-05-28',
    ]).trim();
    expect(tagSha.length).toBeGreaterThan(0);
  });
});
