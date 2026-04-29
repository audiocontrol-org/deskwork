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
