/**
 * Phase 22 Task 2 (#399 Friction 2) — tests for the audited-diff helper.
 *
 * The pure-function design lets each scenario inject the git outputs
 * directly without needing a real git fixture. The four scenarios:
 *
 * A) commit-range non-empty                   → returns commit-range diff
 * B) commit-range empty + staged non-empty    → returns staged diff
 * C) all empty except worktree (unstaged)     → returns worktree diff
 * D) all three empty                          → returns empty + source='empty'
 */

import { describe, it, expect } from 'vitest';
import {
  computeAuditedDiff,
  EMPTY_DIFF_CURE_MESSAGE,
} from '../../../scope-discovery/promote-findings/audited-diff.js';

function makeDeps(opts: {
  range?: string;
  cached?: string;
  worktree?: string;
}): {
  gitDiffRange: (r: string) => string;
  gitDiffCached: () => string;
  gitDiffWorktree: () => string;
} {
  return {
    gitDiffRange: () => opts.range ?? '',
    gitDiffCached: () => opts.cached ?? '',
    gitDiffWorktree: () => opts.worktree ?? '',
  };
}

describe('computeAuditedDiff — Phase 22 Task 2 (#399 Friction 2)', () => {
  it('A) returns commit-range diff when the commit range is non-empty', () => {
    const result = computeAuditedDiff({
      range: 'aaa..bbb',
      deps: makeDeps({ range: 'diff --git a/x b/x\n+touch\n' }),
    });
    expect(result.source).toBe('commit-range');
    expect(result.diff).toContain('+touch');
  });

  it('B) falls back to staged diff when commit range is empty', () => {
    const result = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: makeDeps({
        range: '',
        cached: 'diff --git a/y b/y\n+staged-line\n',
      }),
    });
    expect(result.source).toBe('staged');
    expect(result.diff).toContain('+staged-line');
  });

  it('C) falls back to unstaged worktree diff when commit range AND staged are empty', () => {
    const result = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: makeDeps({
        range: '',
        cached: '',
        worktree: 'diff --git a/z b/z\n+worktree-edit\n',
      }),
    });
    expect(result.source).toBe('unstaged');
    expect(result.diff).toContain('+worktree-edit');
  });

  it('D) returns empty + source=`empty` when all three sources are empty', () => {
    const result = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: makeDeps({}),
    });
    expect(result.source).toBe('empty');
    expect(result.diff).toBe('');
  });

  // Whitespace-only diffs count as empty — git can produce a
  // header-only output in edge cases (e.g. mode-bit changes with no
  // content delta). The fallback should still fire.
  it('treats whitespace-only commit-range diff as empty (falls back to staged)', () => {
    const result = computeAuditedDiff({
      range: 'aaa..bbb',
      deps: makeDeps({
        range: '   \n\n  \t  \n',
        cached: 'diff --git a/y b/y\n+real-staged-content\n',
      }),
    });
    expect(result.source).toBe('staged');
    expect(result.diff).toContain('+real-staged-content');
  });

  it('treats whitespace-only staged diff as empty (falls back to worktree)', () => {
    const result = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: makeDeps({
        range: '',
        cached: ' \n\n ',
        worktree: 'diff --git a/z b/z\n+real-worktree-content\n',
      }),
    });
    expect(result.source).toBe('unstaged');
    expect(result.diff).toContain('+real-worktree-content');
  });

  it('does not consult staged or worktree when commit range is non-empty (call ordering)', () => {
    let stagedCalls = 0;
    let worktreeCalls = 0;
    const result = computeAuditedDiff({
      range: 'aaa..bbb',
      deps: {
        gitDiffRange: () => 'diff --git a/x b/x\n+content\n',
        gitDiffCached: () => {
          stagedCalls += 1;
          return 'staged would have something';
        },
        gitDiffWorktree: () => {
          worktreeCalls += 1;
          return 'worktree would have something';
        },
      },
    });
    expect(result.source).toBe('commit-range');
    expect(stagedCalls).toBe(0);
    expect(worktreeCalls).toBe(0);
  });

  it('does not consult worktree when staged is non-empty (call ordering)', () => {
    let worktreeCalls = 0;
    const result = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: {
        gitDiffRange: () => '',
        gitDiffCached: () => 'diff --git a/y b/y\n+staged-content\n',
        gitDiffWorktree: () => {
          worktreeCalls += 1;
          return 'worktree would have something';
        },
      },
    });
    expect(result.source).toBe('staged');
    expect(worktreeCalls).toBe(0);
  });
});

describe('EMPTY_DIFF_CURE_MESSAGE — operator-facing refusal text', () => {
  it('names all three checked sources in the cure', () => {
    expect(EMPTY_DIFF_CURE_MESSAGE).toContain('commit range');
    expect(EMPTY_DIFF_CURE_MESSAGE).toContain('staged');
    expect(EMPTY_DIFF_CURE_MESSAGE).toContain('working tree');
  });

  it('names a corrective action operators can take', () => {
    expect(EMPTY_DIFF_CURE_MESSAGE).toMatch(/git add|stage/i);
    expect(EMPTY_DIFF_CURE_MESSAGE).toMatch(/commit/i);
  });

  it('names the #399 framing (refusing prevents barrage confabulation)', () => {
    expect(EMPTY_DIFF_CURE_MESSAGE).toContain('#399');
    expect(EMPTY_DIFF_CURE_MESSAGE).toMatch(/fabricat|confabulat/i);
  });
});
