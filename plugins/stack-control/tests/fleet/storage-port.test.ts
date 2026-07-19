/**
 * specs/036-fleet-control-plane — T008 (RED), pairs with T008 impl in the
 * same task (`src/storage/port.ts`).
 *
 * data-model.md § Storage layout + § invariants (line ~134-152) and
 * research.md § R-04 (line ~78-86) pin what the plane's object-store
 * capability actually needs:
 *
 *   - `putObject`  — write an immutable object at a deterministic key.
 *     Published objects are NEVER mutated (FR-066); a duplicate PUT is a
 *     no-op because upstream never writes non-identical bytes to the same
 *     key (FR-049 byte-identity) — the port does not need special
 *     compare-and-set semantics, plain overwrite-by-key is sufficient and
 *     harmless.
 *   - `getObject`  — read an object's full bytes; returns `null` (never
 *     throws) when the key is absent, because "does this key exist yet" is
 *     a *legitimate* outcome of sequence probing (research.md R-01's
 *     rationale: "the plane should walk 0, 1, 2, … → 404"), not an error.
 *   - `headObject` — existence + size WITHOUT the body. This is what R-04's
 *     "off-hot-path reconciliation backstop... diffs stored objects against
 *     a manifest" actually needs: presence/size checks over N objects
 *     without paying for N full-body downloads.
 *   - `listObjects` — prefix listing. Justified *only* as the R-04 backstop
 *     ("listing survives only as an off-hot-path reconciliation backstop");
 *     the hot read path never lists (R-04, R-01).
 *
 * Deliberately ABSENT (do not add speculatively):
 *   - delete / purge — data-model.md § invariants: "Never purge... staleness
 *     is unrepresentable rather than operationally avoided."
 *   - ACL / bucket-policy knobs — not required by any FR; that is the B2
 *     adapter's (vendor-specific) concern, not the capability contract.
 *   - cache-control / content-type parameters — every object is uniformly
 *     `Cache-Control: public, max-age=31536000, immutable` (data-model.md
 *     § invariants) and JSON (storage layout paths are all `.json`); this is
 *     an adapter-side constant, not a per-call, per-vendor knob.
 *
 * This test proves the port is a clean, VENDOR-FREE capability interface by
 * implementing it entirely with an in-memory FAKE (test code only — never a
 * production fallback) and exercising put/get/head/list, including the
 * null-on-absent behavior sequence probing depends on. No vendor identity
 * (no "B2", no vendor SDK) appears anywhere in this file or in
 * `src/storage/port.ts`.
 *
 * This repo's convention is relative `.js` imports under node16 module
 * resolution (no `@/` alias configured).
 */

import { describe, expect, it } from 'vitest';
import type { ObjectMetadata, ObjectStorePort } from '../../src/storage/port.js';

/**
 * In-memory fake implementing `ObjectStorePort`. Legitimate TEST code
 * (never shipped, never a src/ fallback) — its only job is to prove the
 * port is implementable without any vendor SDK.
 */
class FakeObjectStore implements ObjectStorePort {
  private readonly objects = new Map<string, Uint8Array>();

  async putObject(input: { readonly key: string; readonly body: Uint8Array }): Promise<void> {
    this.objects.set(input.key, input.body);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null;
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    const body = this.objects.get(key);
    if (body === undefined) {
      return null;
    }
    return { key, size: body.byteLength };
  }

  async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
    const results: ObjectMetadata[] = [];
    for (const [key, body] of this.objects) {
      if (key.startsWith(prefix)) {
        results.push({ key, size: body.byteLength });
      }
    }
    return results;
  }
}

describe('vendor-free object-store port (T008, data-model § Storage layout / research § R-04)', () => {
  it('putObject then getObject round-trips the exact bytes', async () => {
    const store: ObjectStorePort = new FakeObjectStore();
    const key = 'runs/inst-1/run-1/events/0000000001.json';
    const body = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));

    await store.putObject({ key, body });
    const read = await store.getObject(key);

    expect(read).not.toBeNull();
    expect(read).toEqual(body);
  });

  it('getObject returns null (never throws) for an absent key — the sequence-probing contract', async () => {
    const store: ObjectStorePort = new FakeObjectStore();

    const read = await store.getObject('runs/inst-1/run-1/events/9999999999.json');

    expect(read).toBeNull();
  });

  it('sequence probing walks 0, 1, 2, … and terminates cleanly on the first absent key (R-01 rationale)', async () => {
    const store: ObjectStorePort = new FakeObjectStore();
    const base = 'runs/inst-1/run-1/events/';
    const encoder = new TextEncoder();

    await store.putObject({ key: `${base}0000000000.json`, body: encoder.encode('{}') });
    await store.putObject({ key: `${base}0000000001.json`, body: encoder.encode('{}') });
    await store.putObject({ key: `${base}0000000002.json`, body: encoder.encode('{}') });

    let seq = 0;
    let found = 0;
    // Walk until the first miss — proves the port supports probing without
    // ever needing `list` on the hot path (R-04).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const key = `${base}${String(seq).padStart(10, '0')}.json`;
      const obj = await store.getObject(key);
      if (obj === null) {
        break;
      }
      found += 1;
      seq += 1;
    }

    expect(found).toBe(3);
    expect(seq).toBe(3);
  });

  it('headObject reports key + size without exposing the body, and null when absent', async () => {
    const store: ObjectStorePort = new FakeObjectStore();
    const key = 'runs/inst-1/run-1/manifest-1.json';
    const body = new TextEncoder().encode(JSON.stringify({ revision: 1 }));

    const beforePut = await store.headObject(key);
    expect(beforePut).toBeNull();

    await store.putObject({ key, body });
    const afterPut = await store.headObject(key);

    expect(afterPut).not.toBeNull();
    expect(afterPut?.key).toBe(key);
    expect(afterPut?.size).toBe(body.byteLength);
  });

  it('listObjects is a prefix backstop — returns only keys under the run, never siblings (R-04)', async () => {
    const store: ObjectStorePort = new FakeObjectStore();
    const encoder = new TextEncoder();

    await store.putObject({
      key: 'runs/inst-1/run-1/events/0000000000.json',
      body: encoder.encode('{}'),
    });
    await store.putObject({
      key: 'runs/inst-1/run-1/events/0000000001.json',
      body: encoder.encode('{}'),
    });
    await store.putObject({
      key: 'runs/inst-1/run-2/events/0000000000.json',
      body: encoder.encode('{}'),
    });

    const listed = await store.listObjects('runs/inst-1/run-1/');

    expect(listed).toHaveLength(2);
    expect(listed.map((o) => o.key).sort()).toEqual([
      'runs/inst-1/run-1/events/0000000000.json',
      'runs/inst-1/run-1/events/0000000001.json',
    ]);
  });

  it('a duplicate putObject at the same key is a harmless overwrite (FR-049 byte-identity makes this a no-op in practice)', async () => {
    const store: ObjectStorePort = new FakeObjectStore();
    const key = 'runs/inst-1/run-1/events/0000000000.json';
    const body = new TextEncoder().encode(JSON.stringify({ v: 1 }));

    await store.putObject({ key, body });
    await store.putObject({ key, body });
    const read = await store.getObject(key);

    expect(read).toEqual(body);
  });
});
