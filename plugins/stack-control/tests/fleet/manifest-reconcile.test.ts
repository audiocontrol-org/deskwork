/**
 * specs/036-fleet-control-plane — T095 (RED), pairs with T100 impl
 * (`src/plane/archive/reconcile.ts`).
 *
 * research.md § R-04 (line ~78-86):
 *   "Listing survives only as an off-hot-path reconciliation backstop that
 *    diffs stored objects against a manifest — the one mechanism that
 *    catches a lost manifest write, which is otherwise a silent lie of
 *    omission."
 * research.md § PT-004 (line ~122-134):
 *   "Immutable period manifests replace listing on the read path... The
 *    plane's own index resolves the manifest-revision pointer — no
 *    mutable `latest.json`, no listing to find the newest revision."
 * data-model.md § Storage layout invariants (line ~149-152) — objects are
 *   never mutated and never purged; the port itself (`src/storage/port.ts`,
 *   T008) has no delete method at all — "never deletes" is partly
 *   structural (the capability doesn't exist to call) and this test
 *   additionally proves reconciliation is READ-ONLY (it never even PUTs).
 *
 * Manifest writes happen STRICTLY AFTER event PUTs ack (T097). If the
 * manifest write itself is lost (process dies between the last event PUT
 * and the manifest PUT), the events are durably stored but UNDOCUMENTED —
 * a silent lie of omission, because the hot read path (sequence probing /
 * canned manifest reads, R-01/PT-004) never lists and so would never
 * notice. This test proves the LISTING backstop is the one thing that
 * catches it: given event objects on disk and NO manifest, reconciliation
 * (by listing the bucket) rediscovers the orphaned event objects.
 *
 * RED: `src/plane/archive/reconcile.ts` does not exist yet — the VALUE
 * import below fails at module-load (module-not-found), the correct
 * failing-first signal, never a typo.
 *
 * Relative `.js` imports (node16 module resolution, no `@/` alias). No
 * `any`, no `as`, no `@ts-ignore`.
 */

import { describe, expect, it } from 'vitest';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
import { reconcileRun } from '../../src/plane/archive/reconcile.js';

/**
 * In-memory RECORDING fake of `ObjectStorePort`. Legitimate TEST code
 * (never a production fallback) — counts every method invocation so
 * "off the hot path" / "never mutates" are falsifiable call-counts, not
 * narrative claims. `resetCounts()` lets a test separate SETUP writes
 * (preloading fixture objects) from the calls reconciliation itself makes.
 */
class RecordingObjectStore implements ObjectStorePort {
  private readonly objects = new Map<string, Uint8Array>();
  putCalls = 0;
  getCalls = 0;
  headCalls = 0;
  listCalls = 0;

  async putObject(input: PutObjectInput): Promise<void> {
    this.putCalls += 1;
    this.objects.set(input.key, input.body);
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    this.getCalls += 1;
    return this.objects.get(key) ?? null;
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    this.headCalls += 1;
    const body = this.objects.get(key);
    if (body === undefined) {
      return null;
    }
    return { key, size: body.byteLength };
  }

  async listObjects(prefix: string): Promise<readonly ObjectMetadata[]> {
    this.listCalls += 1;
    const results: ObjectMetadata[] = [];
    for (const [key, body] of this.objects) {
      if (key.startsWith(prefix)) {
        results.push({ key, size: body.byteLength });
      }
    }
    return results;
  }

  resetCounts(): void {
    this.putCalls = 0;
    this.getCalls = 0;
    this.headCalls = 0;
    this.listCalls = 0;
  }
}

const encoder = new TextEncoder();
const installationId = 'installation-1';
const runId = 'run-lost-manifest';
const eventPrefix = `runs/${installationId}/${runId}/events/`;

/** Preload 3 event objects on disk WITHOUT a manifest — the lost-write
 * scenario: the events made it, the manifest PUT that documents them did
 * not. */
async function seedEventsWithoutManifest(store: RecordingObjectStore): Promise<readonly string[]> {
  const keys = [
    `${eventPrefix}0000000001.json`,
    `${eventPrefix}0000000002.json`,
    `${eventPrefix}0000000003.json`,
  ];
  for (const key of keys) {
    await store.putObject({ key, body: encoder.encode(JSON.stringify({ eventId: key })) });
  }
  return keys;
}

describe('manifest-reconcile backstop (T095, research § R-04/PT-004)', () => {
  it('a LOST manifest write is caught by the listing backstop — orphaned event objects are rediscovered', async () => {
    const store = new RecordingObjectStore();
    const eventKeys = await seedEventsWithoutManifest(store);
    // Deliberately NO manifest object written — the lost-write scenario.

    const report = await reconcileRun({ store }, { installationId, runId });

    expect(report.manifestFound).toBe(false);
    expect([...report.orphanedEventKeys].sort()).toEqual([...eventKeys].sort());
  });

  it('a PRESENT manifest means nothing is orphaned — the backstop only signals when the write was actually lost', async () => {
    const store = new RecordingObjectStore();
    const eventKeys = await seedEventsWithoutManifest(store);
    // The manifest write that DID succeed this time.
    await store.putObject({
      key: `runs/${installationId}/${runId}/manifest-1.json`,
      body: encoder.encode(JSON.stringify({ revision: 1, eventKeys })),
    });

    const report = await reconcileRun({ store }, { installationId, runId });

    expect(report.manifestFound).toBe(true);
    expect(report.orphanedEventKeys).toEqual([]);
  });

  it('the backstop is READ-ONLY and off the hot path: it lists, but never GETs a body and never PUTs — it never deletes (the port has no delete method to call)', async () => {
    const store = new RecordingObjectStore();
    await seedEventsWithoutManifest(store);
    store.resetCounts(); // isolate reconcileRun's OWN calls from setup writes

    await reconcileRun({ store }, { installationId, runId });

    expect(store.listCalls).toBeGreaterThanOrEqual(1);
    expect(store.getCalls).toBe(0);
    expect(store.putCalls).toBe(0);
    // `ObjectStorePort` (src/storage/port.ts, T008) declares no delete/purge
    // method at all (data-model.md § invariants: "Never purge") — so
    // "never deletes" is structurally enforced; there is nothing further
    // to invoke.
  });
});
