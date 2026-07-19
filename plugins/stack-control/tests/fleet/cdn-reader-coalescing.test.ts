// specs/036-fleet-control-plane — AUDIT-20260718-10 (RED-first): cdn-reader
// in-flight request coalescing.
//
// THE DEFECT: `createCdnReader().readObject()` checked `cache.get(key)` and
// only on a miss awaited `origin.getObject(key)`, with NO per-key in-flight
// coalescing. N CONCURRENT callers for the same not-yet-cached key each
// independently reached `origin.getObject` — directly amplifying origin
// (B2) transactions with client traffic, the exact defect this module's own
// header states it exists to prevent (SC-008: "origin transactions FLAT as
// client traffic scales").
//
// THIS TEST fires N concurrent `readObject(sameKey)` calls BEFORE the first
// origin read resolves (a controllable, manually-resolved fake origin) and
// asserts `origin.getObject` was called EXACTLY ONCE, and every one of the N
// callers received the correct settled value.
//
// Real-shaped fakes only (no mocked filesystem/network — this module has
// neither; `CountingOriginStore` is the same style of test double the
// existing tests/fleet/read-amplification.test.ts uses for this module).
// Relative `.js` imports under node16 resolution. No `any`/`as`/
// `@ts-ignore` (Constitution Principle VI).

import { describe, expect, it } from 'vitest';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
import { createCdnReader, createInMemoryCache } from '../../src/storage/cdn-reader.js';

/**
 * A COUNTING `ObjectStorePort` fake whose `getObject` does NOT resolve
 * until `resolveAll` is called — this is what lets the test hold N
 * concurrent `readObject` calls open at once and observe how many times
 * origin was actually reached before any of them settle.
 */
class CountingOriginStore implements ObjectStorePort {
  getObjectCalls = 0;
  private readonly objects = new Map<string, Uint8Array>();
  private readonly pendingResolvers: Array<(value: Uint8Array | null) => void> = [];

  seed(key: string, body: Uint8Array): void {
    this.objects.set(key, body);
  }

  async putObject(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, input.body);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    this.getObjectCalls += 1;
    return new Promise((resolve) => {
      this.pendingResolvers.push(() => resolve(this.objects.get(key) ?? null));
    });
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    const body = this.objects.get(key);
    return body === undefined ? null : { key, size: body.byteLength };
  }

  async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, body]) => ({ key, size: body.byteLength }));
  }

  /** Settle every `getObject` call issued so far. */
  resolveAll(): void {
    const resolvers = this.pendingResolvers.splice(0, this.pendingResolvers.length);
    for (const resolve of resolvers) {
      resolve(null);
    }
  }
}

describe('cdn-reader coalesces concurrent cold reads of the same key (AUDIT-20260718-10)', () => {
  it('N concurrent readObject(sameKey) calls before origin resolves cost origin exactly ONE call, and all N callers get the value', async () => {
    const origin = new CountingOriginStore();
    const key = 'runs/installation-a/run-1/derived/summary-0.json';
    const body = new TextEncoder().encode('{"phase":"execution","durationMs":4200}');
    origin.seed(key, body);

    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    // Fire 25 concurrent reads of the SAME uncached key before origin's
    // getObject has resolved for any of them.
    const N = 25;
    const inFlightReads = Array.from({ length: N }, () => reader.readObject(key));

    // The load-bearing assertion: even with N concurrent callers all
    // missing the cache, origin was reached exactly once.
    expect(origin.getObjectCalls).toBe(1);

    // Now let the single in-flight origin read settle.
    origin.resolveAll();
    const results = await Promise.all(inFlightReads);

    expect(results).toHaveLength(N);
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.body).toEqual(body);
    }
    // Still exactly one origin call after every caller has resolved.
    expect(origin.getObjectCalls).toBe(1);
  });

  it('a SECOND wave of concurrent reads, issued only after the first wave settled into cache, costs origin nothing further', async () => {
    const origin = new CountingOriginStore();
    const key = 'runs/installation-b/run-2/derived/summary-0.json';
    origin.seed(key, new TextEncoder().encode('{"run":"2"}'));
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    const firstWave = Array.from({ length: 10 }, () => reader.readObject(key));
    expect(origin.getObjectCalls).toBe(1);
    origin.resolveAll();
    await Promise.all(firstWave);
    expect(origin.getObjectCalls).toBe(1);

    // A second wave, well after the first settled and populated the cache —
    // this must be served entirely from cache, no new in-flight coalescing
    // even needed.
    const secondWave = await Promise.all(Array.from({ length: 40 }, () => reader.readObject(key)));
    expect(secondWave).toHaveLength(40);
    for (const result of secondWave) {
      expect(result.status).toBe(200);
    }
    expect(origin.getObjectCalls).toBe(1);
  });

  it('coalescing is per-key: concurrent reads of TWO distinct cold keys cost origin exactly one call PER key', async () => {
    const origin = new CountingOriginStore();
    const keyA = 'runs/installation-a/run-1/derived/summary-0.json';
    const keyB = 'runs/installation-b/run-2/derived/summary-0.json';
    origin.seed(keyA, new TextEncoder().encode('{"run":"a"}'));
    origin.seed(keyB, new TextEncoder().encode('{"run":"b"}'));
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    const readsA = Array.from({ length: 12 }, () => reader.readObject(keyA));
    const readsB = Array.from({ length: 12 }, () => reader.readObject(keyB));

    // Two distinct cold keys, coalesced independently: exactly 2 origin
    // calls total, never 24.
    expect(origin.getObjectCalls).toBe(2);

    origin.resolveAll();
    const [resultsA, resultsB] = await Promise.all([Promise.all(readsA), Promise.all(readsB)]);
    for (const result of resultsA) expect(result.status).toBe(200);
    for (const result of resultsB) expect(result.status).toBe(200);
    expect(origin.getObjectCalls).toBe(2);
  });
});
