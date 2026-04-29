# /release Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/release` skill at `.claude/skills/release/`, replacing the manual procedure in `RELEASING.md`. The skill enforces hard gates (no overrides), pauses at four operator-decision points, atomic-pushes commit + tag together, and prevents re-tagging a published version.

**Architecture:** Project-level skill. `SKILL.md` prose orchestrates the flow; `lib/release-helpers.ts` exposes three TypeScript functions (`checkPreconditions`, `validateVersion`, `atomicPush`) plus a CLI dispatcher invoked via `tsx`. Tests via vitest at `test/release-helpers.test.ts`. Per-1.0 deliberate decision: direct-to-main push (no PR-merge) — revisit at 1.0 stabilization.

**Tech Stack:** TypeScript, tsx (project default runner), vitest, `node:child_process` (for git invocations), `node:fs/promises`, `node:os`. No new npm dependencies.

**Spec:** [`docs/superpowers/specs/2026-04-29-release-skill-design.md`](../specs/2026-04-29-release-skill-design.md) (workflow `ac1c1945-…`, applied at v2)

---

## File Structure

**Create:**
- `.claude/skills/release/SKILL.md` — operator-facing prose, drives the flow
- `.claude/skills/release/lib/release-helpers.ts` — TS helpers + CLI dispatcher
- `.claude/skills/release/test/release-helpers.test.ts` — vitest tests
- `.claude/skills/release/test/fixtures.ts` — tmp-repo fixture-builder for git tests
- `.claude/skills/release/vitest.config.ts` — standalone vitest config for the skill
- `.claude/skills/release/package.json` — minimal, declares vitest dev-dep + the test script

**Modify:**
- `RELEASING.md` — rewrite per spec (shorter; pointer to `/release`; new Maturity stance; remove numbered procedure)

---

## Task 1: Scaffold skill directory + minimal SKILL.md frontmatter

**Files:**
- Create: `.claude/skills/release/SKILL.md`
- Create: `.claude/skills/release/lib/.gitkeep`
- Create: `.claude/skills/release/test/.gitkeep`

- [ ] **Step 1: Create the skill directory + scaffolding**

```bash
mkdir -p .claude/skills/release/lib
mkdir -p .claude/skills/release/test
touch .claude/skills/release/lib/.gitkeep
touch .claude/skills/release/test/.gitkeep
```

- [ ] **Step 2: Write `.claude/skills/release/SKILL.md` with frontmatter only (prose comes in Task 7)**

```markdown
---
name: release
description: Release the deskwork monorepo (bump → smoke → tag → push). Hard-gated procedure with operator pauses at version, post-bump diff, tag message, and final push. Project-internal — for monorepo maintainers, not adopters.
---

# Release

(Prose body — see Task 7.)
```

- [ ] **Step 3: Verify the skill is discoverable**

Run: `ls .claude/skills/release/`
Expected: `SKILL.md`, `lib/`, `test/`

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/release/
git commit -m "scaffold .claude/skills/release/ for /release skill (spec ac1c1945-...)"
```

---

## Task 2: Standalone vitest config + package.json for the skill's test runner

**Files:**
- Create: `.claude/skills/release/package.json`
- Create: `.claude/skills/release/vitest.config.ts`

- [ ] **Step 1: Write `.claude/skills/release/package.json`**

```json
{
  "name": "@deskwork/release-skill",
  "version": "0.0.0",
  "private": true,
  "description": "Project-internal release skill helpers + tests. Not part of any plugin tarball; lives under .claude/skills/.",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 2: Write `.claude/skills/release/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
  },
});
```

- [ ] **Step 3: Install vitest into the skill workspace**

The repo root is an npm workspaces monorepo, but `.claude/skills/release/` is NOT a workspace. Use a local `node_modules` for the skill:

```bash
cd .claude/skills/release && npm install --no-save && cd -
```

Expected: `.claude/skills/release/node_modules/.bin/vitest` exists.

- [ ] **Step 4: Verify vitest can run (will fail because no tests yet, but confirms wiring)**

```bash
cd .claude/skills/release && npx vitest run --passWithNoTests && cd -
```

Expected: `No test files found` warning + exit 0 (because of `--passWithNoTests`).

- [ ] **Step 5: Update root `.gitignore` to ignore the skill's node_modules**

Open `.gitignore`, verify it has `node_modules` at the top level (it does — workspaces pattern). The skill's `node_modules/` is covered by the existing `node_modules` rule, no edit needed. Verify:

```bash
git check-ignore -v .claude/skills/release/node_modules/foo
```

Expected output line: `.gitignore:<line>:node_modules	.claude/skills/release/node_modules/foo`

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/release/package.json .claude/skills/release/vitest.config.ts
git commit -m "release skill: standalone vitest config + package.json"
```

---

## Task 3: Write `validateVersion` (pure function, TDD)

**Files:**
- Create: `.claude/skills/release/test/release-helpers.test.ts`
- Create: `.claude/skills/release/lib/release-helpers.ts`

- [ ] **Step 1: Write the failing test cases**

Create `.claude/skills/release/test/release-helpers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test, expect import failure**

```bash
cd .claude/skills/release && npx vitest run test/release-helpers.test.ts && cd -
```

Expected: tests fail with `Failed to load url ../lib/release-helpers.js` or similar (the lib file doesn't exist yet).

- [ ] **Step 3: Implement `validateVersion` in `lib/release-helpers.ts`**

Create `.claude/skills/release/lib/release-helpers.ts`:

```ts
/**
 * /release skill helpers — TypeScript implementations called by SKILL.md
 * via tsx. See ../SKILL.md for the operator-facing flow.
 *
 * Test coverage: ./test/release-helpers.test.ts (vitest).
 */

export interface ValidateVersionResult {
  readonly ok: boolean;
  readonly reason?: string;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Validate that `version` is a strict-semver MAJOR.MINOR.PATCH AND is
 * strictly greater than `lastTag` (after stripping a leading 'v').
 *
 * Pure function — no I/O, no subprocesses.
 */
export function validateVersion(version: string, lastTag: string): ValidateVersionResult {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    return {
      ok: false,
      reason: `Version "${version}" is not in MAJOR.MINOR.PATCH format (regex: ${SEMVER_RE}).`,
    };
  }
  const [a, b, c] = [Number(match[1]), Number(match[2]), Number(match[3])];

  const stripped = lastTag.replace(/^v/, '');
  const lastMatch = SEMVER_RE.exec(stripped);
  if (!lastMatch) {
    return {
      ok: false,
      reason: `Last tag "${lastTag}" is not in v?MAJOR.MINOR.PATCH format.`,
    };
  }
  const [la, lb, lc] = [Number(lastMatch[1]), Number(lastMatch[2]), Number(lastMatch[3])];

  // Strictly-greater numeric tuple compare.
  if (a > la) return { ok: true };
  if (a < la) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (b > lb) return { ok: true };
  if (b < lb) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (c > lc) return { ok: true };
  return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
}
```

- [ ] **Step 4: Run the test, expect pass**

```bash
cd .claude/skills/release && npx vitest run test/release-helpers.test.ts && cd -
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/release/lib/release-helpers.ts .claude/skills/release/test/release-helpers.test.ts
git commit -m "release skill: validateVersion (pure semver tuple compare)"
```

---

## Task 4: Build the test fixture-builder (tmp git repo + bare remote)

**Files:**
- Create: `.claude/skills/release/test/fixtures.ts`

This is infrastructure for Tasks 5 and 6. The fixture creates a tmp local repo with a tmp bare remote, lets the test set up specific scenarios (clean/dirty, FF/diverged, etc.).

- [ ] **Step 1: Write the fixture module**

Create `.claude/skills/release/test/fixtures.ts`:

```ts
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RigOptions {
  /** Branch name to check out in the local repo. Default: 'feature/test'. */
  readonly branch?: string;
  /** Initial main commit message. Default: 'init main'. */
  readonly initialMainMessage?: string;
}

export interface Rig {
  /** Absolute path of the tmp local repo (the test acts here). */
  readonly localPath: string;
  /** Absolute path of the tmp bare remote. */
  readonly remotePath: string;
  /** Run a shell command inside the local repo. */
  readonly sh: (cmd: string) => string;
  /** Cleanup — call from afterEach. */
  readonly cleanup: () => void;
}

/**
 * Build a rigged git environment:
 *   - bare remote at <tmp>/remote.git
 *   - local clone at <tmp>/local
 *   - one commit on `main`
 *   - feature branch checked out and tracking origin/<branch>
 *
 * Each helper test mutates the rig (commits, pushes, dirties) to set up
 * its specific scenario.
 */
export function createRig(opts: RigOptions = {}): Rig {
  const branch = opts.branch ?? 'feature/test';
  const initialMessage = opts.initialMainMessage ?? 'init main';
  const root = mkdtempSync(join(tmpdir(), 'release-skill-rig-'));
  const remotePath = join(root, 'remote.git');
  const localPath = join(root, 'local');

  // Bare remote.
  execSync(`git init --bare --initial-branch=main "${remotePath}"`, { stdio: 'pipe' });

  // Local repo + initial main commit.
  execSync(`git init --initial-branch=main "${localPath}"`, { stdio: 'pipe' });
  const sh = (cmd: string): string =>
    execSync(cmd, { cwd: localPath, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  sh(`git config user.email "rig@example.com"`);
  sh(`git config user.name "Rig User"`);
  writeFileSync(join(localPath, 'README.md'), '# rig\n');
  sh(`git add README.md`);
  sh(`git commit -m "${initialMessage}"`);
  sh(`git remote add origin "${remotePath}"`);
  sh(`git push -u origin main`);

  // Feature branch tracking remote.
  sh(`git checkout -b ${branch}`);
  sh(`git push -u origin ${branch}`);

  return {
    localPath,
    remotePath,
    sh,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
```

- [ ] **Step 2: Smoke-test the fixture by writing a self-test**

Add to `.claude/skills/release/test/release-helpers.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test, expect pass**

```bash
cd .claude/skills/release && npx vitest run test/release-helpers.test.ts && cd -
```

Expected: previous 7 tests + 1 fixture test = 8 tests pass.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/release/test/fixtures.ts .claude/skills/release/test/release-helpers.test.ts
git commit -m "release skill: tmp-repo fixture-builder for git helper tests"
```

---

## Task 5: Write `checkPreconditions` (TDD with fixtures)

**Files:**
- Modify: `.claude/skills/release/test/release-helpers.test.ts`
- Modify: `.claude/skills/release/lib/release-helpers.ts`

The helper takes an optional `cwd` parameter (defaulting to `process.cwd()`) so the tests can drive it without `process.chdir()`. This is a small departure from the spec's interface (which didn't show a `cwd` arg) — adding it for testability is the kind of *targeted improvement* the brainstorming process flagged as in-scope.

- [ ] **Step 1: Add the failing test cases to `test/release-helpers.test.ts`**

Append to the existing test file:

```ts
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
```

- [ ] **Step 2: Run the tests, expect import failures**

```bash
cd .claude/skills/release && npx vitest run test/release-helpers.test.ts && cd -
```

Expected: `checkPreconditions` import fails (function not yet exported).

- [ ] **Step 3: Add the type interface and a stub to `lib/release-helpers.ts`**

Append to `.claude/skills/release/lib/release-helpers.ts`:

```ts
import { execFileSync } from 'node:child_process';

export interface PreconditionReport {
  readonly ok: boolean;
  readonly head: {
    readonly sha: string;
    readonly branch: string;
  };
  readonly relativeToOriginMain: {
    readonly aheadBy: number;
    readonly canFastForward: boolean;
  };
  readonly workingTreeClean: boolean;
  readonly trackingRemoteUpToDate: boolean;
  readonly lastReleaseTag: string | null;
  readonly failures: readonly string[];
}

export interface CheckPreconditionsOptions {
  /** cwd for git invocations. Default: process.cwd(). */
  readonly cwd?: string;
}

/**
 * Verify the working tree is in a state where a release can proceed:
 *   1. `git fetch origin` succeeds
 *   2. Working tree is clean (no diff, no staged, no untracked)
 *   3. HEAD has origin/main as ancestor (FF possible)
 *   4. Local branch is up-to-date with its tracking remote
 *
 * Returns a structured report; does not throw on precondition failures
 * (those are recorded in `failures[]`). Throws only on unexpected git
 * errors (network, missing remote, etc.).
 */
export async function checkPreconditions(
  opts: CheckPreconditionsOptions = {},
): Promise<PreconditionReport> {
  const cwd = opts.cwd ?? process.cwd();
  const failures: string[] = [];

  const git = (args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] }).toString();

  // (1) Fetch first so origin refs are fresh.
  try {
    git(['fetch', 'origin', '--quiet']);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`git fetch origin failed: ${reason}`);
  }

  // HEAD info.
  const headSha = git(['rev-parse', 'HEAD']).trim();
  const headBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  // (2) Working tree clean: no unstaged diff, no staged diff, no untracked.
  let workingTreeClean = true;
  try {
    git(['diff', '--quiet']);
  } catch {
    workingTreeClean = false;
    failures.push('working tree has uncommitted (unstaged) changes');
  }
  try {
    git(['diff', '--cached', '--quiet']);
  } catch {
    workingTreeClean = false;
    failures.push('working tree has staged changes');
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard']).trim();
  if (untracked.length > 0) {
    workingTreeClean = false;
    failures.push(`working tree has untracked files: ${untracked.split('\n').slice(0, 3).join(', ')}${untracked.split('\n').length > 3 ? ', …' : ''}`);
  }

  // (3) FF over origin/main?
  let canFastForward = false;
  let aheadBy = 0;
  try {
    git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
    canFastForward = true;
    const aheadStr = git(['rev-list', '--count', 'origin/main..HEAD']).trim();
    aheadBy = Number(aheadStr) || 0;
  } catch {
    canFastForward = false;
    failures.push('HEAD diverges from origin/main (FF not possible — rebase or merge first)');
  }

  // (4) Local branch up-to-date with tracking remote.
  let trackingRemoteUpToDate = false;
  try {
    const upstream = git(['rev-parse', '--abbrev-ref', `${headBranch}@{u}`]).trim();
    const behindStr = git(['rev-list', '--count', `HEAD..${upstream}`]).trim();
    const behind = Number(behindStr) || 0;
    if (behind === 0) {
      trackingRemoteUpToDate = true;
    } else {
      failures.push(`branch ${headBranch} is behind ${upstream} by ${behind} commit(s) — pull first`);
    }
  } catch {
    // No upstream — treat as not-tracked. Don't fail; some flows ship from
    // a detached state. But surface as a warning failure for the operator.
    failures.push(`branch ${headBranch} has no upstream — set tracking with 'git push -u origin ${headBranch}' first`);
  }

  // (5) Last release tag (best-effort; null if no tags exist).
  let lastReleaseTag: string | null = null;
  try {
    lastReleaseTag = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']).trim() || null;
  } catch {
    lastReleaseTag = null;
  }

  return {
    ok: failures.length === 0,
    head: { sha: headSha, branch: headBranch },
    relativeToOriginMain: { aheadBy, canFastForward },
    workingTreeClean,
    trackingRemoteUpToDate,
    lastReleaseTag,
    failures,
  };
}
```

- [ ] **Step 4: Run the tests, expect pass**

```bash
cd .claude/skills/release && npx vitest run test/release-helpers.test.ts && cd -
```

Expected: previous 8 tests + 5 new tests = 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/release/lib/release-helpers.ts .claude/skills/release/test/release-helpers.test.ts
git commit -m "release skill: checkPreconditions (clean tree + FF + tracking up-to-date)"
```

---

## Task 6: Write `atomicPush` (TDD with fixtures)

**Files:**
- Modify: `.claude/skills/release/test/release-helpers.test.ts`
- Modify: `.claude/skills/release/lib/release-helpers.ts`

- [ ] **Step 1: Add the failing test cases**

Append to `.claude/skills/release/test/release-helpers.test.ts`:

```ts
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
      ).rejects.toThrow(/non-fast-forward|rejected/i);
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
```

- [ ] **Step 2: Run tests, expect import failure**

```bash
cd .claude/skills/release && npx vitest run test/release-helpers.test.ts && cd -
```

Expected: `atomicPush` import fails.

- [ ] **Step 3: Implement `atomicPush` in `lib/release-helpers.ts`**

Append to `.claude/skills/release/lib/release-helpers.ts`:

```ts
export interface AtomicPushOptions {
  readonly tag: string;
  readonly branch: string;
  /** cwd for git invocations. Default: process.cwd(). */
  readonly cwd?: string;
}

/**
 * Atomic push: HEAD to origin/main + HEAD to feature branch + annotated
 * tag, all in one --follow-tags RPC.
 *
 * DELIBERATE PRE-1.0 VELOCITY DECISION. Direct-to-main push (rather than
 * PR-merge) is intentional. Reasoning:
 *   - Solo-maintainer project; PRs add drag without catching real bugs
 *     (agent code-review already runs pre-commit)
 *   - CI on this project is brutally slow; PR + CI gate adds friction the
 *     project can't afford pre-1.0
 *   - Smoke (scripts/smoke-marketplace.sh) is the real release-blocking
 *     gate and runs locally before this function executes
 *
 * REVISIT AT 1.0 STABILIZATION. Once the project stabilizes, the case for
 * PR-merge / CI-as-second-gate / branch protection grows substantially:
 *   - Adopter base widens; CI catching regressions before tag-push protects them
 *   - Multi-contributor work becomes plausible; PR is established muscle
 *   - Branch protection on main becomes appropriate
 * When this happens, replace this function with a PR-merge flow and
 * remove this comment.
 *
 * Throws on push failure with git's stderr included. Local state (commit
 * and tag) is preserved.
 */
export async function atomicPush(opts: AtomicPushOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  try {
    execFileSync(
      'git',
      [
        'push',
        '--follow-tags',
        'origin',
        'HEAD:main',
        `HEAD:refs/heads/${opts.branch}`,
      ],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err) {
    const stderr =
      err instanceof Error && 'stderr' in err && err.stderr
        ? Buffer.isBuffer((err as { stderr: Buffer | string }).stderr)
          ? (err as { stderr: Buffer }).stderr.toString()
          : String((err as { stderr: string }).stderr)
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`atomicPush failed (tag=${opts.tag}, branch=${opts.branch}):\n${stderr}`);
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd .claude/skills/release && npx vitest run test/release-helpers.test.ts && cd -
```

Expected: previous 13 + 3 new = 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/release/lib/release-helpers.ts .claude/skills/release/test/release-helpers.test.ts
git commit -m "release skill: atomicPush (single --follow-tags RPC; pre-1.0 maturity comment)"
```

---

## Task 7: Add the CLI dispatcher (subcommands at module bottom)

**Files:**
- Modify: `.claude/skills/release/lib/release-helpers.ts`
- Create: `.claude/skills/release/test/dispatcher.test.ts`

The dispatcher lets `SKILL.md` invoke the helpers as `tsx lib/release-helpers.ts <subcommand> [args]`.

- [ ] **Step 1: Write the dispatcher test**

Create `.claude/skills/release/test/dispatcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRig } from './fixtures.js';

const HELPERS_TS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'lib',
  'release-helpers.ts',
);

function runHelper(args: readonly string[], cwd?: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', HELPERS_TS, ...args], {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      status: e.status ?? 1,
    };
  }
}

describe('CLI dispatcher', () => {
  it('validate-version: exits 0 on valid', () => {
    const r = runHelper(['validate-version', '0.9.0', 'v0.8.7']);
    expect(r.status).toBe(0);
  });

  it('validate-version: exits 1 on invalid with reason on stderr', () => {
    const r = runHelper(['validate-version', '0.8.6', 'v0.8.7']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/strictly greater/i);
  });

  it('check-preconditions: prints structured report and exits with appropriate code', () => {
    const rig = createRig();
    try {
      const r = runHelper(['check-preconditions'], rig.localPath);
      expect(r.status).toBe(0);
      // Stdout should contain a status line with HEAD info.
      expect(r.stdout).toMatch(/HEAD:/);
      expect(r.stdout).toMatch(/Working tree:/);
    } finally {
      rig.cleanup();
    }
  });

  it('unknown subcommand: exits 2 with stderr', () => {
    const r = runHelper(['nonsense-subcommand']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown subcommand/i);
  });
});
```

- [ ] **Step 2: Run tests, expect failure (dispatcher not yet implemented)**

```bash
cd .claude/skills/release && npx vitest run test/dispatcher.test.ts && cd -
```

Expected: tests fail because the dispatcher is missing — running the helper prints nothing useful or errors out.

- [ ] **Step 3: Append the dispatcher to `lib/release-helpers.ts`**

```ts
// ---------------------------------------------------------------------
// CLI dispatcher — invoked when this file is run directly via tsx.
// SKILL.md prose calls these subcommands.
// ---------------------------------------------------------------------

function formatPreconditionReport(report: PreconditionReport): string {
  const lines: string[] = [];
  lines.push(`HEAD: ${report.head.sha.slice(0, 7)} (${report.head.branch})`);
  lines.push(
    `Relative to origin/main: ${report.relativeToOriginMain.aheadBy} commits ahead, fast-forward ${report.relativeToOriginMain.canFastForward ? 'possible' : 'NOT possible'}`,
  );
  lines.push(`Working tree: ${report.workingTreeClean ? 'clean' : 'DIRTY'}`);
  lines.push(
    `Tracking remote: ${report.trackingRemoteUpToDate ? 'up-to-date' : 'NOT up-to-date'}`,
  );
  lines.push(`Last release: ${report.lastReleaseTag ?? '(no tags found)'}`);
  if (report.failures.length > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const f of report.failures) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}

async function dispatch(argv: readonly string[]): Promise<number> {
  const [subcommand, ...args] = argv;
  switch (subcommand) {
    case 'check-preconditions': {
      const report = await checkPreconditions();
      process.stdout.write(formatPreconditionReport(report) + '\n');
      return report.ok ? 0 : 1;
    }
    case 'validate-version': {
      const [version, lastTag] = args;
      if (!version || !lastTag) {
        process.stderr.write('usage: validate-version <version> <last-tag>\n');
        return 2;
      }
      const result = validateVersion(version, lastTag);
      if (!result.ok && result.reason) process.stderr.write(result.reason + '\n');
      return result.ok ? 0 : 1;
    }
    case 'atomic-push': {
      const [tag, branch] = args;
      if (!tag || !branch) {
        process.stderr.write('usage: atomic-push <tag> <branch>\n');
        return 2;
      }
      await atomicPush({ tag, branch });
      return 0;
    }
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand ?? '(none)'}\n`);
      return 2;
  }
}

// Run when invoked directly via tsx (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  dispatch(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
      process.exit(1);
    },
  );
}
```

- [ ] **Step 4: Run dispatcher tests, expect pass**

```bash
cd .claude/skills/release && npx vitest run test/dispatcher.test.ts && cd -
```

Expected: 4 dispatcher tests pass.

- [ ] **Step 5: Run the full vitest suite to confirm no regression**

```bash
cd .claude/skills/release && npx vitest run && cd -
```

Expected: 20 tests pass total (7 validateVersion + 1 fixture + 5 checkPreconditions + 3 atomicPush + 4 dispatcher).

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/release/lib/release-helpers.ts .claude/skills/release/test/dispatcher.test.ts
git commit -m "release skill: CLI dispatcher (subcommands for tsx invocation)"
```

---

## Task 8: Write SKILL.md prose (the operator-facing flow)

**Files:**
- Modify: `.claude/skills/release/SKILL.md`

This is operator-facing prose; no tests because the prose IS the operator UX. The flow drives the four pauses described in the spec.

- [ ] **Step 1: Replace the SKILL.md body with the full prose**

Open `.claude/skills/release/SKILL.md` and replace its body (preserve frontmatter from Task 1) with:

```markdown
---
name: release
description: Release the deskwork monorepo (bump → smoke → tag → push). Hard-gated procedure with operator pauses at version, post-bump diff, tag message, and final push. Project-internal — for monorepo maintainers, not adopters.
---

# Release

Ship a new version of the deskwork monorepo. Hard-gated. The skill runs preconditions, prompts for version, runs the smoke gate, prompts for tag message, asks for explicit confirmation, then atomic-pushes the commit + branch + tag in one operation.

## Pre-1.0 maturity stance

This skill pushes directly to `origin/main` (no PR-merge, no CI gate). Deliberate pre-1.0 velocity choice. Revisit at 1.0 stabilization — see `RELEASING.md` § "Maturity stance" and the JSDoc on `atomicPush` in `lib/release-helpers.ts`.

## Steps for the agent

The agent invokes the helper subcommands listed below and surfaces operator prompts at the four pause points. **No `--force` / `--skip-smoke` overrides — all gates are hard.**

### Pause 1 — Precondition + version

1. Run: `tsx .claude/skills/release/lib/release-helpers.ts check-preconditions`
2. If exit code is non-zero, surface the failure list and abort. Operator must fix the underlying state and re-run.
3. If exit code is 0, surface the report (HEAD, relative-to-origin/main, working-tree state, tracking-remote state, last release tag). Then prompt:

   ```
   What version? (must be > <last-release-tag>)
   >
   ```

4. Validate via: `tsx .claude/skills/release/lib/release-helpers.ts validate-version <version> <last-release-tag>`
5. On non-zero, surface the stderr reason and abort. Operator re-runs with a corrected version.

### Pause 2 — Post-bump diff review

1. Run: `npm run version:bump <version>` (the project's existing manifest-bump script — `tsx scripts/bump-version.ts`).
2. Show `git diff --stat`.
3. Show `git diff` (truncated to ~80 lines if large; operator can run the command themselves for the full diff).
4. Prompt:

   ```
   Commit as 'chore: release v<version>' and continue? [y/N]
   >
   ```

5. On `y`: `git commit -am "chore: release v<version>"`.
6. On `n`: abort. Bumped manifests stay in the working tree. Operator decides whether to revert (`git restore .`) or fix something and re-run.

### Pause 3 — Smoke + tag message

1. Run: `bash scripts/smoke-marketplace.sh` (output streamed to operator).
2. On smoke fail: abort. Surface tail of smoke log. Working-tree state preserved. Operator: fix the bug → `git commit --amend` → re-run.
3. On smoke pass: draft a tag message:
   - Default: subject of the most recent commit on the branch whose subject does NOT start with `chore: release ` (lookback up to 20 commits). Falls back to `deskwork v<version>`.
   - Show the default and prompt:

     ```
     Tag message? [default: <draft>]
     >
     ```

4. Operator types message or accepts default. Then: `git tag -a v<version> -m "<message>"`.

### Pause 4 — Final push confirmation

1. Check the published-tag gate:
   ```bash
   git ls-remote --tags origin v<version>
   ```
2. If non-empty: abort with: *"v<version> already exists on origin. Re-tagging silently mutates what adopters fetch on next update. Bump to v<next-patch> instead and re-run."* No override.
3. Surface the exact push command and what it will do:

   ```
   About to run:
     tsx .claude/skills/release/lib/release-helpers.ts atomic-push v<version> <current-branch>

   This pushes (in one --follow-tags RPC):
     - HEAD (<sha>) → origin/main
     - HEAD → origin/<current-branch>
     - tag v<version> → origin

   This is non-reversible after success: v<version> will be visible to
   adopters running '/plugin marketplace update deskwork'.

   Run push? [y/N]
   >
   ```

4. On `y`: `tsx .claude/skills/release/lib/release-helpers.ts atomic-push v<version> <current-branch>`.
5. On push success:
   - Run `gh release view v<version>` (the workflow may not have finished — show whatever is available; advise the operator to `gh run watch` for the workflow status).
   - Report the release URL.
6. On push fail: abort. Surface git's stderr. Local commit + tag intact. Operator can fix (e.g. fetch + rebase if origin/main moved) and re-run; the skill will detect the existing local tag.
7. On `n`: abort. Local state preserved.

## Helper subcommands

All helpers live in `.claude/skills/release/lib/release-helpers.ts` and are invoked via tsx:

| Subcommand | Purpose | Exit codes |
|---|---|---|
| `check-preconditions` | Verify clean tree, FF over origin/main, branch up-to-date. Prints status line. | 0 ok / 1 fail / 2 usage |
| `validate-version <ver> <last-tag>` | Pure semver tuple compare. Strictly greater required. | 0 ok / 1 fail (reason on stderr) / 2 usage |
| `atomic-push <tag> <branch>` | Single-RPC push: HEAD to origin/main, HEAD to branch, annotated tag. | 0 ok / 1 fail (git stderr surfaced) |

Tests live at `.claude/skills/release/test/`. Run via `cd .claude/skills/release && npx vitest run` (local-only; not in CI per project rules).
```

- [ ] **Step 2: Verify the prose renders**

Run: `cat .claude/skills/release/SKILL.md`
Expected: full skill body with frontmatter + sections.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/release/SKILL.md
git commit -m "release skill: SKILL.md operator-facing prose (4 pauses + helper reference)"
```

---

## Task 9: Manual integration smoke against a sandbox remote

**Files:**
- (no files modified)

This is a one-time end-to-end verification that the skill works against a real-but-sandboxed git environment. It's NOT automated (per project rules: no CI test infra). The plan documents the exact steps so the engineer running this can execute them by hand.

- [ ] **Step 1: Set up a sandbox copy of the repo**

```bash
SANDBOX_TMP=$(mktemp -d -t deskwork-release-smoke.XXXXXX)
git clone --bare "$(pwd)" "$SANDBOX_TMP/sandbox-origin.git"
git clone "$SANDBOX_TMP/sandbox-origin.git" "$SANDBOX_TMP/sandbox-clone"
cd "$SANDBOX_TMP/sandbox-clone"
git checkout -b sandbox-test
echo "smoke" > smoke-marker.md
git add smoke-marker.md
git commit -m "sandbox: marker commit"
```

Expected: working clone with one extra commit on `sandbox-test`.

- [ ] **Step 2: Run the helper subcommands by hand from the sandbox-clone dir**

```bash
tsx .claude/skills/release/lib/release-helpers.ts check-preconditions
```

Expected output: 5-line report; exit 0 (clean tree, FF possible, tracking up-to-date).

```bash
tsx .claude/skills/release/lib/release-helpers.ts validate-version 0.0.1 v0.0.0
```

Expected: exit 0.

```bash
tsx .claude/skills/release/lib/release-helpers.ts validate-version 0.0.0 v0.0.1
```

Expected: exit 1, stderr says "strictly greater".

- [ ] **Step 3: Smoke an atomic-push against the sandbox**

```bash
git tag -a v0.0.1-smoke -m "sandbox smoke"
tsx .claude/skills/release/lib/release-helpers.ts atomic-push v0.0.1-smoke sandbox-test
```

Expected: exit 0. Verify:

```bash
git -C "$SANDBOX_TMP/sandbox-origin.git" log --oneline main | head -3
git -C "$SANDBOX_TMP/sandbox-origin.git" tag -l 'v0.0.1*'
```

Expected: sandbox-clone's HEAD on `main`; tag `v0.0.1-smoke` present.

- [ ] **Step 4: Cleanup**

```bash
cd /Users/orion/work/deskwork-work/deskwork-plugin
rm -rf "$SANDBOX_TMP"
```

- [ ] **Step 5: Document the smoke result**

If anything failed, file an issue or fix in-place and re-run. If smoke passed, no commit needed (no files changed) — note "manual integration smoke verified" in the session notes.

---

## Task 10: Rewrite RELEASING.md

**Files:**
- Modify: `RELEASING.md`

Per the spec, RELEASING.md gets shorter: pointer to `/release` at top, architectural background sections survive, numbered procedure / re-tag advice are removed.

- [ ] **Step 1: Read the current RELEASING.md to identify sections to keep**

```bash
cat RELEASING.md
```

Sections to KEEP (architectural background — the *why*):
- "Vendor materialize mechanism"
- "What gets released"
- "Operator update path"
- "Pre-push hook (separate from releases)"

Sections to REMOVE:
- "Procedure" (the numbered 1-5 list)
- The `git tag -d` re-tag recovery advice

- [ ] **Step 2: Replace RELEASING.md with the rewritten version**

Write `RELEASING.md` (full replacement):

```markdown
## Releasing deskwork

The deskwork marketplace tracks the default branch of `audiocontrol-org/deskwork`. Tagged releases (`v0.1.0`, `v0.2.0`, …) give consumers a stable ref they can pin to via `/plugin marketplace add audiocontrol-org/deskwork#vX.Y.Z`. Without a tag, every consumer who runs `/plugin marketplace update deskwork` gets HEAD of `main`.

### To release: `/release`

The release ceremony is enshrined as the `/release` skill at `.claude/skills/release/`. Run that — it handles version validation, smoke, tagging, and the atomic push. The skill is hard-gated: no `--force`, no `--skip-smoke`. If a gate refuses, fix the underlying state.

The skill walks four operator decision points:

1. **Precondition + version** — clean tree, FF over origin/main, branch up-to-date. Operator types the new version; skill validates it as strictly greater than the last tag.
2. **Post-bump diff review** — operator confirms the manifest bump diff before commit.
3. **Smoke + tag message** — `scripts/smoke-marketplace.sh` runs as a hard gate; on pass, operator confirms the tag message.
4. **Final push confirmation** — skill prints the exact push command + what it will do; operator confirms; skill atomic-pushes commit + branch + tag in one `git push --follow-tags` RPC.

The skill refuses to re-tag a published version. Recovery from a botched release is to bump-patch (e.g. `v0.9.0` broken → ship `v0.9.1`).

### Maturity stance

The skill currently pushes directly to `origin/main` (no PR-merge, no CI-as-second-gate). This is a **deliberate pre-1.0 velocity decision**:

- Solo-maintainer project — PR-as-second-reviewer mostly adds drag without catching real bugs the agent code-review hasn't already caught.
- CI on this project is brutally slow; PR + CI gate adds friction we can't afford pre-1.0.
- The local smoke (`scripts/smoke-marketplace.sh`) is the real release-blocking gate.

**Revisit at 1.0 stabilization.** Once the project stabilizes, the case for PR-merge / CI-as-second-gate / branch protection grows substantially: adopter base widens; multi-contributor work becomes plausible; branch protection becomes appropriate. The release skill (specifically `atomicPush` in `lib/release-helpers.ts`) is the place to swap in a PR-merge flow when that happens. The maturity comment on `atomicPush` itself names the trigger.

### Vendor materialize mechanism

Each plugin tree under `plugins/<name>/vendor/` holds committed symlinks pointing at the corresponding workspace package under `packages/<pkg>/`. In dev (a clone of the repo with `npm install` run at the root), the symlinks resolve correctly — edits to `packages/core/src/*.ts` are picked up immediately by anything reading `plugins/<plugin>/vendor/core/...`. This is the inner-loop convenience.

At release time, those symlinks have to become real directory copies, because the marketplace install path copies `plugins/<name>/` into the operator's plugin cache **without** the surrounding `packages/` tree. A symlink whose relative target traverses out of the copied subtree (`../../../packages/core`) resolves to nothing on the operator's side.

The release workflow handles this via `scripts/materialize-vendor.sh`, run after the test suite passes and before the tag is finalized:

1. For each `(plugin, vendored-package)` pair, replace the symlink at `plugins/<plugin>/vendor/<pkg>` with an `rsync`-driven directory copy of `packages/<pkg>/` (excluding `node_modules`, `dist`, `.turbo`, `*.tsbuildinfo`).
2. Verify byte-for-byte parity via `diff -r` between the source `packages/<pkg>` and the materialized vendor copy — plus mode-bit verification (Phase 23 / Issue #78). Any drift fails the workflow.
3. The `/release` skill's atomic push triggers the workflow which then runs materialize and creates the GitHub release.

Adopters cloning a `v*` ref get a tree where `plugins/<plugin>/vendor/<pkg>` is a real directory, identical to `packages/<pkg>` at the time of release. First-run `npm install --omit=dev` (triggered by the bin wrapper, see plugin READMEs) then links the vendored packages into `node_modules` and the plugin runs from source via `tsx`.

### What gets released

A deskwork release is a git tag on `main`. Consumers fetch the tagged commit when they pin their marketplace. The materialized vendor tree means a fresh `claude plugin install` against `audiocontrol-org/deskwork#v0.2.0` lands on a self-contained tree that runs end-to-end after a one-time first-run `npm install` driven by the plugin's bin wrapper.

No npm registry involvement. No release-artifact attachments. The git tag IS the release.

### Operator update path

Operators using deskwork in the wild get updates by:

```
/plugin marketplace update deskwork
/reload-plugins
```

Or pin to a specific release at install time:

```
/plugin marketplace add audiocontrol-org/deskwork#v0.2.0
```

Both flows are documented in the root `README.md`.

### Pre-push hook (separate from releases)

A pre-push hook at `.husky/pre-push` runs the workspace test suite and validates the plugin manifests. It does NOT rebuild bundles — bundles were retired in Phase 23b in favor of the source-shipped + on-startup-build model documented in the plugin READMEs.

Contributors get the hook installed automatically when they `npm install` (via husky's `prepare` script). If the hook fails, the push fails — fix the underlying issue and push again.
```

- [ ] **Step 3: Verify rendering**

```bash
cat RELEASING.md | head -30
```

Expected: title, three-paragraph "To release: /release" pointer, then the surviving sections.

- [ ] **Step 4: Commit**

```bash
git add RELEASING.md
git commit -m "RELEASING.md: rewrite — point at /release skill, add maturity stance, drop numbered procedure"
```

---

## Task 11: Run the workspace tests one last time + final commit boundary

**Files:**
- (no new files)

- [ ] **Step 1: Run the skill's full test suite**

```bash
cd .claude/skills/release && npx vitest run && cd -
```

Expected: 20 tests pass.

- [ ] **Step 2: Run the workspace tests (regression check)**

```bash
npm --workspace packages/core test
npm --workspace packages/cli test
npm --workspace packages/studio test
```

Expected: 339 + 147 + 197 = 683 pass.

- [ ] **Step 3: Re-run the marketplace smoke against committed HEAD**

```bash
bash scripts/smoke-marketplace.sh
```

Expected: exit 0; full route + asset coverage; both plugins materialize correctly.

- [ ] **Step 4: Verify the skill loads via the Claude Code harness**

The skill should be visible when Claude Code lists project skills. Confirm by checking the file is at the expected location:

```bash
ls -la .claude/skills/release/SKILL.md
```

Expected: file exists, ~100+ lines (the full prose).

- [ ] **Step 5: No final commit needed if Steps 1–4 passed**

If anything failed, the fix goes in a new commit before declaring the implementation complete.

---

## Task 12: First canonical run — ship v0.9.0 via `/release`

**Files:**
- (no new files; this task EXECUTES the skill)

Per the spec: "v0.9.0 is the first canonical run of `/release`. No 'ship v0.9.0 manually then build the skill' exception."

**This task involves shared/destructive operations.** The skill's hard gates handle the safety; the engineer just walks through the four pauses.

- [ ] **Step 1: Confirm the working tree is clean and ready**

```bash
git status
```

Expected: clean working tree on `feature/deskwork-plugin`.

- [ ] **Step 2: Sync local refs**

```bash
git fetch origin
```

- [ ] **Step 3: Invoke the skill**

Type `/release` in the Claude Code session.

The skill walks through:
1. **Pause 1** — confirms preconditions, prompts for version. Type `0.9.0`.
2. **Pause 2** — runs `npm run version:bump 0.9.0`, shows the diff. Confirm `y`.
3. **Pause 3** — runs `bash scripts/smoke-marketplace.sh` (~30-60s). On pass, drafts a tag message. Accept default or override with something like `"deskwork v0.9.0 — Phase 23 source-shipped + concurrency hardening + /release skill"`.
4. **Pause 4** — surfaces the push command. Confirm `y`.

Skill atomic-pushes commit + branch + tag. Reports release URL.

- [ ] **Step 4: Verify the workflow**

```bash
gh run watch
```

Expected: release.yml workflow runs, materializes vendor, creates the release.

- [ ] **Step 5: Verify the published release**

```bash
gh release view v0.9.0
```

Expected: release shows the auto-generated notes; tag points at the merged commit.

- [ ] **Step 6: Verify a fresh adopter install gets the new version**

In a separate Claude Code session (or as a smoke against the published marketplace):

```
/plugin marketplace update deskwork
/reload-plugins
deskwork --version
```

Expected: `0.9.0` reported by the CLI.

- [ ] **Step 7: Close issues fixed by the release**

The blocker fixes shipping in v0.9.0 close issues #76, #77, #78, #79. The release commit message references them via "Closes #76, #77, #78, #79." — GitHub auto-closes them on merge.

Verify:

```bash
gh issue list --state closed --search "v0.9.0"
```

Expected: #76, #77, #78, #79 all closed.

---

## Self-Review

I scanned the spec ([`docs/superpowers/specs/2026-04-29-release-skill-design.md`](../specs/2026-04-29-release-skill-design.md) v2) against this plan:

- ✅ **File layout** (Architecture section): Tasks 1–2 create `.claude/skills/release/{SKILL.md, lib/, test/, vitest.config.ts, package.json}`.
- ✅ **Operator-facing flow / 4 pauses** (Pauses 1–4): Task 8's SKILL.md prose covers all four pauses with the exact prompts the spec specifies.
- ✅ **Helper contracts** (`checkPreconditions`, `validateVersion`, `atomicPush` + types): Tasks 3, 5, 6 implement each with TDD.
- ✅ **Failure modes / re-tag prevention**: SKILL.md covers re-tag prevention via `git ls-remote --tags`. Local-tag re-use case is in the SKILL.md prose. Push-fail recovery hint is in the prose.
- ✅ **RELEASING.md rewrite** (Task 10): pointer + surviving sections + maturity stance + removed numbered procedure.
- ✅ **Maturity comment** (3 places): JSDoc on `atomicPush` (Task 6), SKILL.md "Pre-1.0 maturity stance" (Task 8), RELEASING.md "Maturity stance" (Task 10).
- ✅ **Testing** (vitest unit tests + manual smoke): Tasks 3-7 cover unit tests; Task 9 covers manual smoke.
- ✅ **v0.9.0 sequencing** (skill first; v0.9.0 is the first canonical run): Task 12 IS the first run.
- ✅ **Open questions resolved during planning:**
  - `npm run version:bump` exists at `tsx scripts/bump-version.ts` (verified before drafting; SKILL.md references the npm script).
  - Helper module's runtime deps: only node stdlib + tsx + vitest (vitest is a devDep in the skill's local package.json; tsx is in the workspace root).
  - Vitest config: standalone at `.claude/skills/release/vitest.config.ts` with its own local `node_modules` (Task 2).

**Placeholder scan:** No "TBD", no "implement later", no "add appropriate error handling". Each step has concrete code or commands. Test cases include actual assertions, not "test the function".

**Type consistency:** `validateVersion`, `checkPreconditions`, `atomicPush` and their option/return types use the same names across Tasks 3, 5, 6, 7, 8 (`PreconditionReport`, `ValidateVersionResult`, `AtomicPushOptions`, `CheckPreconditionsOptions`).

**One in-scope improvement over the spec:** added an optional `cwd` parameter to `checkPreconditions` and `atomicPush` so the helpers are testable without `process.chdir()`. The spec's interface didn't show `cwd`; this is the kind of testability-driven refinement the writing-plans skill explicitly endorses ("targeted improvements as part of the design — the way a good developer improves code they're working in").
