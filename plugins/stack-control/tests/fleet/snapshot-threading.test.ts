// specs/037-instance-observability — T010 (RED-first): the D5 payload-threading
// seam (contracts/telemetry-events.md § "Payload-threading contract (D5)";
// data-model.md § "ClassifiedEvent (EXTEND)").
//
// THE SEAM UNDER TEST: an event's bounded `snapshot` (the already-validated,
// ≤ 32 KiB payload — `src/fleet/event.ts:108` `TelemetryEvent.snapshot`) is
// currently DROPPED at the ingest→registry→log boundary:
//
//   1. `toClassifiedEvent` (`src/plane/http/ingest.ts:250-257`) builds a
//      `ClassifiedEvent` from `{ envelope, classification, type }` ONLY — it
//      never copies the envelope's/event's `snapshot`.
//   2. `ClassifiedEvent` (`src/plane/registry.ts:77-81`) has no `snapshot`
//      field for it to land on.
//   3. `parseLine` (`src/plane/event-log.ts:108-123`) rehydrates a persisted
//      line back into `{ envelope, classification, type }` — so even a
//      persisted snapshot would not survive replay.
//
// D5 requires the snapshot to reach `buildInstanceRegistry` and survive a
// plane restart, so `toClassifiedEvent` MUST copy it, `ClassifiedEvent` MUST
// carry it, and the event log MUST persist + replay it. This suite pins that
// end-to-end through the REAL seam (real `ingestEvent`, real `createEventLog`
// over a real tmp dir) — it fails RED today because the snapshot is dropped.
//
// The 32 KiB bound (`MAX_EVENT_SNAPSHOT_BYTES`, `src/fleet/event.ts:50`) is
// UNCHANGED — asserted as a guard, not a change.
//
// Driven with a registered `run.started` (durable) event carrying a realistic
// structured snapshot, deliberately NOT the new `phase.entered`/`session.*`
// types (a sibling task registers those in `classification.ts`) — this isolates
// the RED to the payload-threading seam, not an unknown-event-type failure.
//
// Repo convention (matching every sibling test in tests/fleet/): relative `.js`
// imports under node16 resolution — this plugin configures NO `@/` alias. Real
// node:fs tmp dir, no mocks (.claude/rules/testing.md). No `any`/`as`/
// `@ts-ignore` (Constitution Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mintUuidV7 } from '../../src/fleet/types.js';
import { MAX_EVENT_SNAPSHOT_BYTES, type TelemetryEvent } from '../../src/fleet/event.js';
import {
  createIngestState,
  ingestEvent,
  type DurableEventStore,
  type IngestState,
} from '../../src/plane/http/ingest.js';
import { createEventLog } from '../../src/plane/event-log.js';

/** In-memory fake of the durable-store hand-off seam — legitimate test code,
 * never a production fallback (project no-fallback rule). Mirrors the fake in
 * tests/fleet/ingest.test.ts. */
class FakeDurableEventStore implements DurableEventStore {
  readonly stored: TelemetryEvent[] = [];

  async storeLateEvent(event: TelemetryEvent): Promise<void> {
    this.stored.push(event);
  }
}

function makeDeps(): { durableStore: FakeDurableEventStore } {
  return { durableStore: new FakeDurableEventStore() };
}

interface RawEventOptions {
  readonly eventId?: string;
  readonly type?: string;
  readonly invocationSequence?: number;
}

/** Build a raw, wire-shaped telemetry event (an `unknown` POST body) carrying
 * `snapshot` — the shape `validateTelemetryEvent` accepts. Mirrors the local
 * builder in tests/fleet/ingest.test.ts, extended with a caller-supplied
 * snapshot (the payload whose threading this suite pins). */
function makeRawEvent(snapshot: Record<string, unknown>, options: RawEventOptions = {}): unknown {
  const invocationSequence = options.invocationSequence ?? 1;
  return {
    envelope: {
      eventId: options.eventId ?? mintUuidV7(),
      installationId: 'installation-1',
      invocationId: 'invocation-1',
      runId: 'run-1',
      installationSequence: invocationSequence,
      invocationSequence,
      schemaVersion: 2, // 037 identity-bearing (AUDIT-20260719-16)
      type: options.type ?? 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 12,
      classification: 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    },
    snapshot,
  };
}

const dirsToClean = new Set<string>();
afterEach(() => {
  for (const dir of dirsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirsToClean.clear();
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'scf-snapshot-threading-'));
  dirsToClean.add(dir);
  return dir;
}

describe('D5 payload-threading seam (T010, contracts/telemetry-events.md § Payload-threading)', () => {
  it('(1) toClassifiedEvent COPIES the bounded snapshot onto the ClassifiedEvent (currently DROPPED → RED)', async () => {
    const state: IngestState = createIngestState();
    const deps = makeDeps();

    // A realistic structured status snapshot (the phase.entered shape D5 must
    // carry), ridden on a registered durable event type so the RED isolates
    // the threading seam, not event-type registration.
    const snapshot: Record<string, unknown> = {
      phase: 'implementing',
      from: 'specifying',
      item: 'impl/instance-observability',
      nested: { model: 'opus', attempt: 2 },
    };

    const outcome = await ingestEvent(state, deps, makeRawEvent(snapshot));

    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') throw new Error('unreachable');

    // RED: `toClassifiedEvent` never copies `snapshot`, and `ClassifiedEvent`
    // has no such field, so this is `undefined` today.
    expect(outcome.event.snapshot).toEqual(snapshot);
  });

  it('(2) persisting the ClassifiedEvent to the event log and replaying it RESTORES the snapshot intact', async () => {
    const dir = makeDir();
    const state: IngestState = createIngestState();
    const deps = makeDeps();

    const snapshot: Record<string, unknown> = {
      sessionId: 'session-abc',
      startedAt: '2026-07-18T12:00:00.000Z',
      counters: { runs: 3, phases: 7 },
    };

    const outcome = await ingestEvent(state, deps, makeRawEvent(snapshot));
    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') throw new Error('unreachable');

    // Persist through the REAL append-only log, then rehydrate a fresh runtime
    // over the same durable dir (the plane-restart recovery path).
    const writer = createEventLog(dir);
    writer.append(outcome.event);

    const rehydrated = createEventLog(dir);
    expect(rehydrated.replayed).toHaveLength(1);

    // RED: `parseLine` rebuilds `{ envelope, classification, type }` only, so
    // the replayed event carries no snapshot even if ingest had copied one.
    expect(rehydrated.replayed[0]?.snapshot).toEqual(snapshot);
  });

  it('(3) the 32 KiB snapshot bound (MAX_EVENT_SNAPSHOT_BYTES) is UNCHANGED — an over-size snapshot is still rejected', async () => {
    const state: IngestState = createIngestState();
    const deps = makeDeps();

    // One flat string that pushes the serialized snapshot past the bound (no
    // `history` array — that is a separate, orthogonal rejection).
    const oversize: Record<string, unknown> = {
      blob: 'x'.repeat(MAX_EVENT_SNAPSHOT_BYTES + 128),
    };

    await expect(ingestEvent(state, deps, makeRawEvent(oversize))).rejects.toThrow(
      /MAX_EVENT_SNAPSHOT_BYTES|bounded-snapshot/,
    );
  });
});
