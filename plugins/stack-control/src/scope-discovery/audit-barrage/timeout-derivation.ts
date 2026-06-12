/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/timeout-derivation.ts
 *
 * specs/014-audit-barrage-reliability — per-spawn timeout derivation (FR-002,
 * research.md D5).
 *
 * Effective timeout = `max(floor, ceil(secs_per_kb × payload_kb))` where the
 * payload is the rendered PROMPT.md byte size (known pre-spawn). An explicit
 * `timeout_seconds` on the lane is an operator override: it displaces the
 * derivation entirely and the basis records `mode: 'override'` so the run
 * artifacts can answer "why was this run given this budget?".
 *
 * Extrapolation beyond any measured calibration point is linear by design
 * (spec edge case: a payload larger than the 69 KB calibration point gets a
 * proportionally larger budget — never a silent truncation below what the
 * slope says it needs).
 *
 * The config loader guarantees every lane carries either the derivation pair
 * or an override; the throw below is the fail-loud backstop for a lane
 * constructed outside the loader (Principle V — no silent default budget).
 */

import type { ModelConfig, TimeoutBasis } from './types.js';

const BYTES_PER_KB = 1024;

/**
 * Produce the timeout basis for one spawn: the lane's calibration fields ×
 * the rendered prompt's byte size, or the lane's explicit override.
 */
export function deriveTimeoutBasis(
  model: ModelConfig,
  payloadBytes: number,
): TimeoutBasis {
  if (model.timeoutSeconds !== undefined) {
    return {
      mode: 'override',
      payloadBytes,
      effectiveTimeoutSeconds: model.timeoutSeconds,
    };
  }
  const floor = model.timeoutFloorSeconds;
  const secsPerKb = model.timeoutSecsPerKb;
  if (floor === undefined || secsPerKb === undefined) {
    throw new Error(
      `audit-barrage timeout-derivation: lane '${model.name}' carries neither ` +
        `the derivation pair (timeout_floor_seconds + timeout_secs_per_kb) nor ` +
        `an explicit timeout_seconds override — no timeout budget can be ` +
        `derived (FR-002; the config loader should have refused this lane)`,
    );
  }
  const payloadKb = payloadBytes / BYTES_PER_KB;
  const derived = Math.ceil(secsPerKb * payloadKb);
  return {
    mode: 'derived',
    payloadBytes,
    floorSeconds: floor,
    secsPerKb,
    effectiveTimeoutSeconds: Math.max(floor, derived),
  };
}
