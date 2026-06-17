// 025 US3 (T016) — the execute commit-and-push cadence. RED first.
//
// contracts/execute-cadence.md: at each phase boundary, after govern, `execute` COMMITS
// (landing locally first so completed work is never lost — FR-009) and then PUSHES
// (FR-010). A push failure FAILS LOUD and is surfaced; the local commit stays intact;
// the path never silently continues and NEVER uses `--no-verify` (FR-011/SC-007). The
// git subprocess is injected so the ordering + fail-loud are exercised hermetically.

import { describe, expect, it } from 'vitest';
import { commitAndPushBoundary } from '../../subcommands/execute-check.js';

describe('execute commit-and-push cadence (contracts/execute-cadence.md)', () => {
  it('commits locally FIRST, then pushes — ordered, work-safe (FR-009/FR-010)', () => {
    const calls: string[][] = [];
    const run = (args: readonly string[]): void => {
      calls.push([...args]);
    };
    commitAndPushBoundary(run, '/repo', 'phase 1 boundary');
    const verbs = calls.map((a) => a.find((t) => ['add', 'commit', 'push'].includes(t)));
    // commit (add+commit) lands before push.
    expect(verbs).toEqual(['add', 'commit', 'push']);
  });

  it('NEVER uses --no-verify on any git invocation (FR-011)', () => {
    const calls: string[][] = [];
    const run = (args: readonly string[]): void => {
      calls.push([...args]);
    };
    commitAndPushBoundary(run, '/repo', 'm');
    for (const args of calls) {
      expect(args).not.toContain('--no-verify');
    }
  });

  it('a push failure is surfaced LOUD; the local commit is intact (FR-011/SC-007)', () => {
    const committed: string[] = [];
    const run = (args: readonly string[]): void => {
      if (args.includes('push')) throw new Error('fatal: unable to access remote (offline)');
      if (args.includes('commit')) committed.push('committed');
    };
    expect(() => commitAndPushBoundary(run, '/repo', 'm')).toThrow(/push failed|FATAL/i);
    // the underlying error is surfaced, not swallowed
    expect(() => commitAndPushBoundary(run, '/repo', 'm')).toThrow(/offline/);
    // the local commit ran (and ran BEFORE the push attempt) — work is safe
    expect(committed.length).toBeGreaterThan(0);
  });

  it('does NOT push when the local commit fails (commit-first invariant)', () => {
    let pushed = false;
    const run = (args: readonly string[]): void => {
      if (args.includes('commit')) throw new Error('nothing to commit / hook refused');
      if (args.includes('push')) pushed = true;
    };
    expect(() => commitAndPushBoundary(run, '/repo', 'm')).toThrow();
    expect(pushed).toBe(false);
  });
});
