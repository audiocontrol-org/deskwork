// 028 T095 (US3) — RED: cold-start zero-io (FR-025; contract T6).
//
// The cheap identity-first pre-filter is the latency bound: a NON-backend call resolves
// with ZERO marker reads (no per-invocation marker I/O for the common case). The
// resolver dependency must NOT be invoked when the identity names no fronted backend.

import { describe, expect, it } from 'vitest';
import { interceptDecision } from '../../capability/intercept.js';

function countingResolver() {
  let calls = 0;
  return {
    deps: {
      resolveActive: (): ReadonlySet<string> => {
        calls += 1;
        return new Set<string>();
      },
    },
    get calls() {
      return calls;
    },
  };
}

describe('cold-start zero marker I/O for non-backend calls (028 T095)', () => {
  it('a benign Bash command resolves with ZERO marker reads', () => {
    const r = countingResolver();
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'ls -la && git status' }, session_id: 's', cwd: '/x' },
      r.deps,
    );
    expect(d.verdict).toBe('permit');
    expect(r.calls).toBe(0);
  });

  it('a benign Skill resolves with ZERO marker reads', () => {
    const r = countingResolver();
    interceptDecision(
      { tool_name: 'Skill', tool_input: { skill: 'feature-help' }, session_id: 's', cwd: '/x' },
      r.deps,
    );
    expect(r.calls).toBe(0);
  });

  it('a non-intercepted tool resolves with ZERO marker reads', () => {
    const r = countingResolver();
    interceptDecision({ tool_name: 'Write', tool_input: { file_path: 'x' }, session_id: 's', cwd: '/x' }, r.deps);
    expect(r.calls).toBe(0);
  });

  it('a MUTATING backend identity DOES resolve the marker exactly once (the bound is paid only when needed)', () => {
    // A mutating fronted op is the one that consults the marker. (A read-only fronted op
    // like `backlog list` is exempt and skips the marker read entirely — codex-01 r3 —
    // so the bound is paid only when a mutating call genuinely needs it.)
    const r = countingResolver();
    interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog capture --type bug' }, session_id: 's', cwd: '/x' },
      r.deps,
    );
    expect(r.calls).toBe(1);
  });

  it('a READ-ONLY backend identity resolves the marker ZERO times (exempt, no marker I/O)', () => {
    const r = countingResolver();
    interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog list' }, session_id: 's', cwd: '/x' },
      r.deps,
    );
    expect(r.calls).toBe(0);
  });
});
