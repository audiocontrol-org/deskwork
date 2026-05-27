/**
 * plugins/dw-lifecycle/src/scope-discovery/controller/controller.ts
 *
 * Phase 11 Task 5 — Self-correcting controller entry point (pure
 * computation). The bulk of the work is split across sibling modules
 * to keep each file under the project 300-500 line cap:
 *
 *   - `controller-signals.ts` — drift / correction / auditor-correction
 *     rate derivation from inputs.
 *   - `controller-policies.ts` — per-field adjustment proposals,
 *     anti-thrashing damping, clamping.
 *   - `controller-state.ts` — durable persistence (read/write side).
 *
 * This file owns the cold-start branch and the decision assembly.
 *
 * Algorithm overview (full rationale at PRD § Phase 11 Task 5):
 *
 *   1. SIGNALS — compute drift / correction / auditor-correction-rate.
 *   2. COLD-START — no history → emit cold-start defaults.
 *   3. STEADY-STATE / RATCHET-DOWN — sustained low drift eases
 *      cadence + intensity.
 *   4. HIGH-DRIFT or HIGH-AUDITOR-CORRECTION — intensify immediately.
 *   5. ANTI-THRASHING — oscillating adjustments damped 50%.
 *   6. EMIT — clamp every output to its [min, max] band; emit
 *      decision + audit_trail.
 */

import {
  computeAuditorCorrectionRate,
  computeDriftAndCorrection,
} from './controller-signals.js';
import {
  applyAdjustmentWithThrashGuard,
  proposeEscalationAdjustment,
  proposeFrequencyAdjustment,
  proposeIntensityAdjustment,
} from './controller-policies.js';
import type {
  ControllerAdjustment,
  ControllerConfig,
  ControllerDecision,
  ControllerInput,
  ControllerSignals,
} from './controller-types.js';

/**
 * Emit a cold-start decision: cold_start_* values verbatim, with a
 * single audit-trail entry per field tagged `cold-start`. Even with
 * no metrics history, the auditor-correction-rate signal is reported
 * (so the operator can inspect that the cold-start was AWARE of
 * audit activity).
 */
function coldStartDecision(
  config: ControllerConfig,
  signals: ControllerSignals,
  decidedAt: string,
): ControllerDecision {
  const trail: ControllerAdjustment[] = [
    {
      field: 'frequency',
      signal_used: 'cold-start',
      prior_value: config.cold_start_frequency,
      new_value: config.cold_start_frequency,
      reason: 'cold-start: no history; default to cold_start_frequency',
      adjusted_at: decidedAt,
    },
    {
      field: 'intensity',
      signal_used: 'cold-start',
      prior_value: config.cold_start_intensity,
      new_value: config.cold_start_intensity,
      reason: 'cold-start: no history; default to cold_start_intensity',
      adjusted_at: decidedAt,
    },
    {
      field: 'escalationThreshold',
      signal_used: 'cold-start',
      prior_value: config.cold_start_escalation_threshold,
      new_value: config.cold_start_escalation_threshold,
      reason:
        'cold-start: no history; default to cold_start_escalation_threshold',
      adjusted_at: decidedAt,
    },
  ];
  return {
    frequency: config.cold_start_frequency,
    intensity: config.cold_start_intensity,
    escalationThreshold: config.cold_start_escalation_threshold,
    signals,
    audit_trail: trail,
    decided_at: decidedAt,
  };
}

/**
 * Pure computation. Takes the input contract, returns the next
 * decision. The orchestrator persists `history` and the new decision
 * via `controller-state.ts`; the controller itself touches no disk.
 *
 * Cold-start branch: `history.length === 0` → emit defaults.
 *
 * Steady-state branch: signals derived from
 * `history[0].metrics_snapshot` vs `input.currentMetrics`; per-field
 * proposals; anti-thrashing damping; clamp; emit.
 */
export function runController(input: ControllerInput): ControllerDecision {
  if (input.history.length === 0) {
    const signals: ControllerSignals = {
      drift: 0,
      correction: 0,
      auditorCorrectionRate: computeAuditorCorrectionRate(
        input.auditEntries,
        0,
      ),
    };
    return coldStartDecision(input.config, signals, input.decidedAt);
  }
  const prior = input.history[0];
  if (prior === undefined) {
    // Defensive — history.length > 0 guarantees prior exists, but TS
    // can't narrow that without a fallback path. Treat as cold-start
    // to satisfy the type-checker; runtime never hits this branch.
    const signals: ControllerSignals = {
      drift: 0,
      correction: 0,
      auditorCorrectionRate: 0,
    };
    return coldStartDecision(input.config, signals, input.decidedAt);
  }
  const { drift, correction } = computeDriftAndCorrection(
    prior.metrics_snapshot,
    input.currentMetrics,
  );
  const auditorCorrectionRate = computeAuditorCorrectionRate(
    input.auditEntries,
    input.history.length,
  );
  const signals: ControllerSignals = {
    drift,
    correction,
    auditorCorrectionRate,
  };
  const priorDecision = prior.decision;
  const freqProposed = proposeFrequencyAdjustment(
    priorDecision.frequency,
    signals,
    input.config,
    input.history,
  );
  const freqResult = applyAdjustmentWithThrashGuard(
    'frequency',
    freqProposed,
    input.history,
    input.config,
    input.decidedAt,
    input.config.frequency_min,
    input.config.frequency_max,
  );
  const intensProposed = proposeIntensityAdjustment(
    priorDecision.intensity,
    signals,
    input.config,
    input.history,
  );
  const intensResult = applyAdjustmentWithThrashGuard(
    'intensity',
    intensProposed,
    input.history,
    input.config,
    input.decidedAt,
    input.config.intensity_min,
    input.config.intensity_max,
  );
  const escProposed = proposeEscalationAdjustment(
    priorDecision.escalationThreshold,
    signals,
    input.config,
    input.history,
  );
  const escResult = applyAdjustmentWithThrashGuard(
    'escalationThreshold',
    escProposed,
    input.history,
    input.config,
    input.decidedAt,
    input.config.escalation_min,
    input.config.escalation_max,
  );
  return {
    frequency: freqResult.newValue,
    intensity: intensResult.newValue,
    escalationThreshold: escResult.newValue,
    signals,
    audit_trail: [
      ...freqResult.trail,
      ...intensResult.trail,
      ...escResult.trail,
    ],
    decided_at: input.decidedAt,
  };
}
