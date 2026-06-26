// H3 — TASK-119/126/127 (AUDIT-20260614-92): the split between a fleet-floor
// shortfall and a barrage outage is a machine-readable contract. It is derived from
// the barrage's OWN dedicated marker line (`audit-barrage: FLOOR SHORTFALL — …`),
// single-sourced as FLEET_FLOOR_SHORTFALL_MARKER so the emit site (renderFleetWarnings)
// and the parse sites (protocol.ts, end-govern-runtime.ts) cannot drift. Each kind
// carries its OWN recovery advice — a shortfall is recovered by widening the fleet /
// lowering the floor, NOT by checking the model CLIs (the outage recovery).

import { describe, it, expect } from 'vitest';
import {
  FLEET_FLOOR_SHORTFALL_MARKER,
  classifyBarrageFailure,
  barrageFailureRecovery,
  barrageFailureLabel,
} from '../../govern/govern-protocol-types.js';
import { renderFleetWarnings } from '../../subcommands/audit-barrage-fleet.js';
import type { BarrageRun, ModelRunResult } from '../../scope-discovery/audit-barrage/types.js';

function modelResult(overrides: Partial<ModelRunResult>): ModelRunResult {
  const stdoutBytes = overrides.stdoutBytes ?? 0;
  return {
    name: 'm',
    exitCode: 0,
    durationMs: 100,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutPath: '/tmp/m.md',
    stderrPath: '/tmp/stderr/m.txt',
    timedOut: false,
    spawnError: undefined,
    reportBytes: stdoutBytes,
    terminalState: 'completed',
    ...overrides,
  };
}

function runWith(results: ReadonlyArray<ModelRunResult>): BarrageRun {
  return {
    runDir: '/tmp/run',
    timestamp: '20260611T000000Z',
    featureSlug: 'demo',
    promptPath: '/tmp/run/PROMPT.md',
    indexPath: '/tmp/run/INDEX.md',
    results,
  };
}

describe('barrage failure classification (H3 — TASK-119/126/127)', () => {
  it('classifies the floor-shortfall marker line as fleet-floor-shortfall', () => {
    const stderr = `${FLEET_FLOOR_SHORTFALL_MARKER} — required 2 emitting model(s), got 1 (non-emitting: codex)`;
    expect(classifyBarrageFailure(stderr)).toBe('fleet-floor-shortfall');
  });

  it('classifies a generic non-zero barrage stderr (no marker) as barrage-outage', () => {
    expect(classifyBarrageFailure('audit-barrage: OUTAGE — 0 covering model families')).toBe(
      'barrage-outage',
    );
    expect(classifyBarrageFailure('some unrelated error')).toBe('barrage-outage');
  });

  it('does not misclassify an outage when FLOOR SHORTFALL appears mid-line (echoed prose)', () => {
    // The phrase buried inside a command trace / echoed prompt is NOT the marker —
    // only the line-anchored `audit-barrage: FLOOR SHORTFALL` prefix is.
    const echoed = 'note: the prompt mentions a FLOOR SHORTFALL recovery path\n(actual outage below)';
    expect(classifyBarrageFailure(echoed)).toBe('barrage-outage');
  });

  it('gives kind-specific recovery advice (TASK-126: shortfall != outage)', () => {
    const shortfall = barrageFailureRecovery('fleet-floor-shortfall');
    expect(shortfall).toMatch(/--require-models/);
    expect(shortfall).not.toMatch(/installed and reachable/);

    const outage = barrageFailureRecovery('barrage-outage');
    expect(outage).toMatch(/installed and reachable/);
  });

  it('gives a distinct human label per kind', () => {
    expect(barrageFailureLabel('fleet-floor-shortfall')).toMatch(/floor/);
    expect(barrageFailureLabel('barrage-outage')).toMatch(/OUTAGE/);
  });

  // Drift guard — the heart of TASK-119: the line the barrage actually EMITS for a floor
  // shortfall must begin with the single-sourced marker AND classify as a shortfall. If a
  // future edit changes the emitted wording without updating the constant, this fails.
  it('binds the emit site to the marker: renderFleetWarnings shortfall line is classified as a shortfall', () => {
    const subsetRun = runWith([modelResult({ name: 'claude', stdoutBytes: 2048, exitCode: 0 })]);
    const warnings = renderFleetWarnings(subsetRun, 2, 2);
    const line = warnings.find((w) => w.includes('FLOOR SHORTFALL'));
    expect(line).toBeDefined();
    expect(line!.startsWith(FLEET_FLOOR_SHORTFALL_MARKER)).toBe(true);
    expect(classifyBarrageFailure(line!)).toBe('fleet-floor-shortfall');
  });
});
