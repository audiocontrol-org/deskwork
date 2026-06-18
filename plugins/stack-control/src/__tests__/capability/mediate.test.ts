// 026 T009 — RED tests for the pure mediation decision rule (data-model §
// MediationDecision). Truth table: identity ∉ any backend → permit; identity ∈
// capability C with NO active marker for C → refuse(C) (reads included — ALL
// fronted-backend calls, not mutating-only); identity ∈ C WITH a marker for C →
// permit. Pure + read-only: it takes the resolved active-capabilities set, not disk.

import { describe, expect, it } from 'vitest';
import { decideMediation } from '../../capability/mediate.js';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';

const reg = CAPABILITY_REGISTRY;
const NO_MARKER = new Set<string>();

describe('decideMediation — the pure decision rule (026 T009)', () => {
  it('permits a non-backend identity (not fronted → permit, capability null)', () => {
    const d = decideMediation(reg, 'bash', 'ls -la', NO_MARKER);
    expect(d.verdict).toBe('permit');
    expect(d.capability).toBeNull();
  });

  it('refuses a backend invoked raw without a marker (reads included)', () => {
    const d = decideMediation(reg, 'bash', 'backlog list', NO_MARKER);
    expect(d.verdict).toBe('refuse');
    expect(d.capability).toBe('backlog');
    expect(d.reason).toContain('/stack-control:backlog');
  });

  it('permits a backend WITH an active marker for its capability', () => {
    const d = decideMediation(reg, 'bash', 'backlog list', new Set(['backlog']));
    expect(d.verdict).toBe('permit');
    expect(d.capability).toBe('backlog');
  });

  it('a marker for a DIFFERENT capability does not permit', () => {
    const d = decideMediation(reg, 'bash', 'backlog list', new Set(['spec-execution']));
    expect(d.verdict).toBe('refuse');
    expect(d.capability).toBe('backlog');
  });

  it('skill surface: refuses raw speckit-implement, permits with the spec-execution marker', () => {
    const raw = decideMediation(reg, 'skill', 'speckit-implement', NO_MARKER);
    expect(raw.verdict).toBe('refuse');
    expect(raw.reason).toContain('/stack-control:execute');
    const marked = decideMediation(reg, 'skill', 'speckit-implement', new Set(['spec-execution']));
    expect(marked.verdict).toBe('permit');
  });

  it('refuses a backend hidden in a compound command (no marker)', () => {
    expect(decideMediation(reg, 'bash', 'true && backlog list', NO_MARKER).verdict).toBe('refuse');
  });

  it('does not refuse a backend NAME used as a path/arg (SC-003)', () => {
    expect(decideMediation(reg, 'bash', 'cat backlog.md', NO_MARKER).verdict).toBe('permit');
  });
});
