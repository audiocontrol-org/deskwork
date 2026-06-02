/**
 * Phase 17 follow-on — fix for GH issue #384.
 *
 * `implement-hook` reports `findings=0, promoted=0, slushed=0` even
 * when the lift+disposition actually processed N findings. Three bugs
 * in the counter-parsing logic:
 *
 *   1. `parsePromoteCount` looked for `promoted: N` in STDERR, but
 *      promote-findings writes `Auto-applied: N finding(s)` to STDOUT.
 *
 *   2. `findingsCount` was only set inside the disposition branches,
 *      not from the canonical lift count. The lift's stderr says
 *      "extracted N finding(s)" — that IS the findings count.
 *
 *   3. The slush-count regex was correct, but its STDERR source was
 *      OK — that part already worked. Test that pin it explicitly so
 *      a future refactor doesn't break it.
 *
 * Closes GH #384 + AUDIT-20260601-18.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLiftFindingsCount,
  parseSlushCounts,
  parsePromoteCount,
} from '../../subcommands/implement-hook-counters.js';

describe('parseLiftFindingsCount — extracted-N from audit-barrage-lift stderr', () => {
  it('parses singular "extracted 1 finding(s)"', () => {
    const stderr = 'audit-barrage-lift: extracted 1 finding(s) from /tmp/run-dir; assigning AUDIT-20260601-01..AUDIT-20260601-01.\n';
    expect(parseLiftFindingsCount(stderr)).toBe(1);
  });

  it('parses plural "extracted 4 finding(s)"', () => {
    const stderr = 'audit-barrage-lift: extracted 4 finding(s) from /tmp/run-dir; assigning AUDIT-20260601-01..AUDIT-20260601-04.\n';
    expect(parseLiftFindingsCount(stderr)).toBe(4);
  });

  it('parses zero-findings case "extracted 0 findings"', () => {
    const stderr = 'audit-barrage-lift: extracted 0 findings from /tmp/run-dir; nothing to lift.\n';
    expect(parseLiftFindingsCount(stderr)).toBe(0);
  });

  it('returns 0 when no match (defensive default)', () => {
    expect(parseLiftFindingsCount('some unrelated stderr output')).toBe(0);
  });
});

describe('parseSlushCounts — flipped/skipped from slush-remaining stderr', () => {
  it('parses "flipped: N, skipped: M HIGHs"', () => {
    const stderr =
      'slush-remaining: dampener engaged. flipped: 3, skipped: 1 HIGH (left open as guardrails)\n';
    expect(parseSlushCounts(stderr)).toEqual({ flipped: 3, skippedHighs: 1 });
  });

  it('parses plural HIGHs form', () => {
    const stderr =
      'slush-remaining: dampener engaged. flipped: 4, skipped: 2 HIGHs (left open as guardrails)\n';
    expect(parseSlushCounts(stderr)).toEqual({ flipped: 4, skippedHighs: 2 });
  });

  it('parses zero-flipped case', () => {
    const stderr =
      'slush-remaining: dampener engaged. flipped: 0, skipped: 0 HIGHs (left open as guardrails)\n';
    expect(parseSlushCounts(stderr)).toEqual({ flipped: 0, skippedHighs: 0 });
  });

  it('returns null when no match (slush did not run or format changed)', () => {
    expect(parseSlushCounts('unrelated')).toBeNull();
  });
});

describe('parsePromoteCount — Auto-applied-N from promote-findings STDOUT (not stderr)', () => {
  // Pre-fix: implement-hook looked for /promoted:\s*(\d+)/ in stderr.
  // But promote-findings writes "Auto-applied: N finding(s)" to STDOUT.
  // The regex AND the stream were both wrong.
  it('parses singular "Auto-applied: 1 finding(s)"', () => {
    const stdout = 'Auto-applied: 1 finding(s) at ## Phase 5 (line 622).\n';
    expect(parsePromoteCount(stdout)).toBe(1);
  });

  it('parses plural "Auto-applied: 4 finding(s)"', () => {
    const stdout = 'Auto-applied: 4 finding(s) at ## Phase 5 (line 622).\n  Item 1 ...\n  Item 2 ...\n';
    expect(parsePromoteCount(stdout)).toBe(4);
  });

  it('returns 0 when no Auto-applied line (the no-new-findings stdout case)', () => {
    const stdout =
      'promote-findings --auto: no new findings to scope on feature x (5 open finding(s) already scoped).\n';
    expect(parsePromoteCount(stdout)).toBe(0);
  });

  it('returns 0 when stdout is empty', () => {
    expect(parsePromoteCount('')).toBe(0);
  });
});
