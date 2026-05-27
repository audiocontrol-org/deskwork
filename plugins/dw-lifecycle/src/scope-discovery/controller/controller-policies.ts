/**
 * plugins/dw-lifecycle/src/scope-discovery/controller/controller-policies.ts
 *
 * Phase 11 Task 5 — Per-field adjustment policies + anti-thrashing.
 *
 * Each function in this module proposes an adjustment to one field
 * (frequency / intensity / escalation threshold) based on the current
 * signals + config + history. `applyAdjustmentWithThrashGuard`
 * dampens proposals that reverse the prior K adjustments' direction.
 *
 * Extracted from `controller.ts` to keep that file under the project
 * 300-500 line cap. The split mirrors the data-flow boundary: signals
 * are computed first (in `controller-signals.ts`), then turned into
 * field-specific proposals here, then assembled into a decision in
 * `controller.ts`.
 */

import type {
  ControllerAdjustment,
  ControllerConfig,
  ControllerHistoryEntry,
  ControllerSignals,
} from './controller-types.js';

/**
 * Result of one field's policy decision before clamping + thrash-guard.
 * The shape is internal — `controller.ts` consumes it via
 * `applyAdjustmentWithThrashGuard`.
 */
export interface ProposedAdjustment {
  readonly priorValue: number;
  readonly proposedDelta: number;
  readonly signalUsed:
    | 'drift'
    | 'correction'
    | 'auditor-correction-rate'
    | 'ratchet-down'
    | 'steady-state';
  readonly reason: string;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Detect whether a proposed adjustment reverses the dominant
 * direction of the prior K adjustments on the same field. Returns
 * true iff:
 *
 *   - There are at least K prior adjustments on this field in the
 *     history window.
 *   - The dominant direction (sign of net delta sum) of those prior K
 *     is opposite to the proposed delta's sign.
 *
 * Anti-thrashing logic per the Phase 11 Task 5 pre-made decision:
 * "any adjustment that reverses the prior K=3 adjustments is damped
 * 50%." We interpret "reverses" as "opposite-signed against the net
 * direction of the prior K"; a tied / zero net direction does not
 * count as reversal.
 */
export function detectOscillation(
  field: ControllerAdjustment['field'],
  proposedDelta: number,
  history: ReadonlyArray<ControllerHistoryEntry>,
  antiThrashingWindow: number,
): boolean {
  if (proposedDelta === 0) return false;
  const priorAdjustments: ControllerAdjustment[] = [];
  for (const entry of history) {
    for (const adj of entry.decision.audit_trail) {
      if (adj.field !== field) continue;
      const delta = adj.new_value - adj.prior_value;
      if (delta === 0) continue;
      priorAdjustments.push(adj);
      if (priorAdjustments.length >= antiThrashingWindow) break;
    }
    if (priorAdjustments.length >= antiThrashingWindow) break;
  }
  if (priorAdjustments.length < antiThrashingWindow) return false;
  let netDelta = 0;
  for (const adj of priorAdjustments) {
    netDelta += adj.new_value - adj.prior_value;
  }
  if (netDelta === 0) return false;
  return Math.sign(netDelta) !== Math.sign(proposedDelta);
}

/**
 * Count consecutive prior turns (newest-first) where drift was below
 * `low_drift_threshold`. Used for ratchet-down accounting.
 */
export function countConsecutiveLowDriftTurns(
  history: ReadonlyArray<ControllerHistoryEntry>,
  threshold: number,
): number {
  let count = 0;
  for (const entry of history) {
    if (entry.decision.signals.drift < threshold) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Count consecutive prior turns (newest-first) where auditor-
 * correction-rate was below the high threshold.
 */
export function countConsecutiveLowAuditorTurns(
  history: ReadonlyArray<ControllerHistoryEntry>,
  threshold: number,
): number {
  let count = 0;
  for (const entry of history) {
    if (entry.decision.signals.auditorCorrectionRate < threshold) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Propose a frequency adjustment based on signals + config + history.
 * Higher drift OR higher auditor-correction-rate → push toward
 * frequency_max. Sustained low drift → ratchet down by
 * ratchet_down_rate when the window streak is met.
 */
export function proposeFrequencyAdjustment(
  priorValue: number,
  signals: ControllerSignals,
  config: ControllerConfig,
  history: ReadonlyArray<ControllerHistoryEntry>,
): ProposedAdjustment {
  if (
    signals.drift >= config.high_drift_threshold ||
    signals.auditorCorrectionRate >= config.auditor_correction_high_threshold
  ) {
    return {
      priorValue,
      proposedDelta: config.frequency_max - priorValue,
      signalUsed:
        signals.drift >= config.high_drift_threshold
          ? 'drift'
          : 'auditor-correction-rate',
      reason:
        signals.drift >= config.high_drift_threshold
          ? `drift ${signals.drift.toFixed(3)} >= high_drift_threshold ${config.high_drift_threshold}; raise frequency to max`
          : `auditorCorrectionRate ${signals.auditorCorrectionRate.toFixed(3)} >= auditor_correction_high_threshold ${config.auditor_correction_high_threshold}; raise frequency to max`,
    };
  }
  const lowDriftStreak = countConsecutiveLowDriftTurns(
    history,
    config.low_drift_threshold,
  );
  if (
    signals.drift < config.low_drift_threshold &&
    lowDriftStreak + 1 >= config.ratchet_down_window
  ) {
    return {
      priorValue,
      proposedDelta: -config.ratchet_down_rate * priorValue,
      signalUsed: 'ratchet-down',
      reason: `drift ${signals.drift.toFixed(3)} < low_drift_threshold ${config.low_drift_threshold} for ${lowDriftStreak + 1} consecutive turns; ratchet down`,
    };
  }
  return {
    priorValue,
    proposedDelta: 0,
    signalUsed: 'steady-state',
    reason: `drift ${signals.drift.toFixed(3)} within deadband; no change`,
  };
}

/**
 * Propose an intensity adjustment. Same shape as frequency, but the
 * direction is inverted on the descending side: under high drift we
 * RAISE intensity (toward intensity_max — strictest threshold for
 * auto-disposition), and under low drift we LOWER intensity (toward
 * intensity_min — most permissive).
 */
export function proposeIntensityAdjustment(
  priorValue: number,
  signals: ControllerSignals,
  config: ControllerConfig,
  history: ReadonlyArray<ControllerHistoryEntry>,
): ProposedAdjustment {
  if (
    signals.drift >= config.high_drift_threshold ||
    signals.auditorCorrectionRate >= config.auditor_correction_high_threshold
  ) {
    const target = clamp(
      priorValue + config.ratchet_down_rate,
      config.intensity_min,
      config.intensity_max,
    );
    return {
      priorValue,
      proposedDelta: target - priorValue,
      signalUsed:
        signals.drift >= config.high_drift_threshold
          ? 'drift'
          : 'auditor-correction-rate',
      reason:
        signals.drift >= config.high_drift_threshold
          ? `drift ${signals.drift.toFixed(3)} >= high_drift_threshold ${config.high_drift_threshold}; tighten intensity`
          : `auditorCorrectionRate ${signals.auditorCorrectionRate.toFixed(3)} >= auditor_correction_high_threshold ${config.auditor_correction_high_threshold}; tighten intensity`,
    };
  }
  const lowDriftStreak = countConsecutiveLowDriftTurns(
    history,
    config.low_drift_threshold,
  );
  if (
    signals.drift < config.low_drift_threshold &&
    lowDriftStreak + 1 >= config.ratchet_down_window
  ) {
    return {
      priorValue,
      proposedDelta: -config.ratchet_down_rate * priorValue,
      signalUsed: 'ratchet-down',
      reason: `drift ${signals.drift.toFixed(3)} < low_drift_threshold ${config.low_drift_threshold} for ${lowDriftStreak + 1} consecutive turns; ratchet down intensity`,
    };
  }
  return {
    priorValue,
    proposedDelta: 0,
    signalUsed: 'steady-state',
    reason: `drift ${signals.drift.toFixed(3)} within deadband; no change`,
  };
}

/**
 * Propose an escalation-threshold adjustment. The escalation threshold
 * is the auditor's TRUTH SIGNAL: when auditor-correction-rate is high
 * we RAISE escalation_threshold (more proposals escalate). When the
 * auditor has been quiet AND drift has been low for the window, we
 * lower it — this is the "earn confidence" arc from the PRD.
 */
export function proposeEscalationAdjustment(
  priorValue: number,
  signals: ControllerSignals,
  config: ControllerConfig,
  history: ReadonlyArray<ControllerHistoryEntry>,
): ProposedAdjustment {
  if (signals.auditorCorrectionRate >= config.auditor_correction_high_threshold) {
    const target = clamp(
      priorValue + config.ratchet_down_rate,
      config.escalation_min,
      config.escalation_max,
    );
    return {
      priorValue,
      proposedDelta: target - priorValue,
      signalUsed: 'auditor-correction-rate',
      reason: `auditorCorrectionRate ${signals.auditorCorrectionRate.toFixed(3)} >= auditor_correction_high_threshold ${config.auditor_correction_high_threshold}; raise escalation threshold`,
    };
  }
  const lowDriftStreak = countConsecutiveLowDriftTurns(
    history,
    config.low_drift_threshold,
  );
  const lowAuditorStreak = countConsecutiveLowAuditorTurns(
    history,
    config.auditor_correction_high_threshold,
  );
  if (
    signals.drift < config.low_drift_threshold &&
    signals.auditorCorrectionRate < config.auditor_correction_high_threshold &&
    lowDriftStreak + 1 >= config.ratchet_down_window &&
    lowAuditorStreak + 1 >= config.ratchet_down_window
  ) {
    return {
      priorValue,
      proposedDelta: -config.ratchet_down_rate * priorValue,
      signalUsed: 'ratchet-down',
      reason: `drift + auditorCorrectionRate both below thresholds for ${config.ratchet_down_window} consecutive turns; lower escalation threshold`,
    };
  }
  return {
    priorValue,
    proposedDelta: 0,
    signalUsed: 'steady-state',
    reason: `auditorCorrectionRate ${signals.auditorCorrectionRate.toFixed(3)} within deadband; no change`,
  };
}

/**
 * Apply a proposed adjustment with anti-thrashing damping and final
 * clamping. Returns the new value + an audit trail describing what
 * happened (one entry for the proposal; a second entry for the
 * damping when oscillation was detected).
 *
 * When the proposed delta is zero, a single steady-state audit entry
 * is still emitted so operators can inspect that the controller
 * evaluated the field this turn.
 */
export function applyAdjustmentWithThrashGuard(
  field: ControllerAdjustment['field'],
  proposed: ProposedAdjustment,
  history: ReadonlyArray<ControllerHistoryEntry>,
  config: ControllerConfig,
  decidedAt: string,
  minBand: number,
  maxBand: number,
): { readonly newValue: number; readonly trail: ReadonlyArray<ControllerAdjustment> } {
  if (proposed.proposedDelta === 0) {
    return {
      newValue: proposed.priorValue,
      trail: [
        {
          field,
          signal_used: proposed.signalUsed,
          prior_value: proposed.priorValue,
          new_value: proposed.priorValue,
          reason: proposed.reason,
          adjusted_at: decidedAt,
        },
      ],
    };
  }
  const oscillation = detectOscillation(
    field,
    proposed.proposedDelta,
    history,
    config.anti_thrashing_window,
  );
  const dampedDelta = oscillation
    ? proposed.proposedDelta * config.anti_thrashing_damping_factor
    : proposed.proposedDelta;
  const clamped = clamp(
    proposed.priorValue + dampedDelta,
    minBand,
    maxBand,
  );
  const adjustments: ControllerAdjustment[] = [
    {
      field,
      signal_used: proposed.signalUsed,
      prior_value: proposed.priorValue,
      new_value: clamped,
      reason: proposed.reason,
      adjusted_at: decidedAt,
    },
  ];
  if (oscillation) {
    adjustments.push({
      field,
      signal_used: 'anti-thrashing-damping',
      prior_value: proposed.priorValue + proposed.proposedDelta,
      new_value: clamped,
      reason: `proposed delta ${proposed.proposedDelta.toFixed(3)} reverses prior ${config.anti_thrashing_window} adjustments on ${field}; damped by ${config.anti_thrashing_damping_factor}`,
      adjusted_at: decidedAt,
    });
  }
  return { newValue: clamped, trail: adjustments };
}
