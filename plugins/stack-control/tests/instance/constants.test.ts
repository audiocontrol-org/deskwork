// T002 (RED-first, Instance Observability 037) — the liveness model defines five
// plan-time contracts and their derived boundaries for the instance-observability
// liveness classification.
//
// CONTRACT (from data-model.md):
// - HEARTBEAT_INTERVAL_MS = 45_000 (reuses 036's DEFAULT_LIVENESS_INTERVAL_MS)
// - LIVENESS_WINDOW_MS = 90_000 (live→stale boundary; 2× heartbeat)
// - RECONCILIATION_GRACE_MS = 600_000 (stale→gone boundary; 10 min)
// - RECENT_ACTIVITY_CAP = 50 (N; eviction asserted at N+1)
// - historical/gone retention has NO separate eviction clock (follows the durable log)
// - deriveLiveness(lastSignalAgeMs: number): 'live' | 'stale' | 'gone'
//   Returns 'live' when age ≤ 90_000, 'stale' when 90_000 < age ≤ 600_000,
//   'gone' when age > 600_000. Exact boundary transitions tested.

import { describe, it, expect } from 'vitest';
import {
  HEARTBEAT_INTERVAL_MS,
  LIVENESS_WINDOW_MS,
  RECONCILIATION_GRACE_MS,
  RECENT_ACTIVITY_CAP,
  deriveLiveness,
} from '../../src/fleet/liveness-constants.js';

describe('instance-observability liveness constants', () => {
  describe('plan-time contracts', () => {
    it('HEARTBEAT_INTERVAL_MS equals 45_000', () => {
      expect(HEARTBEAT_INTERVAL_MS).toBe(45_000);
    });

    it('LIVENESS_WINDOW_MS equals 90_000 (2× heartbeat)', () => {
      expect(LIVENESS_WINDOW_MS).toBe(90_000);
      expect(LIVENESS_WINDOW_MS).toBe(HEARTBEAT_INTERVAL_MS * 2);
    });

    it('RECONCILIATION_GRACE_MS equals 600_000 (10 min)', () => {
      expect(RECONCILIATION_GRACE_MS).toBe(600_000);
    });

    it('RECENT_ACTIVITY_CAP equals 50', () => {
      expect(RECENT_ACTIVITY_CAP).toBe(50);
    });
  });

  describe('deriveLiveness(lastSignalAgeMs)', () => {
    it('returns "live" when age <= 90_000', () => {
      expect(deriveLiveness(0)).toBe('live');
      expect(deriveLiveness(45_000)).toBe('live');
      expect(deriveLiveness(90_000)).toBe('live');
    });

    it('returns "stale" when 90_000 < age <= 600_000', () => {
      expect(deriveLiveness(90_001)).toBe('stale');
      expect(deriveLiveness(300_000)).toBe('stale');
      expect(deriveLiveness(600_000)).toBe('stale');
    });

    it('returns "gone" when age > 600_000', () => {
      expect(deriveLiveness(600_001)).toBe('gone');
      expect(deriveLiveness(1_000_000)).toBe('gone');
    });

    it('transitions from "live" to "stale" at exact boundary 90_000 -> 90_001', () => {
      expect(deriveLiveness(90_000)).toBe('live');
      expect(deriveLiveness(90_001)).toBe('stale');
    });

    it('transitions from "stale" to "gone" at exact boundary 600_000 -> 600_001', () => {
      expect(deriveLiveness(600_000)).toBe('stale');
      expect(deriveLiveness(600_001)).toBe('gone');
    });
  });
});
