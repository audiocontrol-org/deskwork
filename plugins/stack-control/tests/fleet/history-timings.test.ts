// specs/036-fleet-control-plane — T101 (RED + impl-pairing), Phase 7
// (US5 — serve history without amplifying the capped store).
//
// CONTRACT (contracts/plane-client-api.md C7, FR-084/085; data-model.md §
// Storage layout ~140):
//   - `runHistory` (GET /v1/runs/{runId}/history) reads a run's archived
//     history through the injected CdnReader (T099) — the ONLY seam that
//     may reach the durable store — and repeated reads of the SAME canned
//     key must cost origin exactly ONE transaction (SC-008), mirroring
//     tests/fleet/read-amplification.test.ts's (T091) already-proven
//     mechanism, applied here to the concrete runHistory/runTimings seam.
//   - `runTimings` (GET /v1/runs/{runId}/timings, FR-085) returns the four
//     NAMED phase durations — design / spec / execution / governance —
//     each independently honest: present only when the archived record
//     actually carries it, `undefined` (never fabricated) otherwise. This
//     mirrors the no-fallback discipline `FleetEntry` (T050) already
//     applies to its deliberately-omitted compass/model/git facets.
//   - Neither function accepts an `ObjectStorePort` — only a `CdnReader` —
//     so no LIVE/hot path (fleetSnapshot/perRunDetail, T053/T054) gained a
//     direct capped-store read by this task; that structural guarantee is
//     asserted directly below, alongside tests/fleet/live-no-cloud-read.test.ts
//     (T090)'s existing coverage.
//
// RED test: `runHistory` / `runTimings` do NOT exist in
// src/plane/http/api.ts (or src/plane/http/history-api.ts) until T101
// lands. This test MUST fail at module-load (VALUE import of missing
// exports), never a typo.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).
// Real fakes, never a mocked filesystem/network (.claude/rules/testing.md).

import { describe, expect, it } from 'vitest';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
import { createCdnReader, createInMemoryCache } from '../../src/storage/cdn-reader.js';
import type { FleetRegistry } from '../../src/plane/registry.js';
import { buildRegistry } from '../../src/plane/registry.js';
import type { FleetSnapshot } from '../../src/plane/http/api.js';
import { fleetSnapshot, perRunDetail } from '../../src/plane/http/api.js';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
// The history/timings surface (T101): does NOT exist until T101 impl lands.
// This import is the RED trigger — module resolution fails at load time.
import { runHistory, runHistoryObjectKey, runTimings } from '../../src/plane/http/api.js';

/**
 * A COUNTING `ObjectStorePort` fake standing in for the capped durable
 * store ("origin" behind the CDN). Test code only. `getObjectCalls` is the
 * load-bearing counter — every increment is one real capped-store
 * transaction in production terms.
 */
class CountingOriginStore implements ObjectStorePort {
  getObjectCalls = 0;
  putObjectCalls = 0;
  headObjectCalls = 0;
  listObjectsCalls = 0;
  private readonly objects = new Map<string, Uint8Array>();

  seed(key: string, body: Uint8Array): void {
    this.objects.set(key, body);
  }

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
    return body === undefined ? null : { key, size: body.byteLength };
  }

  async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
    this.listObjectsCalls += 1;
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.byteLength }));
  }

  totalCalls(): number {
    return this.getObjectCalls + this.putObjectCalls + this.headObjectCalls + this.listObjectsCalls;
  }
}

function encode(record: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record));
}

describe('runHistory reads through the injected CdnReader, cache-served on repeat (T101, SC-008, C7)', () => {
  it('resolves the canned, revision-free key runs/{installationId}/{runId}/summary.json', () => {
    const key = runHistoryObjectKey({ installationId: 'installation-a', runId: 'run-1' });
    expect(key).toBe('runs/installation-a/run-1/summary.json');
  });

  it('a found record is served via the CdnReader, and N repeat reads cost origin exactly 1 transaction', async () => {
    const origin = new CountingOriginStore();
    const installationId = 'installation-a';
    const runId = 'run-1';
    const key = runHistoryObjectKey({ installationId, runId });
    origin.seed(
      key,
      encode({
        phases: {
          execution: { durationMs: 4200 },
          governance: { durationMs: 1500 },
        },
      }),
    );

    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    // 25 simulated distinct client reads of the identical canned resource.
    for (let i = 0; i < 25; i += 1) {
      const result = await runHistory(reader, installationId, runId);
      expect(result.found).toBe(true);
    }

    // The load-bearing assertion (SC-008): 25 client reads through
    // runHistory, exactly 1 origin transaction.
    expect(origin.getObjectCalls).toBe(1);
  });

  it('an absent record is a clean found:false — never a thrown error — and 404s are never cached (re-checked every read)', async () => {
    const origin = new CountingOriginStore();
    const installationId = 'installation-b';
    const runId = 'run-2';
    // Deliberately unseeded: the run has never been archived.
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    const first = await runHistory(reader, installationId, runId);
    expect(first).toEqual({ found: false, installationId, runId });

    const second = await runHistory(reader, installationId, runId);
    expect(second).toEqual({ found: false, installationId, runId });

    // PT-005: 404s bypass cache, so both reads reach origin — 2 origin
    // transactions for 2 reads of a still-absent key (never amplifies
    // beyond N for N reads of an absent key, but never fewer either).
    expect(origin.getObjectCalls).toBe(2);
  });
});

describe('runTimings returns the four FR-085 phase durations, honestly absent when not archived (T101)', () => {
  it('surfaces only the phases the archived record actually carries; the rest are undefined, not fabricated', async () => {
    const origin = new CountingOriginStore();
    const installationId = 'installation-c';
    const runId = 'run-3';
    const key = runHistoryObjectKey({ installationId, runId });
    // Deliberately partial: design/spec are NEVER carried by this archived
    // record — a producer for those phases does not exist yet.
    origin.seed(
      key,
      encode({
        phases: {
          execution: { durationMs: 61200 },
          governance: { durationMs: 3400 },
        },
      }),
    );

    const reader = createCdnReader({ origin, cache: createInMemoryCache() });
    const timings = await runTimings(reader, installationId, runId);

    expect(timings.runId).toBe(runId);
    // Present, real, non-fabricated values:
    expect(timings.phases.execution).toEqual({ durationMs: 61200 });
    expect(timings.phases.governance).toEqual({ durationMs: 3400 });
    // Honestly absent — NOT fabricated as 0 or any other placeholder:
    expect(timings.phases.design).toBeUndefined();
    expect(timings.phases.spec).toBeUndefined();
  });

  it('all four phases carried when the archived record has them all', async () => {
    const origin = new CountingOriginStore();
    const installationId = 'installation-d';
    const runId = 'run-4';
    const key = runHistoryObjectKey({ installationId, runId });
    origin.seed(
      key,
      encode({
        phases: {
          design: { durationMs: 900_000 },
          spec: { durationMs: 1_800_000 },
          execution: { durationMs: 3_600_000 },
          governance: { durationMs: 120_000 },
        },
      }),
    );

    const reader = createCdnReader({ origin, cache: createInMemoryCache() });
    const timings = await runTimings(reader, installationId, runId);

    expect(timings.phases.design).toEqual({ durationMs: 900_000 });
    expect(timings.phases.spec).toEqual({ durationMs: 1_800_000 });
    expect(timings.phases.execution).toEqual({ durationMs: 3_600_000 });
    expect(timings.phases.governance).toEqual({ durationMs: 120_000 });
  });

  it('a run with no archived history yet returns all four phases as undefined — never fabricated zeros', async () => {
    const origin = new CountingOriginStore();
    const installationId = 'installation-e';
    const runId = 'run-5';
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    const timings = await runTimings(reader, installationId, runId);

    expect(timings.runId).toBe(runId);
    expect(timings.phases.design).toBeUndefined();
    expect(timings.phases.spec).toBeUndefined();
    expect(timings.phases.execution).toBeUndefined();
    expect(timings.phases.governance).toBeUndefined();
  });

  it('a malformed archived record (non-object phases) fails loud rather than silently fabricating a shape', async () => {
    const origin = new CountingOriginStore();
    const installationId = 'installation-f';
    const runId = 'run-6';
    const key = runHistoryObjectKey({ installationId, runId });
    origin.seed(key, encode({ phases: 'not-an-object' }));
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    await expect(runTimings(reader, installationId, runId)).rejects.toThrow(/phases/);
  });

  it('an invalid phase durationMs fails loud rather than silently coercing/fabricating', async () => {
    const origin = new CountingOriginStore();
    const installationId = 'installation-g';
    const runId = 'run-7';
    const key = runHistoryObjectKey({ installationId, runId });
    origin.seed(key, encode({ phases: { execution: { durationMs: -5 } } }));
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    await expect(runTimings(reader, installationId, runId)).rejects.toThrow(/durationMs/);
  });
});

describe('history/timings never add a direct capped-store read to the live/hot path (T101, SC-009, C7)', () => {
  it('polling fleetSnapshot/perRunDetail still makes ZERO calls on a counting store live-wired behind the same CdnReader that serves history', async () => {
    const countingStore = new CountingOriginStore();
    const reader = createCdnReader({ origin: countingStore, cache: createInMemoryCache() });

    const installationId = mintInstallationId();
    const invocationId = mintUuidV7();
    const runId = mintUuidV7();

    interface ClassifiedEvent {
      readonly envelope: EventEnvelope;
      readonly classification: 'live-only' | 'aggregated' | 'durable';
      readonly type: string;
    }

    function mkEvent(type: string, classification: 'live-only' | 'aggregated' | 'durable', sequence: number): ClassifiedEvent {
      const envelope: EventEnvelope = {
        eventId: mintUuidV7(),
        installationId,
        invocationId,
        runId,
        installationSequence: sequence,
        invocationSequence: sequence,
        schemaVersion: 1,
        type,
        wallClock: new Date().toISOString(),
        monotonicOffsetMs: Date.now(),
        classification,
      };
      return { envelope, classification, type };
    }

    const events: ClassifiedEvent[] = [
      mkEvent('run.started', 'durable', 1),
      mkEvent('run.progress', 'aggregated', 2),
    ];
    const registry: FleetRegistry = buildRegistry(events);

    // Drive the live-view path repeatedly, exactly as an operator's
    // dashboard polling loop would.
    let lastSnapshot: FleetSnapshot | undefined;
    for (let poll = 0; poll < 5; poll += 1) {
      lastSnapshot = fleetSnapshot(registry);
      for (const entry of lastSnapshot.entries) {
        perRunDetail(entry);
      }
    }
    expect(lastSnapshot?.entries.length).toBe(1);

    // Structural guarantee unchanged by T101: the live path made zero
    // calls on the counting store.
    expect(countingStore.totalCalls()).toBe(0);

    // Prove the counting store IS reachable, live wiring — not inert test
    // scaffolding — by now driving the SAME reader through the history
    // path, which legitimately reads origin exactly once (cold cache).
    const history = await runHistory(reader, installationId, runId);
    expect(history.found).toBe(false);
    expect(countingStore.getObjectCalls).toBe(1);

    // And the live path, polled again after the history read, still never
    // touches the store beyond that single, deliberate history read.
    fleetSnapshot(registry);
    expect(countingStore.getObjectCalls).toBe(1);
    expect(countingStore.putObjectCalls).toBe(0);
    expect(countingStore.headObjectCalls).toBe(0);
    expect(countingStore.listObjectsCalls).toBe(0);
  });
});
