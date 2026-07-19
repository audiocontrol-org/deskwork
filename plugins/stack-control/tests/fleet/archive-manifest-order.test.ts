/**
 * specs/036-fleet-control-plane — T097 (author-supplied ordering test).
 *
 * data-model.md § Storage layout invariants — the ORDERING CONTRACT the
 * committed RED tests do not pin (flagged by the cluster-B author): a run
 * manifest is written STRICTLY AFTER all of its referenced event objects have
 * been PUT and acked. A reader that observes the manifest can therefore trust
 * that every event object the manifest references already exists.
 *
 * This test injects a RECORDING fake `ObjectStorePort` that appends each
 * PUT'd key to an ordered log at the moment the PUT is observed. The assertion
 * is falsifiable and operator-perceivable: the manifest key's position in the
 * log is strictly greater than EVERY referenced event key's position. If
 * `writeManifest` ever issued the manifest PUT before (or interleaved with)
 * an event PUT, the manifest would not be last and the test would fail.
 *
 * Relative `.js` imports (node16 module resolution, no `@/` alias). No `any`,
 * no `as`, no `@ts-ignore`.
 */

import { describe, expect, it } from 'vitest';
import type { ObjectMetadata, ObjectStorePort, PutObjectInput } from '../../src/storage/port.js';
import {
  eventObjectKey,
  manifestObjectKey,
  writeManifest,
  type ArchiveEventInput,
} from '../../src/plane/archive/writer.js';

/**
 * In-memory RECORDING fake that captures the ORDER of PUTs. Legitimate TEST
 * code (never a production fallback) — `putOrder` is the observable timeline
 * the ordering contract is asserted against.
 */
class OrderRecordingObjectStore implements ObjectStorePort {
  private readonly objects = new Map<string, Uint8Array>();
  readonly putOrder: string[] = [];

  async putObject(input: PutObjectInput): Promise<void> {
    this.putOrder.push(input.key);
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

const encoder = new TextEncoder();

describe('manifest ordering contract (T097, data-model § Storage layout invariants)', () => {
  it('writes the manifest STRICTLY AFTER every event object it references has been PUT', async () => {
    const store = new OrderRecordingObjectStore();
    const installationId = 'installation-1';
    const runId = 'run-manifest';

    const events: readonly ArchiveEventInput[] = [1, 2, 3].map((invocationSequence) => ({
      installationId,
      runId,
      invocationSequence,
      body: encoder.encode(JSON.stringify({ eventId: `e${invocationSequence}` })),
    }));

    const { manifestKey, eventKeys } = await writeManifest(
      { store },
      { installationId, runId, revision: 1, events, manifestBody: encoder.encode(JSON.stringify({ count: 3 })) },
    );

    // The returned keys are the deterministic ones.
    expect(eventKeys).toEqual([
      eventObjectKey({ installationId, runId, invocationSequence: 1 }),
      eventObjectKey({ installationId, runId, invocationSequence: 2 }),
      eventObjectKey({ installationId, runId, invocationSequence: 3 }),
    ]);
    expect(manifestKey).toBe(manifestObjectKey({ installationId, runId, revision: 1 }));

    // Every key was PUT exactly once, and all four are present.
    expect(store.putOrder.length).toBe(4);

    // THE CONTRACT: the manifest PUT is observed AFTER every event PUT it
    // references. Its index strictly exceeds each event key's index.
    const manifestIndex = store.putOrder.indexOf(manifestKey);
    expect(manifestIndex).toBe(3); // last of the four
    for (const eventKey of eventKeys) {
      const eventIndex = store.putOrder.indexOf(eventKey);
      expect(eventIndex).toBeGreaterThanOrEqual(0);
      expect(manifestIndex).toBeGreaterThan(eventIndex);
    }
  });
});
