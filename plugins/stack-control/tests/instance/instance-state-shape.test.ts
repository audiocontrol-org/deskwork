// specs/037-instance-observability — T017 (RED test).
//
// toInstanceState(accumulator: InstanceAccumulator): InstanceState — projects
// a mutable accumulator fold-state to the served InstanceState shape per
// data-model.md § InstanceState (FR-016/016a/016b/016c).
//
// CONTRACT (from data-model.md, lines 67–89):
// The projection MUST carry exactly these fields:
//   - id, host, path, connection, liveness, lastHeartbeatAt, currentSession,
//     currentBearing, lastActivityAt, lastActivity, sessionsStarted,
//     sessionsEnded, firstSeenAt, firstSessionAt, phaseDurations, recentActivity
//
// Cardinality / Shape:
//   - currentSession: { sessionId: string, startedAt: string } | null
//   - currentBearing: { phase: string, item: string } | null
//   - phaseDurations: object with optional keys (designing?, specifying?,
//     implementing?, governing?) — values are ms (number); unobserved phases are
//     ABSENT, never 0 (SC-009)
//   - recentActivity: Event[] (≤ 50, newest-first); bounded convenience view
//   - lastHeartbeatAt, lastActivityAt, firstSeenAt, firstSessionAt: string | null
//   - sessionStarted, sessionsEnded: number
//   - connection: 'attached' | 'disconnected'
//   - liveness: 'live' | 'stale' | 'gone'
//
// FR-017 (CRITICAL): NO `waiting` field must exist on the projection.

import { describe, it, expect } from 'vitest';
import { toInstanceState } from '../../src/plane/instance-registry.js';

describe('toInstanceState — InstanceState shape (FR-016/016a/016b/016c, FR-017)', () => {
  /**
   * Helper to construct a minimal InstanceAccumulator for testing.
   * In production, this is built by buildInstanceRegistry folding the event stream.
   * For the test, we construct a fixture with enough state to project.
   */
  function minimalAccumulator(): Record<string, unknown> {
    return {
      id: 'test-host:/test/path',
      host: 'test-host',
      path: '/test/path',
      connection: 'attached',
      liveness: 'live',
      lastHeartbeatAt: null,
      currentSession: null,
      currentBearing: null,
      lastActivityAt: null,
      lastActivity: null,
      sessionsStarted: 0,
      sessionsEnded: 0,
      firstSeenAt: null,
      firstSessionAt: null,
      phaseDurations: {},
      recentActivity: [],
    };
  }

  describe('contract shape (FR-016)', () => {
    it('projects exactly the contract fields — no more, no less', () => {
      const accum = minimalAccumulator();
      const state = toInstanceState(accum as any);

      // The contract lists 16 required fields
      const contractFields = [
        'id',
        'host',
        'path',
        'connection',
        'liveness',
        'lastHeartbeatAt',
        'currentSession',
        'currentBearing',
        'lastActivityAt',
        'lastActivity',
        'sessionsStarted',
        'sessionsEnded',
        'firstSeenAt',
        'firstSessionAt',
        'phaseDurations',
        'recentActivity',
      ];

      // Each contract field MUST exist
      for (const field of contractFields) {
        expect(state).toHaveProperty(field);
      }

      // The projection must have exactly the contract fields (no extra)
      const stateKeys = Object.keys(state).sort();
      const expectedKeys = contractFields.sort();
      expect(stateKeys).toEqual(expectedKeys);
    });
  });

  describe('FR-017: no waiting field', () => {
    it('does NOT project a waiting field', () => {
      const accum = minimalAccumulator();
      const state = toInstanceState(accum as any);

      expect(state).not.toHaveProperty('waiting');
      expect((state as any).waiting).toBeUndefined();
    });
  });

  describe('phaseDurations shape (FR-018, SC-009)', () => {
    it('phaseDurations is an object with optional keys for each phase', () => {
      const accum = minimalAccumulator();
      const state = toInstanceState(accum as any);

      expect(typeof state.phaseDurations).toBe('object');
      expect(state.phaseDurations).not.toBeNull();
    });

    it('unobserved phases are absent, never 0', () => {
      const accum = minimalAccumulator();
      const state = toInstanceState(accum as any);

      // Empty phaseDurations should have no keys
      expect(Object.keys(state.phaseDurations)).toEqual([]);

      // When a phase IS observed, add it to the fixture
      accum.phaseDurations = { designing: 5000 };
      const state2 = toInstanceState(accum as any);

      // designing should be present; other phases should be absent
      expect(state2.phaseDurations).toHaveProperty('designing');
      expect(state2.phaseDurations.designing).toBe(5000);
      expect(state2.phaseDurations).not.toHaveProperty('specifying');
      expect(state2.phaseDurations).not.toHaveProperty('implementing');
      expect(state2.phaseDurations).not.toHaveProperty('governing');
    });

    it('phase values are milliseconds (number)', () => {
      const accum = minimalAccumulator();
      accum.phaseDurations = {
        designing: 1000,
        specifying: 2000,
        implementing: 3000,
      };
      const state = toInstanceState(accum as any);

      for (const value of Object.values(state.phaseDurations)) {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('recentActivity shape (FR-016b)', () => {
    it('recentActivity is an array', () => {
      const accum = minimalAccumulator();
      const state = toInstanceState(accum as any);

      expect(Array.isArray(state.recentActivity)).toBe(true);
    });

    it('recentActivity is bounded to 50 items max', () => {
      const accum = minimalAccumulator();
      // Simulate 60 activities in the accumulator (the projection should cap at 50)
      accum.recentActivity = Array.from({ length: 60 }, (_, i) => ({
        eventId: `event-${i}`,
        type: 'invocation.completed',
        wallClock: new Date().toISOString(),
      }));

      const state = toInstanceState(accum as any);

      expect(state.recentActivity.length).toBeLessThanOrEqual(50);
    });

    it('recentActivity is newest-first', () => {
      const accum = minimalAccumulator();
      const now = new Date();
      // Add activities with increasing timestamps
      accum.recentActivity = [
        { eventId: 'e1', wallClock: new Date(now.getTime() - 3000).toISOString() },
        { eventId: 'e2', wallClock: new Date(now.getTime() - 2000).toISOString() },
        { eventId: 'e3', wallClock: new Date(now.getTime() - 1000).toISOString() },
      ];

      const state = toInstanceState(accum as any);

      // Newest (e3) should be first
      if (state.recentActivity.length > 0) {
        expect((state.recentActivity[0] as any).eventId).toBe('e3');
      }
    });
  });

  describe('nullable fields', () => {
    it('fields like lastHeartbeatAt, lastActivityAt, firstSeenAt, firstSessionAt can be null', () => {
      const accum = minimalAccumulator();
      accum.lastHeartbeatAt = null;
      accum.lastActivityAt = null;
      accum.firstSeenAt = null;
      accum.firstSessionAt = null;

      const state = toInstanceState(accum as any);

      expect(state.lastHeartbeatAt).toBeNull();
      expect(state.lastActivityAt).toBeNull();
      expect(state.firstSeenAt).toBeNull();
      expect(state.firstSessionAt).toBeNull();
    });

    it('currentSession and currentBearing can be null', () => {
      const accum = minimalAccumulator();
      accum.currentSession = null;
      accum.currentBearing = null;

      const state = toInstanceState(accum as any);

      expect(state.currentSession).toBeNull();
      expect(state.currentBearing).toBeNull();
    });

    it('currentSession is { sessionId, startedAt } when present', () => {
      const accum = minimalAccumulator();
      accum.currentSession = {
        sessionId: 'sess-123',
        startedAt: '2026-07-18T10:00:00Z',
      };

      const state = toInstanceState(accum as any);

      expect(state.currentSession).toEqual({
        sessionId: 'sess-123',
        startedAt: '2026-07-18T10:00:00Z',
      });
    });

    it('currentBearing is { phase, item } when present', () => {
      const accum = minimalAccumulator();
      accum.currentBearing = { phase: 'implementing', item: 'TASK-42' };

      const state = toInstanceState(accum as any);

      expect(state.currentBearing).toEqual({
        phase: 'implementing',
        item: 'TASK-42',
      });
    });
  });

  describe('enums and string literals', () => {
    it('connection is either "attached" or "disconnected"', () => {
      const accum1 = minimalAccumulator();
      accum1.connection = 'attached';
      const state1 = toInstanceState(accum1 as any);
      expect(['attached', 'disconnected']).toContain(state1.connection);

      const accum2 = minimalAccumulator();
      accum2.connection = 'disconnected';
      const state2 = toInstanceState(accum2 as any);
      expect(['attached', 'disconnected']).toContain(state2.connection);
    });

    it('liveness is one of "live", "stale", or "gone"', () => {
      const validStates = ['live', 'stale', 'gone'];

      for (const liveness of validStates) {
        const accum = minimalAccumulator();
        accum.liveness = liveness;
        const state = toInstanceState(accum as any);
        expect(validStates).toContain(state.liveness);
      }
    });
  });

  describe('counters', () => {
    it('sessionsStarted and sessionsEnded are numbers', () => {
      const accum = minimalAccumulator();
      accum.sessionsStarted = 3;
      accum.sessionsEnded = 2;

      const state = toInstanceState(accum as any);

      expect(typeof state.sessionsStarted).toBe('number');
      expect(typeof state.sessionsEnded).toBe('number');
      expect(state.sessionsStarted).toBe(3);
      expect(state.sessionsEnded).toBe(2);
    });
  });
});
