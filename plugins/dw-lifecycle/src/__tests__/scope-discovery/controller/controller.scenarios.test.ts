/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/controller/controller.scenarios.test.ts
 *
 * Phase 11 Task 5 — Scenario tests for the self-correcting controller.
 * Each scenario plants synthetic inputs (metrics + history + audit
 * entries) and asserts the resulting decision shape.
 *
 * Scenarios covered:
 *   1. Cold-start (no history)
 *   2. Steady-state (low drift / no audit pressure)
 *   3. High-drift response
 *   4. High auditor-correction-rate response
 */

import { describe, expect, it } from 'vitest';
import { runController } from '../../../scope-discovery/controller/controller.js';
import { DEFAULT_CONTROLLER_CONFIG } from '../../../scope-discovery/controller/controller-config.js';
import type {
  ControllerHistoryEntry,
  MetricsSnapshot,
} from '../../../scope-discovery/controller/controller-types.js';
import {
  baseMetrics,
  makeHistoryEntry,
  makeInput,
  priorBetterMetrics,
  worsenedMetrics,
} from './controller.fixtures.js';

// ---------------------------------------------------------------------------
// 1. Cold-start
// ---------------------------------------------------------------------------

describe('runController — cold-start (no history)', () => {
  it('emits cold_start_* defaults verbatim', () => {
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history: [],
      }),
    );
    expect(decision.frequency).toBe(DEFAULT_CONTROLLER_CONFIG.cold_start_frequency);
    expect(decision.intensity).toBe(DEFAULT_CONTROLLER_CONFIG.cold_start_intensity);
    expect(decision.escalationThreshold).toBe(
      DEFAULT_CONTROLLER_CONFIG.cold_start_escalation_threshold,
    );
    expect(decision.frequency).toBe(1.0);
    expect(decision.intensity).toBe(1.0);
  });

  it('emits one cold-start audit entry per field', () => {
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history: [],
      }),
    );
    expect(decision.audit_trail.length).toBe(3);
    const tags = new Set(decision.audit_trail.map((e) => e.signal_used));
    expect(tags).toEqual(new Set(['cold-start']));
    const fields = new Set(decision.audit_trail.map((e) => e.field));
    expect(fields).toEqual(
      new Set(['frequency', 'intensity', 'escalationThreshold']),
    );
  });

  it('reports drift=0 and correction=0 on cold-start', () => {
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history: [],
      }),
    );
    expect(decision.signals.drift).toBe(0);
    expect(decision.signals.correction).toBe(0);
  });

  it('still computes auditor-correction-rate on cold-start', () => {
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history: [],
        auditEntries: [
          {
            findingId: 'AUDIT-20260526-01',
            provenance: 'llm-judge-proposed',
          },
        ],
      }),
    );
    expect(decision.signals.auditorCorrectionRate).toBe(1.0);
  });

  it('counts operator-authored audit entries with audit-finding context', () => {
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history: [],
        auditEntries: [
          {
            findingId: 'AUDIT-20260526-02',
            provenance: 'operator-authored',
            context: 'audit-finding-AUDIT-20260526-99',
          },
          {
            findingId: 'AUDIT-20260526-03',
            provenance: 'operator-authored',
            context: 'something-else',
          },
        ],
      }),
    );
    // Only the audit-finding-prefixed context counts.
    expect(decision.signals.auditorCorrectionRate).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// 2. Steady-state / ratchet-down
// ---------------------------------------------------------------------------

describe('runController — steady-state', () => {
  it('emits steady-state audit when within deadband', () => {
    const priorMetrics = baseMetrics();
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 1.0,
          intensity: 1.0,
          escalationThreshold: 0.9,
          drift: 0.05,
          correction: 0.1,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T11:00:00Z',
        },
        priorMetrics,
      ),
    ];
    const decision = runController(
      makeInput({
        currentMetrics: baseMetrics(),
        history,
      }),
    );
    expect(decision.frequency).toBe(1.0);
    expect(decision.intensity).toBe(1.0);
    expect(decision.escalationThreshold).toBe(0.9);
    expect(
      decision.audit_trail.every((e) => e.signal_used === 'steady-state'),
    ).toBe(true);
  });

  it('ratchets down frequency after low-drift window streak', () => {
    const config = DEFAULT_CONTROLLER_CONFIG;
    const history: ControllerHistoryEntry[] = [];
    for (let i = 0; i < config.ratchet_down_window; i += 1) {
      history.push(
        makeHistoryEntry(
          {
            frequency: 1.0,
            intensity: 1.0,
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
      }),
    );
    expect(decision.frequency).toBeCloseTo(1.0 - 0.1 * 1.0, 5);
    const freqTrail = decision.audit_trail.find(
      (e) => e.field === 'frequency',
    );
    expect(freqTrail?.signal_used).toBe('ratchet-down');
  });

  it('ratchets intensity down on the streak too', () => {
    const config = DEFAULT_CONTROLLER_CONFIG;
    const history: ControllerHistoryEntry[] = [];
    for (let i = 0; i < config.ratchet_down_window; i += 1) {
      history.push(
        makeHistoryEntry(
          {
            frequency: 1.0,
            intensity: 1.0,
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
      }),
    );
    const intTrail = decision.audit_trail.find(
      (e) => e.field === 'intensity',
    );
    expect(intTrail?.signal_used).toBe('ratchet-down');
    expect(decision.intensity).toBeCloseTo(0.9, 5);
  });

  it('does not relax escalation when auditor recently active', () => {
    const config = DEFAULT_CONTROLLER_CONFIG;
    const history: ControllerHistoryEntry[] = [];
    for (let i = 0; i < config.ratchet_down_window; i += 1) {
      history.push(
        makeHistoryEntry(
          {
            frequency: 1.0,
            intensity: 1.0,
            escalationThreshold: 0.9,
            drift: 0.0,
            correction: 0.0,
            // Newest entry has high auditor rate; older ones are clean.
            auditorCorrectionRate: i === 0 ? 0.6 : 0.0,
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
      }),
    );
    const escTrail = decision.audit_trail.find(
      (e) => e.field === 'escalationThreshold',
    );
    expect(escTrail?.signal_used).toBe('steady-state');
    expect(decision.escalationThreshold).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// 3. High-drift response
// ---------------------------------------------------------------------------

describe('runController — high-drift response', () => {
  it('jumps frequency to max when drift >= high_drift_threshold', () => {
    const prior: MetricsSnapshot = priorBetterMetrics();
    const current: MetricsSnapshot = worsenedMetrics();
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 0.3,
          intensity: 0.3,
          escalationThreshold: 0.5,
          drift: 0.0,
          correction: 0.0,
          auditorCorrectionRate: 0.0,
          decided_at: '2026-05-26T11:00:00Z',
        },
        prior,
      ),
    ];
    const decision = runController(
      makeInput({
        currentMetrics: current,
        history,
      }),
    );
    expect(decision.signals.drift).toBeGreaterThanOrEqual(
      DEFAULT_CONTROLLER_CONFIG.high_drift_threshold,
    );
    expect(decision.frequency).toBe(DEFAULT_CONTROLLER_CONFIG.frequency_max);
    const freqTrail = decision.audit_trail.find(
      (e) => e.field === 'frequency',
    );
    expect(freqTrail?.signal_used).toBe('drift');
  });

  it('tightens intensity by ratchet_down_rate on high-drift', () => {
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
        },
        priorBetterMetrics(),
      ),
    ];
    const decision = runController(
      makeInput({
        currentMetrics: worsenedMetrics(),
        history,
      }),
    );
    expect(decision.intensity).toBeCloseTo(0.6, 5);
  });
});

// ---------------------------------------------------------------------------
// 4. High auditor-correction-rate
// ---------------------------------------------------------------------------

describe('runController — high auditor-correction-rate', () => {
  it('raises escalation threshold when auditor-correction-rate high', () => {
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 0.5,
          intensity: 0.5,
          escalationThreshold: 0.5,
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
          { findingId: 'A-2', provenance: 'llm-judge-proposed' },
          { findingId: 'A-3', provenance: 'llm-judge-proposed' },
        ],
      }),
    );
    expect(decision.signals.auditorCorrectionRate).toBe(1.0);
    expect(decision.escalationThreshold).toBeCloseTo(0.6, 5);
    const escTrail = decision.audit_trail.find(
      (e) => e.field === 'escalationThreshold',
    );
    expect(escTrail?.signal_used).toBe('auditor-correction-rate');
  });

  it('also raises frequency on high auditor-correction-rate', () => {
    const history: ControllerHistoryEntry[] = [
      makeHistoryEntry(
        {
          frequency: 0.3,
          intensity: 0.3,
          escalationThreshold: 0.5,
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
    const freqTrail = decision.audit_trail.find(
      (e) => e.field === 'frequency',
    );
    expect(freqTrail?.signal_used).toBe('auditor-correction-rate');
  });
});
