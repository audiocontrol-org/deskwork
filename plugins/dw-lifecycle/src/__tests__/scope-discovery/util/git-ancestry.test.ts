/**
 * Real-git fixture tests for `checkAncestry`.
 *
 * Per AUDIT-20260602-41/-43: the production helper was being shipped
 * with bare `catch { return false; }` and zero coverage; only the DI
 * stub in the gate tests was exercised. This file binds the helper's
 * three documented states to actual git behavior via mkdtemp + git init.
 *
 * States covered:
 *   - exit 0 (ancestor)        → true
 *   - exit 1 (not ancestor)    → false
 *   - exit > 1 (git error)     → true (fail-closed; AUDIT-41 fix)
 *   - non-git directory        → true (fail-closed; bare catch path)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkAncestry,
  ancestryAsGateBoolean,
  ancestryAsBarrageTip,
  pickFallbackBaseline,
  type PickFallbackBaselineDeps,
} from '../../../scope-discovery/util/git-ancestry.js';

function git(repoRoot: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Deterministic identity for the fixture; CI/local don't need to
      // match the operator's git config.
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();
}

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'git-ancestry-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Build a minimal repo with:
 *
 *   A → B → C (main)
 *        \
 *         → D (diverged)
 *
 * Returns SHAs for all four commits.
 */
function makeRepoWithDivergence(name: string): {
  repoRoot: string;
  a: string;
  b: string;
  c: string;
  d: string;
} {
  const repoRoot = join(workDir, name);
  mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, 'init', '--initial-branch=main');
  writeFileSync(join(repoRoot, 'a.txt'), 'a');
  git(repoRoot, 'add', 'a.txt');
  git(repoRoot, 'commit', '-m', 'A');
  const a = git(repoRoot, 'rev-parse', 'HEAD');
  writeFileSync(join(repoRoot, 'b.txt'), 'b');
  git(repoRoot, 'add', 'b.txt');
  git(repoRoot, 'commit', '-m', 'B');
  const b = git(repoRoot, 'rev-parse', 'HEAD');
  writeFileSync(join(repoRoot, 'c.txt'), 'c');
  git(repoRoot, 'add', 'c.txt');
  git(repoRoot, 'commit', '-m', 'C');
  const c = git(repoRoot, 'rev-parse', 'HEAD');
  // Diverge: branch off A, add a new commit, leave HEAD on the diverged branch.
  git(repoRoot, 'checkout', a);
  git(repoRoot, 'checkout', '-b', 'diverged');
  writeFileSync(join(repoRoot, 'd.txt'), 'd');
  git(repoRoot, 'add', 'd.txt');
  git(repoRoot, 'commit', '-m', 'D');
  const d = git(repoRoot, 'rev-parse', 'HEAD');
  return { repoRoot, a, b, c, d };
}

describe('checkAncestry — tri-state real-git fixture (AUDIT-20260602-43/-45)', () => {
  it('returns `ancestor` when tip IS an ancestor of HEAD (exit 0)', () => {
    const { repoRoot, a } = makeRepoWithDivergence('ancestor');
    // HEAD is on `diverged` branch which descends from A.
    expect(checkAncestry({ repoRoot, tip: a })).toBe('ancestor');
  });

  it('returns `not-ancestor` when tip is NOT an ancestor of HEAD (exit 1)', () => {
    const { repoRoot, b } = makeRepoWithDivergence('not-ancestor');
    // HEAD is on `diverged`; B lives on main and is not reachable from HEAD.
    expect(checkAncestry({ repoRoot, tip: b })).toBe('not-ancestor');
  });

  it('returns `not-ancestor` when tip is a sibling-branch tip (the canonical post-reset scenario)', () => {
    const { repoRoot, c } = makeRepoWithDivergence('sibling');
    // HEAD is on `diverged`; C is main's tip, not in diverged's history.
    expect(checkAncestry({ repoRoot, tip: c })).toBe('not-ancestor');
  });

  // AUDIT-20260602-45 fix: the helper used to collapse "git errored"
  // into the same boolean as "tip is an ancestor" (return `true`),
  // which was fail-closed for the gate but fail-OPEN for implement-hook.
  // Tri-state forces each caller to handle `unknown` explicitly.
  it('returns `unknown` when tip ref does not exist (AUDIT-45)', () => {
    const { repoRoot } = makeRepoWithDivergence('bad-ref');
    expect(
      checkAncestry({ repoRoot, tip: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }),
    ).toBe('unknown');
  });

  it('returns `unknown` when tip is a malformed SHA', () => {
    const { repoRoot } = makeRepoWithDivergence('malformed');
    expect(checkAncestry({ repoRoot, tip: 'not-a-sha-at-all' })).toBe('unknown');
  });

  it('returns `unknown` when repoRoot is not a git repository (git exits with status > 1)', () => {
    const nonGitRoot = join(workDir, 'no-git');
    mkdirSync(nonGitRoot, { recursive: true });
    expect(
      checkAncestry({ repoRoot: nonGitRoot, tip: '1234567890abcdef' }),
    ).toBe('unknown');
  });

  it('returns `unknown` when repoRoot does not exist (spawn fails)', () => {
    expect(
      checkAncestry({
        repoRoot: join(workDir, 'nonexistent-path-shouldnt-be-here'),
        tip: '1234567890abcdef',
      }),
    ).toBe('unknown');
  });

  // Regression-lock for the working-code invariant per Option D.
  it('regression-lock: exit-0 ancestor case still returns `ancestor`', () => {
    const { repoRoot, a, b } = makeRepoWithDivergence('regression-ancestor');
    // Switch HEAD to main (where B is the tip; A is B's parent).
    git(repoRoot, 'checkout', 'main');
    git(repoRoot, 'checkout', b);
    expect(checkAncestry({ repoRoot, tip: a })).toBe('ancestor');
  });
});

// AUDIT-20260602-47: the tri-state refactor's whole point is that each
// caller picks its own `unknown` disposition at the call site. The two
// collapse arrows are extracted as named pure functions so each
// safety direction is testable without going through the full CLI shim.
// These tests pin the call-site dispositions; together with the
// helper-isolation tests above, they cover the full integration path
// the production CLI shims walk.
describe('ancestryAsGateBoolean — commit-msg gate collapse (AUDIT-47)', () => {
  // Gate's library treats `true` as on-same-history → refuse-marker-stale.
  // Safe direction on unknown is REFUSE; map ancestor + unknown → true.
  it('maps `ancestor` → true (refuse-marker-stale path)', () => {
    expect(ancestryAsGateBoolean('ancestor')).toBe(true);
  });

  it('maps `not-ancestor` → false (allow-marker-diverged-history path)', () => {
    expect(ancestryAsGateBoolean('not-ancestor')).toBe(false);
  });

  // Critical regression-lock for AUDIT-45: unknown must refuse, not allow.
  // A git error during ancestry check must NOT silently allow the commit.
  it('maps `unknown` → true (REFUSE; the AUDIT-45 fail-closed fix)', () => {
    expect(ancestryAsGateBoolean('unknown')).toBe(true);
  });
});

describe('ancestryAsBarrageTip — implement-hook collapse (AUDIT-47)', () => {
  // implement-hook trusts a non-null tip as the baseline. Walking an
  // unverified tip means walking main's shipped commits as "new diff."
  // Safe direction on unknown is DROP the tip; map only ancestor → tip.

  it('maps `ancestor` → rawTip (trust the baseline)', () => {
    expect(ancestryAsBarrageTip('ancestor', 'aabbccdd')).toBe('aabbccdd');
  });

  it('maps `ancestor` + null rawTip → null (no marker to trust)', () => {
    expect(ancestryAsBarrageTip('ancestor', null)).toBe(null);
  });

  it('maps `not-ancestor` → null (fall back to HEAD~10 baseline)', () => {
    expect(ancestryAsBarrageTip('not-ancestor', 'aabbccdd')).toBe(null);
  });

  // Critical regression-lock for AUDIT-45: the OPPOSITE safety direction
  // from the gate's collapse. Unknown must NOT trust the tip — that was
  // the fail-open bug AUDIT-45 named.
  it('maps `unknown` → null (DROP the tip; the AUDIT-45 fail-closed fix)', () => {
    expect(ancestryAsBarrageTip('unknown', 'aabbccdd')).toBe(null);
  });
});

// AUDIT-20260602-39: the `HEAD~10..HEAD` fallback for the audited-diff
// helper blew up on post-merge-from-main feature branches — HEAD~10
// crossed the merge boundary, the diff exceeded execFileSync's maxBuffer,
// gitDiff silently returned ''. Tests the fallback-picker that
// constrains the baseline to whichever of `merge-base HEAD origin/main`
// and `HEAD~10` is closer to HEAD.
function makeBaselineDeps(opts: {
  mergeBase?: string | null;
  relHead?: string | null;
  ancestors?: ReadonlyArray<[string, string]>;
}): PickFallbackBaselineDeps {
  const ancestorPairs = new Set(
    (opts.ancestors ?? []).map(([a, b]) => `${a}|${b}`),
  );
  return {
    resolveMergeBase: () => opts.mergeBase ?? null,
    resolveRelativeHead: () => opts.relHead ?? null,
    isAncestorOf: (tip, descendant) => ancestorPairs.has(`${tip}|${descendant}`),
  };
}

describe('pickFallbackBaseline — bounded post-merge baseline (AUDIT-39)', () => {
  it('returns relHead when mergeBase is its ancestor (relHead is closer to HEAD)', () => {
    // mergeBase ← relHead ← HEAD chain.
    const result = pickFallbackBaseline(
      makeBaselineDeps({
        mergeBase: 'mb',
        relHead: 'h10',
        ancestors: [['mb', 'h10']],
      }),
    );
    expect(result).toBe('h10');
  });

  it('returns mergeBase when relHead is its ancestor (mergeBase is closer to HEAD)', () => {
    // Long-lived branch case: HEAD~10 is on the OTHER side of the merge.
    // relHead ← mergeBase ← HEAD; mergeBase is closer.
    const result = pickFallbackBaseline(
      makeBaselineDeps({
        mergeBase: 'mb',
        relHead: 'h10',
        ancestors: [['h10', 'mb']],
      }),
    );
    expect(result).toBe('mb');
  });

  it('prefers mergeBase on tie (neither ancestor of the other)', () => {
    const result = pickFallbackBaseline(
      makeBaselineDeps({
        mergeBase: 'mb',
        relHead: 'h10',
        ancestors: [], // neither is an ancestor of the other
      }),
    );
    expect(result).toBe('mb');
  });

  it('returns mergeBase when relHead is unavailable (shallow / fresh repo)', () => {
    const result = pickFallbackBaseline(
      makeBaselineDeps({ mergeBase: 'mb', relHead: null }),
    );
    expect(result).toBe('mb');
  });

  it('returns relHead when mergeBase is unavailable (no upstream ref)', () => {
    const result = pickFallbackBaseline(
      makeBaselineDeps({ mergeBase: null, relHead: 'h10' }),
    );
    expect(result).toBe('h10');
  });

  it('returns null when neither resolves (caller must handle)', () => {
    const result = pickFallbackBaseline(
      makeBaselineDeps({ mergeBase: null, relHead: null }),
    );
    expect(result).toBe(null);
  });

  it('respects custom upstreamRef and maxLookback options', () => {
    let observedUpstream = '';
    let observedLookback = -1;
    const result = pickFallbackBaseline(
      {
        resolveMergeBase: (ref) => {
          observedUpstream = ref;
          return 'mb';
        },
        resolveRelativeHead: (n) => {
          observedLookback = n;
          return 'h5';
        },
        isAncestorOf: () => false,
      },
      { upstreamRef: 'origin/release-x', maxLookback: 5 },
    );
    expect(observedUpstream).toBe('origin/release-x');
    expect(observedLookback).toBe(5);
    expect(result).toBe('mb'); // tie-break to mergeBase
  });

  // Live repro from the 2026-06-02 v0.35.0 release attempt: feature
  // branch merged origin/main; HEAD~10 landed on the main side; the
  // bounded helper should pick the merge-base instead.
  it('post-merge-from-main scenario: picks mergeBase (the branch-point), not HEAD~10', () => {
    // Topology: HEAD~10 lives on main's side of the merge; mergeBase
    // is the actual divergence point (closer to HEAD than HEAD~10).
    const result = pickFallbackBaseline(
      makeBaselineDeps({
        mergeBase: 'branch-point',
        relHead: 'main-side',
        ancestors: [['main-side', 'branch-point']],
      }),
    );
    expect(result).toBe('branch-point');
  });
});

// AUDIT-20260602-52: ensure the two collapses have OPPOSITE safety
// directions on `unknown`. This invariant is the load-bearing reason
// the tri-state exists; a future edit that collapsed both arrows to
// the same direction would silently reintroduce the AUDIT-45 bug.
describe('ancestry collapses — inverse-safety invariant (AUDIT-52)', () => {
  it('on `unknown`, the gate refuses (true) but implement-hook drops the tip (null)', () => {
    expect(ancestryAsGateBoolean('unknown')).toBe(true);
    expect(ancestryAsBarrageTip('unknown', 'some-tip')).toBe(null);
  });

  it('the two collapse arrows have OPPOSITE truthiness on `unknown` (the load-bearing invariant)', () => {
    const gateOnUnknown = ancestryAsGateBoolean('unknown');
    const barrageOnUnknown = ancestryAsBarrageTip('unknown', 'some-tip');
    // Gate says "yes, treat as same-history" (true → refuse).
    // Barrage says "no, this tip is not trustworthy" (null → re-baseline).
    expect(gateOnUnknown).toBe(true);
    expect(barrageOnUnknown).toBe(null);
    // Truthiness flip is the invariant.
    expect(!!gateOnUnknown).not.toBe(!!barrageOnUnknown);
  });
});

