// specs/015-audit-protocol-convergence — T006 (RED): computeClusterSeverity.
//
// Every invariant in contracts/cluster-severity.md § computeClusterSeverity.
// The retired rule was max-of-cluster (`[high, medium] → high`); the new rule is
// cross-lane agreement: the gate-counted severity is the highest level at which
// ≥2 covering lanes rate it at-or-above (D1). Single-model findings keep their
// lane's severity (004 FR-003 preserved). De-inflation never RAISES severity.

import { describe, it, expect } from 'vitest';
import { computeClusterSeverity } from '../../../scope-discovery/promote-findings/cluster-severity.js';
import type { PerLaneSeverity } from '../../../scope-discovery/promote-findings/cluster-severity-types.js';

const lanes = (...pairs: Array<[string, PerLaneSeverity['severity']]>): PerLaneSeverity[] =>
  pairs.map(([model, severity]) => ({ model, severity }));

describe('computeClusterSeverity (cross-lane severity agreement, FR-001 mechanism A)', () => {
  it('[high, medium] → medium (the 014 plateau case de-inflates)', () => {
    const d = computeClusterSeverity(lanes(['opus', 'high'], ['codex', 'medium']));
    expect(d.gateCountedSeverity).toBe('medium');
    expect(d.rule).toBe('agreement');
    expect(d.perLane).toHaveLength(2);
  });

  it('[high, high] → high (a genuine ≥2-lane HIGH still blocks — SC-003)', () => {
    const d = computeClusterSeverity(lanes(['opus', 'high'], ['codex', 'high']));
    expect(d.gateCountedSeverity).toBe('high');
    expect(d.rule).toBe('agreement');
  });

  it('[high, high, low] → high (≥2 at high)', () => {
    const d = computeClusterSeverity(lanes(['opus', 'high'], ['codex', 'high'], ['fable', 'low']));
    expect(d.gateCountedSeverity).toBe('high');
  });

  it('[high, medium, medium] → medium (only 1 at high; ≥2 at medium)', () => {
    const d = computeClusterSeverity(
      lanes(['opus', 'high'], ['codex', 'medium'], ['fable', 'medium']),
    );
    expect(d.gateCountedSeverity).toBe('medium');
  });

  it('[blocking, high] → high (≥2 are ≥ high; not ≥2 at blocking)', () => {
    const d = computeClusterSeverity(lanes(['opus', 'blocking'], ['codex', 'high']));
    expect(d.gateCountedSeverity).toBe('high');
  });

  it('single [high] → high (single-model preserved — 004 FR-003)', () => {
    const d = computeClusterSeverity(lanes(['opus', 'high']));
    expect(d.gateCountedSeverity).toBe('high');
    expect(d.rule).toBe('single-model');
  });

  it('de-inflation never RAISES: gateCountedSeverity rank ≤ max(perLane rank)', () => {
    const d = computeClusterSeverity(lanes(['opus', 'medium'], ['codex', 'low']));
    // ≥2 agree at low; only 1 at medium → low. Never above medium.
    expect(d.gateCountedSeverity).toBe('low');
  });

  it('[blocking, blocking] → blocking (≥2 agree at blocking)', () => {
    const d = computeClusterSeverity(lanes(['opus', 'blocking'], ['codex', 'blocking']));
    expect(d.gateCountedSeverity).toBe('blocking');
  });

  it('throws on an empty cluster (a cluster always has ≥1 lane — fail loud)', () => {
    expect(() => computeClusterSeverity([])).toThrow();
  });
});
