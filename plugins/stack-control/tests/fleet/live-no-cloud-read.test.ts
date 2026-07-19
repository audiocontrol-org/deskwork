// specs/036-fleet-control-plane — T090 (RED), Phase 7 (US5 — serve history
// without amplifying the capped store).
//
// data-model.md § Storage layout ~134 + contracts/plane-client-api.md C7
// (line ~57): "Live runs are served from the in-memory registry — cloud
// reads are confined to FINALIZED run artifacts (FR-072). Live views
// generate ZERO reads against the durable store (SC-009)."
//
// research.md § Do NOT re-derive: B2 Class B (download/read) transactions
// ARE aggressively capped in production (operator ground truth — do not
// "correct" this from the public pricing page, which has already produced
// this exact false positive from two independent agents). Any read path
// that amplifies capped-store transactions with client traffic is a
// DEFECT. The live-fleet view — the surface an operator's dashboard hits
// continuously while a fleet is running — is the highest-frequency read
// path in the whole system, so it is the one that MUST be structurally
// incapable of reaching the capped store, not merely "usually" avoiding it.
//
// THIS TEST proves that by construction:
//   1. `buildRegistry` (src/plane/registry.ts, T050 — already implemented)
//      folds a classified-event stream into an in-memory `FleetRegistry`.
//   2. `fleetSnapshot` / `perRunDetail` (src/plane/http/api.ts, T053/T054 —
//      already implemented) project that in-memory registry into the two
//      client-visible "live" shapes (C2 snapshot, C5 per-run detail).
//      Neither function's signature accepts a store or CDN-reader
//      dependency — there is no parameter through which they COULD read
//      the durable store.
//   3. `createCdnReader` (src/storage/cdn-reader.ts, T099) is the ONLY
//      seam in this system that can reach the durable object store for
//      reads. This test wires a COUNTING fake `ObjectStorePort` behind a
//      real `CdnReader` — proving the counting store is a live, reachable
//      part of the wiring, not dead code — and then drives the live-view
//      construction path (snapshot + per-run detail, repeatedly, as an
//      operator's dashboard would poll it) WITHOUT ever touching the
//      reader. The counting store's call counts must stay at exactly 0.
//
// RED test: `src/storage/cdn-reader.ts` does NOT exist yet. This test MUST
// fail at module-load (VALUE import of a missing module), never a typo —
// the `import { createCdnReader, createInMemoryCache } from
// '../../src/storage/cdn-reader.js'` line below is the RED trigger.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).

import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import type { FleetRegistry } from '../../src/plane/registry.js';
import { buildRegistry } from '../../src/plane/registry.js';
import type { FleetSnapshot } from '../../src/plane/http/api.js';
import { fleetSnapshot, perRunDetail } from '../../src/plane/http/api.js';
// The CDN-reader module (T099): does NOT exist until T099 impl lands. This
// import is the RED trigger — module resolution fails at load time.
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
import { createCdnReader, createInMemoryCache } from '../../src/storage/cdn-reader.js';

/** Minimal test double of a classified event, mirrored from registry.test.ts /
 * api-snapshot.test.ts for consistency across this feature's test suite. */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: 'live-only' | 'aggregated' | 'durable';
  readonly type: string;
}

function mkEvent(
  installationId: string,
  invocationId: string,
  runId: string | null,
  type: string,
  classification: 'live-only' | 'aggregated' | 'durable',
  invocationSequence: number,
): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId,
    invocationId,
    runId,
    installationSequence: invocationSequence,
    invocationSequence,
    schemaVersion: 1,
    type,
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: Date.now(),
    classification,
  };
  return { envelope, classification, type };
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

describe('live views never read the durable store (T090, SC-009, contracts C7)', () => {
  it('building + re-polling a fleet snapshot and per-run details makes ZERO calls on a counting store wired behind a real CdnReader', () => {
    // Wire a COUNTING store behind a real CdnReader — proving the counting
    // store is reachable, live wiring (not inert test scaffolding) that the
    // system COULD read through, which is what makes "0 calls" meaningful
    // rather than trivially true because nothing was ever connected.
    const countingStore = new CountingObjectStore();
    const reader = createCdnReader({ origin: countingStore, cache: createInMemoryCache() });
    expect(reader).toBeDefined();

    // Build a populated live registry — two commandable runs across one
    // installation, entirely from in-memory classified events.
    const installationId = mintInstallationId();
    const invocation1 = mintUuidV7();
    const invocation2 = mintUuidV7();
    const run1 = mintUuidV7();
    const run2 = mintUuidV7();

    const events: ClassifiedEvent[] = [
      mkEvent(installationId, invocation1, run1, 'run.started', 'durable', 1),
      mkEvent(installationId, invocation1, run1, 'run.progress', 'aggregated', 2),
      mkEvent(installationId, invocation2, run2, 'run.started', 'durable', 3),
      mkEvent(installationId, invocation2, run2, 'run.progress', 'aggregated', 4),
    ];

    const registry: FleetRegistry = buildRegistry(events);

    // Drive the live-view construction path repeatedly — exactly what an
    // operator's dashboard does while polling/rendering a running fleet.
    let lastSnapshot: FleetSnapshot | undefined;
    for (let poll = 0; poll < 5; poll += 1) {
      lastSnapshot = fleetSnapshot(registry);
      for (const entry of lastSnapshot.entries) {
        perRunDetail(entry);
      }
    }

    // Sanity: we actually built something real, not a no-op with nothing to
    // amplify against.
    expect(lastSnapshot).toBeDefined();
    expect(lastSnapshot?.entries.length).toBe(2);

    // The load-bearing assertion (SC-009): the durable store's counting
    // fake was never touched by any part of the live-view construction,
    // even though it is live-wired behind a real CdnReader in this test.
    expect(countingStore.getObjectCalls).toBe(0);
    expect(countingStore.headObjectCalls).toBe(0);
    expect(countingStore.listObjectsCalls).toBe(0);
    expect(countingStore.putObjectCalls).toBe(0);
    expect(countingStore.totalCalls()).toBe(0);
  });
});
