// specs/014-audit-barrage-reliability — T003 (RED): terminal-state vocabulary.
//
// data-model.md § ModelRunResult: every spawn settles into exactly one
// `terminalState` (completed | timed-out | spawn-failed | killed-no-liveness),
// plus `enforcement`, `liveness`, and an always-recorded `timeoutBasis`
// (FR-002/FR-006). The derived predicates require `terminalState ===
// 'completed'`: a killed/failed lane is NEVER liftable and NEVER
// converged-eligible — its empty output must not read as a clean run (FR-007).

import { describe, expect, it } from 'vitest';
import {
  isModelRunConverged,
  isModelRunCovering,
  isModelRunHealthy,
  type ModelRunResult,
  type TerminalState,
  type TimeoutBasis,
} from '../../../scope-discovery/audit-barrage/types.js';

const DERIVED_BASIS: TimeoutBasis = {
  mode: 'derived',
  payloadBytes: 69000,
  floorSeconds: 300,
  secsPerKb: 13,
  effectiveTimeoutSeconds: 876,
};

function result(overrides: Partial<ModelRunResult>): ModelRunResult {
  return {
    name: 'm',
    exitCode: 0,
    durationMs: 100,
    stdoutBytes: 512,
    stderrBytes: 0,
    reportBytes: 512,
    stdoutPath: '/tmp/m.md',
    stderrPath: '/tmp/stderr/m.txt',
    timedOut: false,
    spawnError: undefined,
    terminalState: 'completed',
    enforcement: 'enforced',
    liveness: 'monitored',
    timeoutBasis: DERIVED_BASIS,
    ...overrides,
  };
}

describe('terminalState union (T003 / FR-006)', () => {
  it('admits exactly the four states', () => {
    const states: TerminalState[] = [
      'completed',
      'timed-out',
      'spawn-failed',
      'killed-no-liveness',
    ];
    for (const s of states) {
      expect(result({ terminalState: s }).terminalState).toBe(s);
    }
  });

  it('carries enforcement / liveness / timeoutBasis on every result', () => {
    const r = result({});
    expect(r.enforcement).toBe('enforced');
    expect(r.liveness).toBe('monitored');
    expect(r.timeoutBasis.mode).toBe('derived');
    expect(r.timeoutBasis.effectiveTimeoutSeconds).toBe(876);
  });
});

describe('predicates require terminalState === completed (FR-006/FR-007)', () => {
  it('a timed-out lane with bytes is NOT liftable and NOT converged', () => {
    const r = result({ terminalState: 'timed-out', timedOut: true, exitCode: -1 });
    expect(isModelRunHealthy(r)).toBe(false);
    expect(isModelRunConverged(r)).toBe(false);
  });

  it('a killed-no-liveness lane is NOT liftable and NOT converged', () => {
    const r = result({ terminalState: 'killed-no-liveness', exitCode: -1 });
    expect(isModelRunHealthy(r)).toBe(false);
    expect(isModelRunConverged(r)).toBe(false);
  });

  it('a spawn-failed lane is NOT liftable and NOT converged', () => {
    const r = result({
      terminalState: 'spawn-failed',
      exitCode: -2,
      stdoutBytes: 0,
      reportBytes: 0,
      spawnError: 'ENOENT',
    });
    expect(isModelRunHealthy(r)).toBe(false);
    expect(isModelRunConverged(r)).toBe(false);
  });

  it('a completed lane with a report and exit 0 is liftable AND converged', () => {
    const r = result({});
    expect(isModelRunHealthy(r)).toBe(true);
    expect(isModelRunConverged(r)).toBe(true);
  });

  it('a completed lane with a fast non-zero exit (CLI-rejected model pin) is degradation, not production', () => {
    // Edge case (spec.md): a rejected pin is a fast non-zero EXIT, not a
    // spawn error — it must never count as converged-eligible.
    const r = result({ exitCode: 1, stdoutBytes: 64, reportBytes: 64 });
    expect(isModelRunHealthy(r)).toBe(true); // bytes are still liftable evidence
    expect(isModelRunConverged(r)).toBe(false);
  });

  it('a completed lane with zero report bytes is neither (nothing emitted)', () => {
    const r = result({ stdoutBytes: 0, reportBytes: 0 });
    expect(isModelRunHealthy(r)).toBe(false);
    expect(isModelRunConverged(r)).toBe(false);
  });

  it('a stream lane whose result event never arrived (reportBytes 0, raw stdout bytes > 0) is not liftable', () => {
    // The NDJSON capture had bytes, but no final report artifact exists —
    // liftability follows the ARTIFACT, not the wire traffic (FR-010).
    const r = result({ stdoutBytes: 4096, reportBytes: 0, terminalState: 'killed-no-liveness', exitCode: -1 });
    expect(isModelRunHealthy(r)).toBe(false);
  });
});

describe('isModelRunCovering back-compat alias', () => {
  it('behaves identically to isModelRunConverged', () => {
    const cases: ModelRunResult[] = [
      result({}),
      result({ exitCode: 1 }),
      result({ terminalState: 'timed-out', exitCode: -1 }),
      result({ stdoutBytes: 0, reportBytes: 0 }),
    ];
    for (const c of cases) {
      expect(isModelRunCovering(c)).toBe(isModelRunConverged(c));
    }
  });
});
