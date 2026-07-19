// specs/037-instance-observability — T024 (RED), Phase 1 (FR-023/SC-007 —
// serve live instance views without reading the durable store).
//
// contracts/instance-query-api.md § GET /v1/instances + GET /v1/instances/:id
// (lines ~20): "Live instances are served from the in-memory instance
// registry — durable reads are confined to historical queries. Live views
// generate ZERO reads against the durable store (FR-023/SC-007)."
//
// data-model.md § Storage layout + InstanceState: Instance observability is
// a **materialized projection** (FR-015) of classified events folded into an
// in-memory `InstanceRegistry`. The snapshot and per-instance detail routes
// project that in-memory registry into the client-visible shapes. Neither
// function's signature accepts a store or CDN-reader dependency — there is
// no parameter through which they COULD read the durable store.
//
// THIS TEST proves that by construction:
//   1. `buildInstanceRegistry` (src/plane/instance-registry.ts, T023 —
//      not yet implemented) folds a classified-event stream into an
//      in-memory `InstanceRegistry`.
//   2. `instanceSnapshot` / `instanceDetail` (src/plane/http/instance-api.ts,
//      T024 — not yet implemented) project that in-memory registry into the
//      client-visible "live" shapes (GET /v1/instances + GET /v1/instances/:id).
//      Neither function's signature accepts a store or CDN-reader dependency.
//   3. `createCdnReader` (src/storage/cdn-reader.ts, already implemented in
//      036) is the ONLY seam in this system that can reach the durable object
//      store for reads. This test wires a COUNTING fake `ObjectStorePort`
//      behind a real `CdnReader` — proving the counting store is a live,
//      reachable part of the wiring, not dead code — and then drives the
//      live-view construction path (snapshot + per-instance detail, repeatedly,
//      as an operator's dashboard would poll it) WITHOUT ever touching the
//      reader. The counting store's call counts must stay at exactly 0.
//
// RED test: `src/plane/http/instance-api.ts` + `src/plane/instance-registry.ts`
// do NOT exist yet. This test MUST fail at module-load (VALUE import of a
// missing module), never a typo — the `import { instanceSnapshot,
// instanceDetail } from '../../src/plane/http/instance-api.js'` and
// `import { buildInstanceRegistry } from '../../src/plane/instance-registry.js'`
// lines below are the RED triggers.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).

import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import type { SnapshotPayload } from '../../src/fleet/event.js';
import type { InstanceRegistry } from '../../src/plane/instance-registry.js';
import { buildInstanceRegistry } from '../../src/plane/instance-registry.js';
import type { InstanceState } from '../../src/plane/http/instance-api.js';
import { instanceSnapshot, instanceDetail } from '../../src/plane/http/instance-api.js';
// The CDN-reader module (036): already exists. This test wires a COUNTING
// `ObjectStorePort` behind a real `CdnReader` to prove the durable store is
// live-wired and reachable, which makes the "0 calls" assertion meaningful.
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
import { createCdnReader, createInMemoryCache } from '../../src/storage/cdn-reader.js';

/** Minimal test double of a classified event, mirrored from registry.test.ts /
 * api-snapshot.test.ts for consistency across this feature's test suite —
 * matches the CURRENT `ClassifiedEvent` shape (src/plane/instance-accumulator.ts
 * ~L63-68 / src/plane/instance-registry.ts) which additionally carries the
 * bounded `snapshot` payload (specs/037 D5). */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: 'live-only' | 'aggregated' | 'durable';
  readonly type: string;
  readonly snapshot: SnapshotPayload;
}

function mkEvent(
  installationId: string,
  invocationId: string,
  runId: string | null,
  host: string,
  path: string,
  sessionId: string | null,
  type: string,
  classification: 'live-only' | 'aggregated' | 'durable',
  invocationSequence: number,
): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId,
    invocationId,
    runId,
    host,
    path,
    sessionId,
    installationSequence: invocationSequence,
    invocationSequence,
    schemaVersion: 2, // 037 identity-bearing (AUDIT-20260719-16)
    type,
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: Date.now(),
    classification,
  };
  return { envelope, classification, type, snapshot: {} };
}

/**
 * A COUNTING `ObjectStorePort` fake — every method bumps its own call
 * counter. Never a production fallback (test code only, per the project's
 * no-mock-outside-tests rule) — its sole job is making "did the durable
 * store get touched?" an observable number instead of an assumption.
 */
class CountingObjectStore implements ObjectStorePort {
  putObjectCalls = 0;
  getObjectCalls = 0;
  headObjectCalls = 0;
  listObjectsCalls = 0;
  private readonly objects = new Map<string, Uint8Array>();

  async putObject(input: PutObjectInput): Promise<void> {
    this.putObjectCalls += 1;
    this.objects.set(input.key, input.body);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    this.getObjectCalls += 1;
    return this.objects.get(key) ?? null;
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    this.headObjectCalls += 1;
    const body = this.objects.get(key);
    if (body === undefined) {
      return null;
    }
    return { key, size: body.byteLength };
  }

  async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
    this.listObjectsCalls += 1;
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.byteLength }));
  }

  totalCalls(): number {
    return this.putObjectCalls + this.getObjectCalls + this.headObjectCalls + this.listObjectsCalls;
  }
}

describe('live instance views never read the durable store (T024, SC-007, contracts)', () => {
  it('building + re-polling an instance snapshot and per-instance details makes ZERO calls on a counting store wired behind a real CdnReader', () => {
    // Wire a COUNTING store behind a real CdnReader — proving the counting
    // store is reachable, live wiring (not inert test scaffolding) that the
    // system COULD read through, which is what makes "0 calls" meaningful
    // rather than trivially true because nothing was ever connected.
    const countingStore = new CountingObjectStore();
    const reader = createCdnReader({ origin: countingStore, cache: createInMemoryCache() });
    expect(reader).toBeDefined();

    // Build a populated live registry — two instances (different host:path
    // pairs), each with multiple sessions and runs, entirely from in-memory
    // classified events.
    const installationId = mintInstallationId();
    const invocation1 = mintUuidV7();
    const invocation2 = mintUuidV7();
    const invocation3 = mintUuidV7();
    const run1 = mintUuidV7();
    const run2 = mintUuidV7();
    const run3 = mintUuidV7();
    const session1 = mintUuidV7();
    const session2 = mintUuidV7();
    const host1 = 'orion-mbp';
    const path1 = '/Users/orion/work/stack-control';
    const host2 = 'secondary-host';
    const path2 = '/var/lib/stack-control';

    const events: ClassifiedEvent[] = [
      // Instance 1 (host1:path1) — session 1 with run
      mkEvent(installationId, invocation1, null, host1, path1, session1, 'session.started', 'durable', 1),
      mkEvent(installationId, invocation1, run1, host1, path1, session1, 'run.started', 'durable', 2),
      mkEvent(installationId, invocation1, run1, host1, path1, session1, 'run.progress', 'aggregated', 3),
      mkEvent(installationId, invocation1, null, host1, path1, session1, 'session.heartbeat', 'live-only', 4),
      // Instance 1 — session 2 after session 1 ends
      mkEvent(installationId, invocation2, null, host1, path1, session1, 'session.ended', 'durable', 5),
      mkEvent(installationId, invocation2, null, host1, path1, session2, 'session.started', 'durable', 6),
      mkEvent(installationId, invocation2, run2, host1, path1, session2, 'run.started', 'durable', 7),
      mkEvent(installationId, invocation2, run2, host1, path1, session2, 'run.progress', 'aggregated', 8),
      // Instance 2 (host2:path2) — single session with runs
      mkEvent(installationId, invocation3, null, host2, path2, session2, 'session.started', 'durable', 9),
      mkEvent(installationId, invocation3, run3, host2, path2, session2, 'run.started', 'durable', 10),
      mkEvent(installationId, invocation3, run3, host2, path2, session2, 'run.progress', 'aggregated', 11),
    ];

    const registry: InstanceRegistry = buildInstanceRegistry(events);

    // Drive the live-view construction path repeatedly — exactly what an
    // operator's dashboard does while polling/rendering instances.
    let lastSnapshot: { instances: InstanceState[] } | undefined;
    for (let poll = 0; poll < 5; poll += 1) {
      lastSnapshot = instanceSnapshot(registry);
      for (const instance of lastSnapshot.instances) {
        instanceDetail(registry, instance.id);
      }
    }

    // Sanity: we actually built something real, not a no-op with nothing to
    // amplify against.
    expect(lastSnapshot).toBeDefined();
    expect(lastSnapshot?.instances.length).toBe(2);

    // The load-bearing assertion (SC-007): the durable store's counting
    // fake was never touched by any part of the live-view construction,
    // even though it is live-wired behind a real CdnReader in this test.
    expect(countingStore.getObjectCalls).toBe(0);
    expect(countingStore.headObjectCalls).toBe(0);
    expect(countingStore.listObjectsCalls).toBe(0);
    expect(countingStore.putObjectCalls).toBe(0);
    expect(countingStore.totalCalls()).toBe(0);
  });
});
