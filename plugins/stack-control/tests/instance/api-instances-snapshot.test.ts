// specs/037-instance-observability — T021 [US1] RED test for instance snapshot/detail API.
//
// CONTRACT (contracts/instance-query-api.md):
//   - `instanceSnapshot(registry, opts?)` returns { instances: InstanceState[] }, each
//     instance exactly once, stable first-seen order.
//     - Default (no `include`) → only instances with connection: 'attached' OR
//       liveness ∈ {'live','stale'} (the "connected/recent" view).
//     - `include: 'all'` → also disconnected/gone instances.
//   - `instanceDetail(registry, id)` returns full InstanceState + recentActivity for the
//     URL-decoded host:path id; unknown id → 404-shaped result { found: false, id }
//     (no fabrication).
//
// THIS TEST (RED phase):
//   Build a mock InstanceRegistry with instances in various connection/liveness states,
//   take a snapshot with default and 'all' filters, and assert:
//   (1) every instance appears exactly once, (2) filtering respects connection/liveness,
//   (3) detail returns the full instance for a known id, (4) unknown id returns not-found.
//
// The API handlers (T022, src/plane/http/instance-api.ts) and the registry builder
// (T018, src/plane/instance-registry.ts) do not exist yet; this test RED-fails until
// they do. The registry factory (buildInstanceRegistry) is authored by T018 —
// import its types and API signature from src/plane/instance-registry.ts.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/` alias).

import { afterEach, describe, expect, it } from 'vitest';
import { useMachineStateStore, assertTripwireEmpty } from './_machine-state-harness.ts';

// Data types (will be authored by T018 + data-model.md)
interface InstanceState {
  readonly id: string; // host:path
  readonly host: string;
  readonly path: string;
  readonly connection: 'attached' | 'disconnected';
  readonly liveness: 'live' | 'stale' | 'gone';
  readonly lastHeartbeatAt: string | null;
  readonly currentSession: { sessionId: string; startedAt: string } | null;
  readonly currentBearing: { phase: string; item: string } | null;
  readonly lastActivityAt: string | null;
  readonly lastActivity: string | null;
  readonly sessionsStarted: number;
  readonly sessionsEnded: number;
  readonly firstSeenAt: string | null;
  readonly firstSessionAt: string | null;
  readonly phaseDurations: Record<string, number>;
  readonly recentActivity: unknown[]; // Event[] but we simplify for test
}

interface InstanceRegistry {
  // The registry stores instances by id (host:path); provides a method to enumerate them.
  instances(): readonly InstanceState[];
  instance(id: string): InstanceState | undefined;
}

interface InstanceSnapshotOptions {
  readonly include?: 'all';
}

interface InstanceSnapshot {
  readonly instances: readonly InstanceState[];
}

interface InstanceDetail {
  readonly found: true;
  readonly instance: InstanceState;
  readonly recentActivity: unknown[];
}

interface InstanceDetailNotFound {
  readonly found: false;
  readonly id: string;
}

// The handlers (T022, src/plane/http/instance-api.ts) will be imported here:
import type { InstanceRegistry as ImportedInstanceRegistry } from '../../src/plane/instance-registry.js';
import {
  instanceSnapshot,
  instanceDetail,
} from '../../src/plane/http/instance-api.js';

/**
 * Mock factory to build a test InstanceRegistry with predictable instances.
 * Later replaced by T018's real buildInstanceRegistry(events).
 */
function mkMockRegistry(...instances: InstanceState[]): InstanceRegistry {
  const byId = new Map(instances.map((inst) => [inst.id, inst]));
  return {
    instances: () => instances,
    instance: (id: string) => byId.get(id),
  };
}

/**
 * Helper to build a minimal InstanceState for testing.
 */
function mkInstance(
  host: string,
  path: string,
  connection: 'attached' | 'disconnected' = 'attached',
  liveness: 'live' | 'stale' | 'gone' = 'live',
  overrides?: Partial<InstanceState>,
): InstanceState {
  const id = `${host}:${path}`;
  return {
    id,
    host,
    path,
    connection,
    liveness,
    lastHeartbeatAt: null,
    currentSession: null,
    currentBearing: null,
    lastActivityAt: new Date().toISOString(),
    lastActivity: 'test-event',
    sessionsStarted: 0,
    sessionsEnded: 0,
    firstSeenAt: new Date().toISOString(),
    firstSessionAt: null,
    phaseDurations: {},
    recentActivity: [],
    ...overrides,
  };
}

describe('instance snapshot/detail API (T021 [US1])', () => {
  const store = useMachineStateStore();

  afterEach(() => {
    assertTripwireEmpty();
  });

  it('snapshot returns every instance exactly once, in first-seen order', () => {
    // Build instances in various states
    const inst1 = mkInstance('host1', '/path/to/instance1', 'attached', 'live');
    const inst2 = mkInstance('host2', '/path/to/instance2', 'attached', 'stale');
    // inst3 is disconnected but STALE (recent signal) → survives the default
    // filter via the liveness arm, so all three are connected/recent.
    const inst3 = mkInstance('host3', '/path/to/instance3', 'disconnected', 'stale');

    const registry = mkMockRegistry(inst1, inst2, inst3);

    // Default snapshot (only connected/recent instances)
    const snapshot: InstanceSnapshot = instanceSnapshot(registry);

    // All 3 survive the default connected/recent filter (attached OR live/stale).
    expect(snapshot.instances).toHaveLength(3);

    // Verify each instance appears exactly once, in first-seen order
    const ids = snapshot.instances.map((i: InstanceState) => i.id);
    expect(ids).toEqual([inst1.id, inst2.id, inst3.id]);

    // Verify no duplicates
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it('snapshot default (no include) filters to connected/recent instances only', () => {
    // Mix of attached/live, attached/stale, disconnected/live, disconnected/gone
    const attached_live = mkInstance('h1', '/p1', 'attached', 'live');
    const attached_stale = mkInstance('h2', '/p2', 'attached', 'stale');
    const disconnected_live = mkInstance('h3', '/p3', 'disconnected', 'live');
    const disconnected_gone = mkInstance('h4', '/p4', 'disconnected', 'gone');

    const registry = mkMockRegistry(attached_live, attached_stale, disconnected_live, disconnected_gone);

    // Default filter: (connection === 'attached' OR liveness IN {live, stale})
    const snapshot: InstanceSnapshot = instanceSnapshot(registry);

    expect(snapshot.instances).toHaveLength(3);
    const returned = snapshot.instances.map((i: InstanceState) => i.id);
    expect(returned).toContain(attached_live.id);
    expect(returned).toContain(attached_stale.id);
    expect(returned).toContain(disconnected_live.id);
    // disconnected_gone should be excluded
    expect(returned).not.toContain(disconnected_gone.id);
  });

  it('snapshot with include=all returns all instances, including disconnected/gone', () => {
    const attached_live = mkInstance('h1', '/p1', 'attached', 'live');
    const disconnected_gone = mkInstance('h2', '/p2', 'disconnected', 'gone');

    const registry = mkMockRegistry(attached_live, disconnected_gone);

    // include: 'all' should return both
    const snapshot: InstanceSnapshot = instanceSnapshot(registry, { include: 'all' });

    expect(snapshot.instances).toHaveLength(2);
    const ids = snapshot.instances.map((i: InstanceState) => i.id);
    expect(ids).toContain(attached_live.id);
    expect(ids).toContain(disconnected_gone.id);
  });

  it('detail returns full instance state for a known id', () => {
    const inst = mkInstance('myhost', '/my/path', 'attached', 'live', {
      lastActivityAt: '2026-07-18T10:00:00Z',
      lastActivity: 'run.completed',
      sessionsStarted: 2,
      recentActivity: [
        { type: 'event1', timestamp: '2026-07-18T10:00:00Z' },
        { type: 'event2', timestamp: '2026-07-18T09:59:00Z' },
      ] as unknown[],
    });

    const registry = mkMockRegistry(inst);
    const id = 'myhost:/my/path';

    // Detail for a known id returns the full state
    const result: InstanceDetail | InstanceDetailNotFound = instanceDetail(registry, id);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.instance.id).toBe(inst.id);
      expect(result.instance.host).toBe('myhost');
      expect(result.instance.path).toBe('/my/path');
      expect(result.instance.connection).toBe('attached');
      expect(result.instance.liveness).toBe('live');
      expect(result.instance.lastActivityAt).toBe('2026-07-18T10:00:00Z');
      expect(result.instance.lastActivity).toBe('run.completed');
      expect(result.instance.sessionsStarted).toBe(2);
      // recentActivity is included in the detail response
      expect(result.recentActivity).toHaveLength(2);
    }
  });

  it('detail with unknown id returns 404-shaped not-found response', () => {
    const inst = mkInstance('h1', '/p1', 'attached', 'live');
    const registry = mkMockRegistry(inst);

    // Query for a non-existent id
    const unknownId = 'unknown-host:/unknown/path';
    const result: InstanceDetail | InstanceDetailNotFound = instanceDetail(registry, unknownId);

    // Should return { found: false, id }
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.id).toBe(unknownId);
    }
  });

  it('detail handles URL-encoded id (host:path with special characters)', () => {
    // A path with spaces or special chars would be URL-encoded in the request
    // The handler should URL-decode it before looking up in the registry
    const inst = mkInstance('my-host', '/path/with spaces/instance', 'attached', 'live');
    const registry = mkMockRegistry(inst);

    // The id as it comes from the registry
    const plainId = inst.id;

    // Query using the plain id (simulating URL-decoding on the handler side)
    const result: InstanceDetail | InstanceDetailNotFound = instanceDetail(registry, plainId);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.instance.id).toBe(plainId);
    }
  });

  it('snapshot response shape matches contract: { instances: InstanceState[] }', () => {
    const inst = mkInstance('h1', '/p1', 'attached', 'live');
    const registry = mkMockRegistry(inst);

    const snapshot = instanceSnapshot(registry);

    // Response MUST have an 'instances' field with an array
    expect(snapshot).toHaveProperty('instances');
    expect(Array.isArray(snapshot.instances)).toBe(true);

    // Each element is an InstanceState
    for (const instance of snapshot.instances) {
      expect(instance).toHaveProperty('id');
      expect(instance).toHaveProperty('host');
      expect(instance).toHaveProperty('path');
      expect(instance).toHaveProperty('connection');
      expect(instance).toHaveProperty('liveness');
      expect(instance).toHaveProperty('lastActivityAt');
      expect(instance).toHaveProperty('lastActivity');
    }
  });
});
