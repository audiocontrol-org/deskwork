/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/controller/controller.anti-thrashing.test.ts
 *
 * Phase 11 Task 5 — Anti-thrashing scenarios, convergence behaviour,
 * and clamping bounds.
 *
 * Scenarios covered:
 *   5. Anti-thrashing damping (oscillation detection + damped delta)
 *   6. Convergence from cold-start (~10 turns to stable)
 *   7. Bounds + clamping (frequency_max ceiling, intensity_min floor)
 */

import { describe, expect, it } from 'vitest';
import { runController } from '../../../scope-discovery/controller/controller.js';
import { DEFAULT_CONTROLLER_CONFIG } from '../../../scope-discovery/controller/controller-config.js';
import type {
  ControllerConfig,
  ControllerHistoryEntry,
} from '../../../scope-discovery/controller/controller-types.js';
import {
  baseMetrics,
  makeHistoryEntry,
  makeInput,
  worsenedMetrics,
} from './controller.fixtures.js';

// ---------------------------------------------------------------------------
// 5. Anti-thrashing
// ---------------------------------------------------------------------------

describe('runController — anti-thrashing damping', () => {
  it('damps oscillating frequency adjustment by 50%', () => {
    // Build history with 3 prior turns each making NEGATIVE-direction
    // adjustments on frequency (ratchet-down). The current turn
    // proposes a POSITIVE delta (raise to max under high drift) →
    // damping fires.
    const oscillatingTrail = (
      delta: number,
      decidedAt: string,
    ): ControllerHistoryEntry['decision']['audit_trail'] => [
      {
        field: 'frequency',
        signal_used: 'ratchet-down',
        prior_value: 1.0,
        new_value: 1.0 + delta,
        reason: 'test',
        adjusted_at: decidedAt,
      },
    ];
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 0.3,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T11:00:00Z',
          audit_trail: oscillatingTrail(-0.1, '2026-05-26T11:00:00Z'),
        },
        baseMetrics({
          classification_completeness: 0.9,
          average_coverage: 0.8,
          violation_density: 50,
          pending_count: 5,
        }),
      ),
      makeHistoryEntry(
        {
          frequency: 0.4,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T10:30:00Z',
          audit_trail: oscillatingTrail(-0.2, '2026-05-26T10:30:00Z'),
        },
        baseMetrics(),
      ),
      makeHistoryEntry(
        {
          frequency: 0.6,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T10:00:00Z',
          audit_trail: oscillatingTrail(-0.3, '2026-05-26T10:00:00Z'),
        },
        baseMetrics(),
      ),
    ];
    const decision = runController(
      makeInput({
        currentMetrics: worsenedMetrics(),
        history,
      }),
    );
    expect(decision.signals.drift).toBeGreaterThanOrEqual(
      DEFAULT_CONTROLLER_CONFIG.high_drift_threshold,
    );
    // priorValue=0.3; proposedDelta=+0.7; damped=+0.35; newValue=0.65.
    expect(decision.frequency).toBeCloseTo(0.3 + 0.7 * 0.5, 5);
    const dampingTrail = decision.audit_trail.find(
      (e) =>
        e.field === 'frequency' && e.signal_used === 'anti-thrashing-damping',
    );
    expect(dampingTrail).toBeDefined();
  });

  it('does NOT damp when adjustment continues the prior direction', () => {
    const trail = (
      prior: number,
      next: number,
      decidedAt: string,
    ): ControllerHistoryEntry['decision']['audit_trail'] => [
      {
        field: 'frequency',
        signal_used: 'drift',
        prior_value: prior,
        new_value: next,
        reason: 'test',
        adjusted_at: decidedAt,
      },
    ];
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 0.6,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T11:00:00Z',
          audit_trail: trail(0.5, 0.6, '2026-05-26T11:00:00Z'),
        },
        baseMetrics(),
      ),
      makeHistoryEntry(
        {
          frequency: 0.5,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T10:30:00Z',
          audit_trail: trail(0.4, 0.5, '2026-05-26T10:30:00Z'),
        },
        baseMetrics(),
      ),
      makeHistoryEntry(
        {
          frequency: 0.4,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T10:00:00Z',
          audit_trail: trail(0.3, 0.4, '2026-05-26T10:00:00Z'),
        },
        baseMetrics(),
      ),
    ];
    const decision = runController(
      makeInput({
        currentMetrics: worsenedMetrics(),
        history,
      }),
    );
    expect(decision.frequency).toBe(DEFAULT_CONTROLLER_CONFIG.frequency_max);
    const dampingTrail = decision.audit_trail.find(
      (e) =>
        e.field === 'frequency' && e.signal_used === 'anti-thrashing-damping',
    );
    expect(dampingTrail).toBeUndefined();
  });

  it('does NOT damp when fewer than K prior adjustments exist', () => {
    const trail = (
      prior: number,
      next: number,
      decidedAt: string,
    ): ControllerHistoryEntry['decision']['audit_trail'] => [
      {
        field: 'frequency',
        signal_used: 'drift',
        prior_value: prior,
        new_value: next,
        reason: 'test',
        adjusted_at: decidedAt,
      },
    ];
    // Only 2 prior adjustments — below K=3.
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 0.6,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T11:00:00Z',
          audit_trail: trail(1.0, 0.6, '2026-05-26T11:00:00Z'),
        },
        baseMetrics(),
      ),
      makeHistoryEntry(
        {
          frequency: 1.0,
          intensity: 0.5,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T10:00:00Z',
          audit_trail: trail(0.8, 1.0, '2026-05-26T10:00:00Z'),
        },
        baseMetrics(),
      ),
    ];
    const decision = runController(
      makeInput({
        currentMetrics: worsenedMetrics(),
        history,
      }),
    );
    // No damping fires; the high-drift response can clamp to max.
    expect(decision.frequency).toBe(DEFAULT_CONTROLLER_CONFIG.frequency_max);
    const dampingTrail = decision.audit_trail.find(
      (e) =>
        e.field === 'frequency' && e.signal_used === 'anti-thrashing-damping',
    );
    expect(dampingTrail).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Convergence — cold-start to stable within ~10 turns
// ---------------------------------------------------------------------------

describe('runController — convergence from cold-start', () => {
  it('reaches stable cadence/intensity within 10 low-drift turns', () => {
    let history: ControllerHistoryEntry[] = [];
    const stableMetrics = baseMetrics();
    const decisions = [];
    for (let turn = 0; turn < 10; turn += 1) {
      const decision = runController(
        makeInput({
          currentMetrics: stableMetrics,
          history,
          decidedAt: `2026-05-26T${10 + turn}:00:00Z`,
        }),
      );
      decisions.push(decision);
      const entry: ControllerHistoryEntry = {
        decision,
        metrics_snapshot: stableMetrics,
      };
      history = [entry, ...history];
    }
    // Final value: well below 1.0, well above the floor.
    const finalFreq = decisions[decisions.length - 1]?.frequency ?? 0;
    expect(finalFreq).toBeLessThan(1.0);
    expect(finalFreq).toBeGreaterThanOrEqual(
      DEFAULT_CONTROLLER_CONFIG.frequency_min,
    );
    // Monotonic non-increase after the ratchet kicks in (turns 5+).
    for (let i = 5; i < decisions.length - 1; i += 1) {
      const current = decisions[i];
      const next = decisions[i + 1];
      if (current !== undefined && next !== undefined) {
        expect(next.frequency).toBeLessThanOrEqual(current.frequency);
      }
    }
  });

  it('stabilizes intensity in the same window', () => {
    let history: ControllerHistoryEntry[] = [];
    const stableMetrics = baseMetrics();
    const decisions = [];
    for (let turn = 0; turn < 10; turn += 1) {
      const decision = runController(
        makeInput({
          currentMetrics: stableMetrics,
          history,
          decidedAt: `2026-05-26T${10 + turn}:00:00Z`,
        }),
      );
      decisions.push(decision);
      history = [
        { decision, metrics_snapshot: stableMetrics },
        ...history,
      ];
    }
    const finalInt = decisions[decisions.length - 1]?.intensity ?? 0;
    expect(finalInt).toBeLessThan(1.0);
    expect(finalInt).toBeGreaterThanOrEqual(
      DEFAULT_CONTROLLER_CONFIG.intensity_min,
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Bounds + clamping
// ---------------------------------------------------------------------------

describe('runController — bounds + clamping', () => {
  it('clamps to frequency_max ceiling on huge proposed delta', () => {
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 0.9,
          intensity: 0.9,
          escalationThreshold: 0.9,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T11:00:00Z',
        },
        baseMetrics(),
      ),
    ];
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history,
        auditEntries: [
          { findingId: 'A-1', provenance: 'llm-judge-proposed' },
        ],
      }),
    );
    expect(decision.frequency).toBe(DEFAULT_CONTROLLER_CONFIG.frequency_max);
  });

  it('respects intensity_min floor on aggressive ratchet-down', () => {
    const config: ControllerConfig = {
      ...DEFAULT_CONTROLLER_CONFIG,
      intensity_min: 0.5,
    };
    const history: ControllerHistoryEntry[] = [];
    for (let i = 0; i < config.ratchet_down_window; i += 1) {
      history.push(
        makeHistoryEntry(
          {
            frequency: 1.0,
            intensity: 0.5,
            escalationThreshold: 0.9,
            drift: 0.0,
            correction: 0.0,
            auditorCorrectionRate: 0.0,
            decided_at: `2026-05-26T${10 + i}:00:00Z`,
          },
          baseMetrics(),
        ),
      );
    }
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history,
        config,
      }),
    );
    expect(decision.intensity).toBe(0.5);
  });
});
