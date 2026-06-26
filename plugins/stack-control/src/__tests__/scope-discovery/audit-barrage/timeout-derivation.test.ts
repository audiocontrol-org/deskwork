// specs/014-audit-barrage-reliability — T011 (RED): timeout derivation.
//
// research.md D5: effective timeout = max(floor, ceil(secs_per_kb ×
// payload_kb)) where payload = rendered PROMPT.md bytes (known pre-spawn).
// An explicit `timeout_seconds` override displaces derivation and is
// recorded as `override` (FR-002). The basis record (data-model.md §
// TimeoutBasis) carries the inputs so an operator can audit why a run was
// given the budget it had.

import { describe, expect, it } from 'vitest';
import {
  deriveTimeoutBasis,
  deriveLivenessWindowSeconds,
} from '../../../scope-discovery/audit-barrage/timeout-derivation.js';
import type { ModelConfig } from '../../../scope-discovery/audit-barrage/types.js';

function lane(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    name: 'claude',
    binary: 'claude',
    argsTemplate: '-p --model {{model}} {{prompt-stdin}}',
    model: 'opus',
    readonlyEnforcement: '--permission-mode plan',
    outputMode: 'stream-json',
    livenessSignal: 'stdout',
    livenessWindowSeconds: 60,
    timeoutFloorSeconds: 300,
    timeoutSecsPerKb: 13,
    ...overrides,
  };
}

describe('derived mode (D5 / FR-002)', () => {
  it('computes max(floor, ceil(secs_per_kb × payload_kb)) — calibration payload', () => {
    // 69000 bytes = 67.3828 KB; × 13 = 875.98 → ceil 876; max(300, 876) = 876.
    const basis = deriveTimeoutBasis(lane(), 69000);
    expect(basis).toEqual({
      mode: 'derived',
      payloadBytes: 69000,
      floorSeconds: 300,
      secsPerKb: 13,
      effectiveTimeoutSeconds: 876,
    });
  });

  it('the floor wins for small payloads', () => {
    // 1000 bytes ≈ 0.98 KB × 13 = 12.7 → ceil 13; max(300, 13) = 300.
    const basis = deriveTimeoutBasis(lane(), 1000);
    expect(basis.mode).toBe('derived');
    expect(basis.effectiveTimeoutSeconds).toBe(300);
  });

  it('extrapolates linearly beyond any measured calibration point (never truncates)', () => {
    // 1 MB payload: 1024 KB × 13 = 13312 s — far beyond the 69 KB calibration
    // point; the edge case demands extrapolation, not a silent cap.
    const basis = deriveTimeoutBasis(lane(), 1024 * 1024);
    expect(basis.effectiveTimeoutSeconds).toBe(13312);
  });

  it('fractional secs_per_kb derives with ceil', () => {
    const basis = deriveTimeoutBasis(lane({ timeoutSecsPerKb: 0.5, timeoutFloorSeconds: 1 }), 3000);
    // 3000/1024 = 2.9297 KB × 0.5 = 1.4648 → ceil 2.
    expect(basis.effectiveTimeoutSeconds).toBe(2);
  });
});

describe('override mode (FR-002)', () => {
  it('an explicit timeout_seconds displaces derivation and is recorded as override', () => {
    const basis = deriveTimeoutBasis(lane({ timeoutSeconds: 900 }), 69000);
    expect(basis.mode).toBe('override');
    expect(basis.payloadBytes).toBe(69000);
    expect(basis.effectiveTimeoutSeconds).toBe(900);
    // Derivation inputs are not part of an override basis.
    expect(basis.floorSeconds).toBeUndefined();
    expect(basis.secsPerKb).toBeUndefined();
  });

  it('the override wins even when the derivation pair is also present', () => {
    const basis = deriveTimeoutBasis(
      lane({ timeoutSeconds: 60, timeoutFloorSeconds: 300, timeoutSecsPerKb: 13 }),
      69000,
    );
    expect(basis.mode).toBe('override');
    expect(basis.effectiveTimeoutSeconds).toBe(60);
  });
});

describe('fail-loud on an underivable lane (Principle V)', () => {
  it('throws a descriptive error when neither the pair nor an override is present', () => {
    expect(() =>
      deriveTimeoutBasis(
        lane({
          timeoutFloorSeconds: undefined,
          timeoutSecsPerKb: undefined,
        }),
        1000,
      ),
    ).toThrowError(/claude.*timeout/s);
  });
});

// TASK-324 (AUDIT-20260620-11): the silence watchdog window must scale with payload
// in lockstep with the (already-scaling) kill-cap, so the margin between a valid long
// thinking pause and a false `killed-no-liveness` does not narrow as payloads grow.
describe('deriveLivenessWindowSeconds — payload-scaled watchdog window', () => {
  const WINDOW = 300;

  it('keeps the configured window for a floor-bound (small) payload', () => {
    // 10 KB: derived 130 s < floor 420 s → effectiveTimeout = floor → scale 1 → unchanged.
    const basis = deriveTimeoutBasis(lane({ timeoutFloorSeconds: 420 }), 10 * 1024);
    expect(basis.effectiveTimeoutSeconds).toBe(420);
    expect(deriveLivenessWindowSeconds(WINDOW, basis)).toBe(300);
  });

  it('scales the window proportionally to the kill-cap for a large payload', () => {
    // 80 KB: derived ceil(13*80)=1040 s > floor 420 → scale 1040/420 → window ceil(300*scale).
    const basis = deriveTimeoutBasis(lane({ timeoutFloorSeconds: 420 }), 80 * 1024);
    expect(basis.effectiveTimeoutSeconds).toBe(1040);
    expect(deriveLivenessWindowSeconds(WINDOW, basis)).toBe(Math.ceil(300 * (1040 / 420)));
    // and it is strictly larger than the configured floor window.
    expect(deriveLivenessWindowSeconds(WINDOW, basis)).toBeGreaterThan(300);
  });

  it('never shrinks the window below the configured value', () => {
    const basis = deriveTimeoutBasis(lane({ timeoutFloorSeconds: 420 }), 1024);
    expect(deriveLivenessWindowSeconds(WINDOW, basis)).toBeGreaterThanOrEqual(300);
  });

  it('leaves an operator override window unscaled (operator owns that budget)', () => {
    const basis = deriveTimeoutBasis(lane({ timeoutSeconds: 500 }), 80 * 1024);
    expect(basis.mode).toBe('override');
    expect(deriveLivenessWindowSeconds(WINDOW, basis)).toBe(300);
  });
});
