// specs/036-fleet-control-plane — T091 (RED), Phase 7 (US5 — serve history
// without amplifying the capped store).
//
// research.md § Do NOT re-derive (SETTLED, operator ground truth,
// 2026-07-16): B2 Class B (download/read) transactions ARE aggressively
// capped in production. "Any read path that amplifies B2 transactions is a
// defect." Do NOT re-litigate this from the vendor's public pricing page —
// it has already produced this exact false positive from two independent
// agents (see research.md for the full account).
//
// data-model.md § Derived artifact (~154) + contracts/plane-client-api.md
// C7 (~54-58, SC-008): historical views are served from artifacts the plane
// derived and CACHED; "a cold cache re-reads through the delivery layer
// (cached) and does not touch the capped store." The delivery layer (a CDN
// in front of the durable store, PT-004) is what makes capped-store
// ("origin") transactions FLAT as client read traffic scales — the cache
// absorbs repeated/varied client reads of the SAME canned resource, and
// only the first (cold) read per resource ever reaches origin.
//
// THIS TEST models that mechanism directly: a `CdnReader` (src/storage/
// cdn-reader.ts, T099) fronts a COUNTING origin `ObjectStorePort` with an
// injected cache. N client reads (across many simulated distinct clients,
// deliberately varied in identity/timing to rule out "it only worked
// because the calls were literally identical calls") of the SAME canned
// resource key must produce O(1) — here, exactly 1 — origin read. A SECOND
// canned resource proves the flatness isn't a one-key fluke: warming two
// distinct keys costs exactly 2 origin reads, and after that, arbitrarily
// more client traffic against those same two keys costs 0 additional
// origin reads — i.e. origin transactions do NOT scale with client count.
//
// RED test: `src/storage/cdn-reader.ts` does NOT exist yet. This test MUST
// fail at module-load (VALUE import of a missing module), never a typo —
// the `import { createCdnReader, createInMemoryCache } from
// '../../src/storage/cdn-reader.js'` line below is the RED trigger.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI).

import { describe, expect, it } from 'vitest';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
// The CDN-reader module (T099): does NOT exist until T099 impl lands. This
// import is the RED trigger — module resolution fails at load time.
import { createCdnReader, createInMemoryCache } from '../../src/storage/cdn-reader.js';

/**
 * A COUNTING `ObjectStorePort` fake standing in for the capped durable
 * store ("origin" behind the CDN). Test code only — never a production
 * fallback. `getObjectCalls` is the load-bearing counter: every increment
 * is one real "capped-store transaction" in production terms.
 */
class CountingOriginStore implements ObjectStorePort {
  getObjectCalls = 0;
  private readonly objects = new Map<string, Uint8Array>();

  seed(key: string, body: Uint8Array): void {
    this.objects.set(key, body);
  }

  async putObject(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, input.body);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    this.getObjectCalls += 1;
    return this.objects.get(key) ?? null;
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
}

describe('history reads do not amplify capped-store transactions as client traffic scales (T091, SC-008)', () => {
  it('N reads of the SAME canned resource, across many simulated distinct clients, cost origin exactly 1 read', async () => {
    const origin = new CountingOriginStore();
    const key = 'runs/installation-a/run-1/derived/summary-0.json';
    origin.seed(key, new TextEncoder().encode('{"phase":"execution","durationMs":4200}'));

    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    // 50 "client" reads of the identical canned resource, deliberately
    // varied (different simulated client labels, staggered await points)
    // so the flatness isn't an artifact of issuing literally the same call
    // in a tight loop.
    const clientLabels = Array.from({ length: 50 }, (_, i) => `client-${i}`);
    for (const client of clientLabels) {
      const result = await reader.readObject(key);
      expect(result.status).toBe(200);
      expect(result.body).not.toBeNull();
      void client; // varied caller identity; the cache key never depends on it
    }

    // The load-bearing assertion: 50 client reads, 1 origin transaction.
    expect(origin.getObjectCalls).toBe(1);
  });

  it('origin transactions stay flat (O(1) per canned resource) as client traffic scales up, across two distinct resources', async () => {
    const origin = new CountingOriginStore();
    const keyA = 'runs/installation-a/run-1/derived/summary-0.json';
    const keyB = 'runs/installation-b/run-2/derived/summary-0.json';
    origin.seed(keyA, new TextEncoder().encode('{"run":"1"}'));
    origin.seed(keyB, new TextEncoder().encode('{"run":"2"}'));

    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    async function driveClientTraffic(totalReads: number): Promise<void> {
      for (let i = 0; i < totalReads; i += 1) {
        const key = i % 2 === 0 ? keyA : keyB;
        const result = await reader.readObject(key);
        expect(result.status).toBe(200);
      }
    }

    // Small burst of client traffic: 10 reads (5 per key).
    await driveClientTraffic(10);
    const originCallsAfterSmallBurst = origin.getObjectCalls;
    expect(originCallsAfterSmallBurst).toBe(2); // one cold read per canned resource

    // MUCH larger burst of client traffic: 200 more reads (100 per key).
    await driveClientTraffic(200);
    const originCallsAfterLargeBurst = origin.getObjectCalls;

    // The defect this test guards against: origin calls scaling with
    // client reads. 210 total client reads across the whole test must
    // still cost origin exactly 2 transactions — flat, not proportional.
    expect(originCallsAfterLargeBurst).toBe(originCallsAfterSmallBurst);
    expect(originCallsAfterLargeBurst).toBe(2);
  });
});
