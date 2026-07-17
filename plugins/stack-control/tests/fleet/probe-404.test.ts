// specs/036-fleet-control-plane — T094 (RED), Phase 7 (US5 — serve history
// without amplifying the capped store).
//
// data-model.md § Storage layout invariants (~150): "`Cache-Control:
// public, max-age=31536000, immutable` on every object. Never purge...
// Except 404s on the probe path, which bypass cache (a cached 'doesn't
// exist' would stall the plane when the event lands a second later)."
//
// research.md PT-005 (~136-144): "revision-in-the-key +
// `Cache-Control: public, max-age=31536000, immutable` on everything.
// Never purge... One deliberate exception: 404s on the probe path must
// bypass cache. Sequence probing terminates on 404, and Cloudflare caches
// 404s with a short but nonzero TTL — a cached 'doesn't exist' for
// sequence N would stall the plane when event N lands a second later.
// Everything else caches forever; this is the ONE place a no-cache
// decision is required, and it is easy to miss."
//
// THIS TEST pins that decision at the `CdnReader` layer (src/storage/
// cdn-reader.ts, T099), which is where the caching decision is actually
// made (it decides, per read, whether the result becomes cache-eligible):
//   - A 404 (absent key — the exact shape of probing an as-yet-unwritten
//     sequence position, research.md R-01) is NEVER cached: every read of
//     a still-absent key re-checks the origin, so the object appearing a
//     moment later is visible on the very next probe.
//   - A 200 (object present) IS cached — forever, per the immutable
//     invariant above: after the first origin read, further reads of the
//     SAME key never touch origin again, even though (per FR-066)
//     published objects are never mutated, so there is nothing to
//     invalidate.
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
 * A COUNTING `ObjectStorePort` fake whose contents can be mutated mid-test
 * (`seed`) to simulate "the event lands a second later" — the exact
 * scenario PT-005's carve-out exists to protect. Test code only.
 */
class MutableCountingOriginStore implements ObjectStorePort {
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

describe('a 404 on the sequence-probe path is never cached; a 200 is cached forever (T094, PT-005)', () => {
  const probeKey = 'runs/installation-a/run-1/events/0000000003.json';

  it('repeated probes of a still-absent key each bypass cache and each re-check origin', async () => {
    const origin = new MutableCountingOriginStore();
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    // Three probes of a key that does not exist yet — simulating the plane
    // walking 0, 1, 2, ... and finding nothing at sequence 3 yet.
    const first = await reader.readObject(probeKey);
    const second = await reader.readObject(probeKey);
    const third = await reader.readObject(probeKey);

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(third.status).toBe(404);
    expect(first.body).toBeNull();

    // The load-bearing assertion: a cached "doesn't exist" would have
    // collapsed these three probes into ONE origin call after the first.
    // PT-005's carve-out requires every probe of an absent key to bypass
    // cache and re-check origin — so the count must equal the probe count.
    expect(origin.getObjectCalls).toBe(3);
  });

  it('the event landing after prior 404 probes is visible on the very next probe (no stale cached miss)', async () => {
    const origin = new MutableCountingOriginStore();
    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    // Probe twice while absent (as above).
    await reader.readObject(probeKey);
    await reader.readObject(probeKey);
    expect(origin.getObjectCalls).toBe(2);

    // The event lands — the object now exists at this key.
    const payload = new TextEncoder().encode('{"eventId":"...","invocationSequence":3}');
    origin.seed(probeKey, payload);

    // The very next probe must see it immediately — a cached 404 would
    // stall this exact transition (data-model.md § invariants, PT-005).
    const afterLanding = await reader.readObject(probeKey);
    expect(afterLanding.status).toBe(200);
    expect(afterLanding.body).toEqual(payload);
    expect(origin.getObjectCalls).toBe(3);
  });

  it('once a 200 is observed, further reads of the SAME key never touch origin again (cached forever, immutable)', async () => {
    const origin = new MutableCountingOriginStore();
    const eventPayload = new TextEncoder().encode('{"eventId":"...","invocationSequence":7}');
    const eventKey = 'runs/installation-a/run-1/events/0000000007.json';
    origin.seed(eventKey, eventPayload);

    const reader = createCdnReader({ origin, cache: createInMemoryCache() });

    const firstRead = await reader.readObject(eventKey);
    expect(firstRead.status).toBe(200);
    expect(origin.getObjectCalls).toBe(1);

    // Ten further reads of the identical, already-cached key.
    for (let i = 0; i < 10; i += 1) {
      const result = await reader.readObject(eventKey);
      expect(result.status).toBe(200);
      expect(result.body).toEqual(eventPayload);
    }

    // Immutable-forever cache: origin was read exactly once, ever, for
    // this key — the contrast case to the 404 carve-out above.
    expect(origin.getObjectCalls).toBe(1);
  });
});
