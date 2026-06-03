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
  buildTooLargeCure,
  type DiffCallResult,
  type ComputeAuditedDiffDeps,
} from '../../../scope-discovery/promote-findings/audited-diff.js';

/**
 * Helper: each layer can be supplied as either a plain string (the
 * common case — gets wrapped as `{ ok: true, diff }`) or as a
 * `DiffCallResult` (lets tests inject `{ ok: false, kind: 'too-large' }`
 * for the maxBuffer-overflow case).
 */
type DiffSource = string | DiffCallResult;
function toResult(src: DiffSource | undefined): DiffCallResult {
  if (src === undefined) return { ok: true, diff: '' };
  if (typeof src === 'string') return { ok: true, diff: src };
  return src;
}

function makeDeps(opts: {
  range?: DiffSource;
  cached?: DiffSource;
  worktree?: DiffSource;
}): ComputeAuditedDiffDeps {
  return {
    gitDiffRange: () => toResult(opts.range),
    gitDiffCached: () => toResult(opts.cached),
    gitDiffWorktree: () => toResult(opts.worktree),
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
        gitDiffRange: () => ({ ok: true, diff: 'diff --git a/x b/x\n+content\n' }),
        gitDiffCached: () => {
          stagedCalls += 1;
          return { ok: true, diff: 'staged would have something' };
        },
        gitDiffWorktree: () => {
          worktreeCalls += 1;
          return { ok: true, diff: 'worktree would have something' };
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
        gitDiffRange: () => ({ ok: true, diff: '' }),
        gitDiffCached: () => ({ ok: true, diff: 'diff --git a/y b/y\n+staged-content\n' }),
        gitDiffWorktree: () => {
          worktreeCalls += 1;
          return { ok: true, diff: 'worktree would have something' };
        },
      },
    });
    expect(result.source).toBe('staged');
    expect(worktreeCalls).toBe(0);
  });
});

// AUDIT-20260603-03: the pre-fix code silently swallowed maxBuffer
// overflow into `''` and produced the EMPTY_DIFF_CURE_MESSAGE (which
// reads "no novel work to audit" — actively wrong; there IS novel work,
// it just overflowed). Each layer now signals overflow via `ok: false`;
// computeAuditedDiff surfaces a distinct `'too-large'` source so the
// caller produces the correct cure.
describe('computeAuditedDiff — maxBuffer-overflow classification (AUDIT-20260603-03)', () => {
  it('commit-range overflow → source `too-large`, tooLargeLayer=`commit-range`', () => {
    const result = computeAuditedDiff({
      range: 'aaa..bbb',
      deps: makeDeps({
        range: { ok: false, kind: 'too-large' },
        // staged + worktree have content; they should NOT be consulted.
        cached: 'should not be consulted',
        worktree: 'should not be consulted',
      }),
    });
    expect(result.source).toBe('too-large');
    expect(result.tooLargeLayer).toBe('commit-range');
    expect(result.diff).toBe('');
  });

  it('staged overflow → source `too-large`, tooLargeLayer=`staged`', () => {
    const result = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: makeDeps({
        range: '', // commit range empty
        cached: { ok: false, kind: 'too-large' },
        worktree: 'should not be consulted',
      }),
    });
    expect(result.source).toBe('too-large');
    expect(result.tooLargeLayer).toBe('staged');
  });

  it('unstaged overflow → source `too-large`, tooLargeLayer=`unstaged`', () => {
    const result = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: makeDeps({
        range: '',
        cached: '',
        worktree: { ok: false, kind: 'too-large' },
      }),
    });
    expect(result.source).toBe('too-large');
    expect(result.tooLargeLayer).toBe('unstaged');
  });

  it('short-circuits on first overflow (no consultation of later layers)', () => {
    let cachedCalls = 0;
    let worktreeCalls = 0;
    const result = computeAuditedDiff({
      range: 'aaa..bbb',
      deps: {
        gitDiffRange: () => ({ ok: false, kind: 'too-large' }),
        gitDiffCached: () => {
          cachedCalls += 1;
          return { ok: true, diff: '' };
        },
        gitDiffWorktree: () => {
          worktreeCalls += 1;
          return { ok: true, diff: '' };
        },
      },
    });
    expect(result.source).toBe('too-large');
    expect(cachedCalls).toBe(0);
    expect(worktreeCalls).toBe(0);
  });

  it('does NOT collapse `too-large` into `empty` (the AUDIT-39/AUDIT-03 regression-lock)', () => {
    // Pre-fix, the helpers returned '' on maxBuffer and the source
    // was 'empty'. This test pins the new distinction so a future
    // edit can't accidentally re-collapse the two states.
    const overflowResult = computeAuditedDiff({
      range: 'aaa..bbb',
      deps: makeDeps({
        range: { ok: false, kind: 'too-large' },
      }),
    });
    expect(overflowResult.source).toBe('too-large');
    expect(overflowResult.source).not.toBe('empty');

    const trulyEmptyResult = computeAuditedDiff({
      range: 'aaa..aaa',
      deps: makeDeps({}),
    });
    expect(trulyEmptyResult.source).toBe('empty');
    expect(trulyEmptyResult.tooLargeLayer).toBeUndefined();
  });
});

describe('buildTooLargeCure — operator-facing too-large cure (AUDIT-20260603-03)', () => {
  it('names the overflowing layer in the cure text', () => {
    expect(buildTooLargeCure('commit-range')).toContain('commit-range');
    expect(buildTooLargeCure('staged')).toContain('staged');
    expect(buildTooLargeCure('unstaged')).toContain('unstaged');
  });

  it('names the actual cause (maxBuffer / ERR_CHILD_PROCESS_STDIO_MAXBUFFER)', () => {
    const cure = buildTooLargeCure('commit-range');
    expect(cure).toMatch(/maxBuffer|MAXBUFFER/i);
    expect(cure).toContain('50 MB');
  });

  it('names actionable cure options the operator can take', () => {
    const cure = buildTooLargeCure('staged');
    expect(cure).toMatch(/smaller batches|commit/i);
    expect(cure).toMatch(/gitattributes|skip/i);
    expect(cure).toMatch(/issue|raise/i);
  });

  it('does NOT contain the EMPTY_DIFF cure misnomer "no novel work"', () => {
    const cure = buildTooLargeCure('commit-range');
    expect(cure).not.toContain('no novel work');
  });

  it('references AUDIT-20260603-03 for traceability', () => {
    expect(buildTooLargeCure('unstaged')).toContain('AUDIT-20260603-03');
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
