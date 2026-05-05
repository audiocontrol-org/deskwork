import { describe, it, expect } from 'vitest';
import { validateVersion } from '../lib/release-helpers.js';

describe('validateVersion', () => {
  it('accepts strictly-greater MAJOR.MINOR.PATCH', () => {
    expect(validateVersion('0.9.0', 'v0.8.7')).toEqual({ ok: true });
  });

  it('strips leading v from lastTag', () => {
    expect(validateVersion('0.9.0', 'v0.8.7')).toEqual({ ok: true });
    expect(validateVersion('0.9.0', '0.8.7')).toEqual({ ok: true });
  });

  it('rejects equal version (must be strictly greater)', () => {
    const r = validateVersion('0.9.0', 'v0.9.0');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/strictly greater/i);
  });

  it('rejects version less than lastTag', () => {
    const r = validateVersion('0.8.6', 'v0.8.7');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/strictly greater/i);
  });

  it('rejects malformed version (missing patch)', () => {
    const r = validateVersion('0.9', 'v0.8.7');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/format/i);
  });

  it('rejects extra suffix on version (no semver pre-release support)', () => {
    const r = validateVersion('1.0.0-beta', 'v0.9.0');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/format/i);
  });

  it('compares numeric tuples, not lexicographic', () => {
    // 0.10.0 > 0.9.0 numerically; lexicographic compare would be wrong.
    expect(validateVersion('0.10.0', 'v0.9.0')).toEqual({ ok: true });
  });
});

import { createRig } from './fixtures.js';

describe('createRig (fixture self-test)', () => {
  it('creates a working local + remote with main + feature branch', () => {
    const rig = createRig();
    try {
      // Confirm branch is feature/test
      expect(rig.sh('git rev-parse --abbrev-ref HEAD').trim()).toBe('feature/test');
      // Confirm origin/main exists
      expect(rig.sh('git rev-parse origin/main').trim()).toMatch(/^[0-9a-f]{40}$/);
      // Confirm tracking is set up
      expect(rig.sh('git rev-parse --abbrev-ref feature/test@{u}').trim()).toBe('origin/feature/test');
    } finally {
      rig.cleanup();
    }
  });
});

import { checkPreconditions } from '../lib/release-helpers.js';

describe('checkPreconditions', () => {
  it('reports ok=true on clean tree, FF over origin/main, branch up-to-date', async () => {
    const rig = createRig();
    try {
      const report = await checkPreconditions({ cwd: rig.localPath });
      expect(report.ok).toBe(true);
      expect(report.workingTreeClean).toBe(true);
      expect(report.relativeToOriginMain.canFastForward).toBe(true);
      expect(report.trackingRemoteUpToDate).toBe(true);
      expect(report.failures).toEqual([]);
      expect(report.head.branch).toBe('feature/test');
      expect(report.head.sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rig.cleanup();
    }
  });

  it('reports ok=false when working tree is dirty (modified file)', async () => {
    const rig = createRig();
    try {
      // Modify the tracked file
      rig.sh('echo dirt >> README.md');
      const report = await checkPreconditions({ cwd: rig.localPath });
      expect(report.ok).toBe(false);
      expect(report.workingTreeClean).toBe(false);
      expect(report.failures).toContainEqual(expect.stringMatching(/working tree/i));
    } finally {
      rig.cleanup();
    }
  });

  it('reports ok=false when an untracked file exists', async () => {
    const rig = createRig();
    try {
      rig.sh('touch new-file.txt');
      const report = await checkPreconditions({ cwd: rig.localPath });
      expect(report.ok).toBe(false);
      expect(report.workingTreeClean).toBe(false);
      expect(report.failures).toContainEqual(expect.stringMatching(/untracked/i));
    } finally {
      rig.cleanup();
    }
  });

  it('reports ok=false when HEAD diverges from origin/main', async () => {
    const rig = createRig();
    try {
      // Add a commit to the feature branch (so it's ahead of main).
      rig.sh('echo "feature work" > work.txt && git add work.txt && git commit -m "feature"');
      // Now add a commit to origin/main from a separate clone, simulating
      // a teammate pushing to main.
      const otherClone = `${rig.localPath}-other`;
      const { execSync } = await import('node:child_process');
      execSync(`git clone "${rig.remotePath}" "${otherClone}"`, { stdio: 'pipe' });
      execSync('git config user.email rig@example.com', { cwd: otherClone, stdio: 'pipe' });
      execSync('git config user.name Rig', { cwd: otherClone, stdio: 'pipe' });
      execSync('git checkout main', { cwd: otherClone, stdio: 'pipe' });
      execSync('echo "main work" > main.txt && git add main.txt && git commit -m "main work" && git push', {
        cwd: otherClone,
        stdio: 'pipe',
        shell: '/bin/bash',
      });
      // Local hasn't fetched yet — checkPreconditions does a fetch first
      // and should detect the divergence.
      const report = await checkPreconditions({ cwd: rig.localPath });
      expect(report.ok).toBe(false);
      expect(report.relativeToOriginMain.canFastForward).toBe(false);
      expect(report.failures).toContainEqual(expect.stringMatching(/diverge/i));
      // Cleanup other clone (rig.cleanup only handles its own root).
      const { rmSync } = await import('node:fs');
      rmSync(otherClone, { recursive: true, force: true });
    } finally {
      rig.cleanup();
    }
  });

  it('reports ok=false when local branch is behind tracking remote', async () => {
    const rig = createRig();
    try {
      // Push a commit to origin/<branch> from another clone.
      const otherClone = `${rig.localPath}-other`;
      const { execSync } = await import('node:child_process');
      execSync(`git clone "${rig.remotePath}" "${otherClone}"`, { stdio: 'pipe' });
      execSync('git config user.email rig@example.com', { cwd: otherClone, stdio: 'pipe' });
      execSync('git config user.name Rig', { cwd: otherClone, stdio: 'pipe' });
      execSync('git checkout feature/test', { cwd: otherClone, stdio: 'pipe' });
      execSync('echo upstream > up.txt && git add up.txt && git commit -m up && git push', {
        cwd: otherClone,
        stdio: 'pipe',
        shell: '/bin/bash',
      });
      const report = await checkPreconditions({ cwd: rig.localPath });
      expect(report.ok).toBe(false);
      expect(report.trackingRemoteUpToDate).toBe(false);
      expect(report.failures).toContainEqual(expect.stringMatching(/behind/i));
      const { rmSync } = await import('node:fs');
      rmSync(otherClone, { recursive: true, force: true });
    } finally {
      rig.cleanup();
    }
  });
});

import { verifyNpmStatus, DESKWORK_PACKAGES, type NpmViewer } from '../lib/release-helpers.js';

describe('verifyNpmStatus', () => {
  it('reports all unpublished when viewer returns false for every spec', () => {
    const viewer: NpmViewer = () => false;
    const r = verifyNpmStatus('0.9.6', viewer);
    expect(r.version).toBe('0.9.6');
    expect(r.published).toEqual([]);
    expect(r.unpublished).toEqual([...DESKWORK_PACKAGES]);
  });

  it('reports all published when viewer returns true for every spec', () => {
    const viewer: NpmViewer = () => true;
    const r = verifyNpmStatus('0.9.5', viewer);
    expect(r.published).toEqual([...DESKWORK_PACKAGES]);
    expect(r.unpublished).toEqual([]);
  });

  it('reports a mixed state when only some packages are published', () => {
    const viewer: NpmViewer = (spec) => spec.startsWith('@deskwork/core@');
    const r = verifyNpmStatus('0.9.6', viewer);
    expect(r.published).toEqual(['@deskwork/core']);
    expect(r.unpublished).toEqual(['@deskwork/cli', '@deskwork/studio']);
  });

  it('queries every spec exactly once and threads the version into each query', () => {
    const seen: string[] = [];
    const viewer: NpmViewer = (spec) => {
      seen.push(spec);
      return false;
    };
    verifyNpmStatus('0.9.6', viewer);
    expect(seen).toEqual([
      '@deskwork/core@0.9.6',
      '@deskwork/cli@0.9.6',
      '@deskwork/studio@0.9.6',
    ]);
  });
});

import { atomicPush } from '../lib/release-helpers.js';

describe('atomicPush', () => {
  it('pushes HEAD to origin/main + branch + tag in one operation', async () => {
    const rig = createRig();
    try {
      // Add a commit on feature/test that will become the v0.0.1 release commit.
      rig.sh('echo release > release.txt && git add release.txt && git commit -m "chore: release v0.0.1"');
      // Annotated tag pointing at HEAD.
      rig.sh('git tag -a v0.0.1 -m "test release"');
      // Run atomicPush.
      await atomicPush({ tag: 'v0.0.1', branch: 'feature/test', cwd: rig.localPath });
      // Verify remote has the commit on main.
      const remoteMainSha = rig.sh('git rev-parse origin/main').trim();
      const localHeadSha = rig.sh('git rev-parse HEAD').trim();
      expect(remoteMainSha).toBe(localHeadSha);
      // Verify remote has the branch.
      const remoteBranchSha = rig.sh('git rev-parse origin/feature/test').trim();
      expect(remoteBranchSha).toBe(localHeadSha);
      // Verify remote has the tag.
      const remoteTagsRaw = rig.sh('git ls-remote --tags origin v0.0.1');
      expect(remoteTagsRaw).toMatch(/refs\/tags\/v0\.0\.1/);
    } finally {
      rig.cleanup();
    }
  });

  it('throws when the push is non-fast-forward', async () => {
    const rig = createRig();
    try {
      // Push a commit to origin/main from another clone (so origin/main moves).
      const otherClone = `${rig.localPath}-other`;
      const { execSync } = await import('node:child_process');
      execSync(`git clone "${rig.remotePath}" "${otherClone}"`, { stdio: 'pipe' });
      execSync('git config user.email rig@example.com', { cwd: otherClone, stdio: 'pipe' });
      execSync('git config user.name Rig', { cwd: otherClone, stdio: 'pipe' });
      execSync('git checkout main', { cwd: otherClone, stdio: 'pipe' });
      execSync('echo upstream > up.txt && git add up.txt && git commit -m up && git push', {
        cwd: otherClone,
        stdio: 'pipe',
        shell: '/bin/bash',
      });
      // Local commit + tag (without fetching the new origin/main).
      rig.sh('echo r > r.txt && git add r.txt && git commit -m "chore: release v0.0.1"');
      rig.sh('git tag -a v0.0.1 -m "test"');
      // atomicPush should fail because origin/main moved.
      await expect(
        atomicPush({ tag: 'v0.0.1', branch: 'feature/test', cwd: rig.localPath }),
      ).rejects.toThrow(/non-fast-forward|rejected|atomic/i);
      const { rmSync } = await import('node:fs');
      rmSync(otherClone, { recursive: true, force: true });
    } finally {
      rig.cleanup();
    }
  });

  it('atomicity: when one ref fails, no other ref is published to origin', async () => {
    // With --atomic, a failed push of any one ref aborts the whole push.
    // Without --atomic, the branch ref or tag could land on origin even
    // when the main ref is rejected — that's the partial-push window
    // issue #195's ref-pinning depends on closing.
    const rig = createRig();
    try {
      // Move origin/main forward so HEAD:main will be rejected.
      const otherClone = `${rig.localPath}-other`;
      const { execSync } = await import('node:child_process');
      execSync(`git clone "${rig.remotePath}" "${otherClone}"`, { stdio: 'pipe' });
      execSync('git config user.email rig@example.com', { cwd: otherClone, stdio: 'pipe' });
      execSync('git config user.name Rig', { cwd: otherClone, stdio: 'pipe' });
      execSync('git checkout main', { cwd: otherClone, stdio: 'pipe' });
      execSync('echo upstream > up.txt && git add up.txt && git commit -m up && git push', {
        cwd: otherClone,
        stdio: 'pipe',
        shell: '/bin/bash',
      });

      // Capture origin's branch/tag state BEFORE the failed push.
      const branchBefore = rig.sh('git ls-remote origin refs/heads/feature/test').trim();
      const tagBefore = rig.sh('git ls-remote origin refs/tags/v0.0.1').trim();

      // Local commit + tag, then attempt the atomic push.
      rig.sh('echo r > r.txt && git add r.txt && git commit -m "chore: release v0.0.1"');
      rig.sh('git tag -a v0.0.1 -m "test"');
      const localBranchAhead = rig.sh('git rev-parse HEAD').trim();

      await expect(
        atomicPush({ tag: 'v0.0.1', branch: 'feature/test', cwd: rig.localPath }),
      ).rejects.toThrow();

      // Atomicity contract: origin's branch and tag are unchanged.
      const branchAfter = rig.sh('git ls-remote origin refs/heads/feature/test').trim();
      const tagAfter = rig.sh('git ls-remote origin refs/tags/v0.0.1').trim();
      expect(branchAfter).toBe(branchBefore);
      expect(tagAfter).toBe(tagBefore);
      // Sanity: origin/feature/test does not point at our local HEAD.
      expect(branchAfter).not.toMatch(new RegExp(`^${localBranchAhead}\\s`));

      const { rmSync } = await import('node:fs');
      rmSync(otherClone, { recursive: true, force: true });
    } finally {
      rig.cleanup();
    }
  });

  it('preserves local state on push failure', async () => {
    const rig = createRig();
    try {
      // Force divergence as in the prior test.
      const otherClone = `${rig.localPath}-other`;
      const { execSync } = await import('node:child_process');
      execSync(`git clone "${rig.remotePath}" "${otherClone}"`, { stdio: 'pipe' });
      execSync('git config user.email rig@example.com', { cwd: otherClone, stdio: 'pipe' });
      execSync('git config user.name Rig', { cwd: otherClone, stdio: 'pipe' });
      execSync('git checkout main', { cwd: otherClone, stdio: 'pipe' });
      execSync('echo u > u.txt && git add u.txt && git commit -m u && git push', {
        cwd: otherClone,
        stdio: 'pipe',
        shell: '/bin/bash',
      });
      rig.sh('echo r > r.txt && git add r.txt && git commit -m "chore: release v0.0.1"');
      rig.sh('git tag -a v0.0.1 -m "test"');
      const localHeadBefore = rig.sh('git rev-parse HEAD').trim();
      const localTagBefore = rig.sh('git rev-parse v0.0.1').trim();

      try {
        await atomicPush({ tag: 'v0.0.1', branch: 'feature/test', cwd: rig.localPath });
      } catch {
        /* expected */
      }
      // Local commit + tag still present.
      expect(rig.sh('git rev-parse HEAD').trim()).toBe(localHeadBefore);
      expect(rig.sh('git rev-parse v0.0.1').trim()).toBe(localTagBefore);
      const { rmSync } = await import('node:fs');
      rmSync(otherClone, { recursive: true, force: true });
    } finally {
      rig.cleanup();
    }
  });
});
