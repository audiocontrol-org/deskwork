// specs/036-fleet-control-plane — T052 (RED), pairs with T052 impl
// (src/plane/http/ingest.ts).
//
// FR-042: "The plane MUST deduplicate by eventId, MUST NOT regress live
// registry state from an older sequence, MUST store late events durably
// rather than discarding them, and MUST surface sequence gaps
// diagnostically." This suite pins the first three MUSTs — dedupe,
// no-regress, late-event durability — plus fail-loud validation
// (Principle V) and delivery semantics (FR-043: at-least-once
// transmission, idempotent ingestion, never exactly-once).
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks (a hand-written in-memory
// `DurableEventStore` fake is legitimate TEST code — the injected seam
// this task exists to make testable without the B2 adapter, T096).

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { TelemetryEvent } from '../../src/fleet/event.js';
import {
  createIngestState,
  ingestEvent,
  type DurableEventStore,
  type IngestState,
} from '../../src/plane/http/ingest.js';

/** In-memory fake of the durable-store hand-off seam. Legitimate test code
 * — never a production fallback (project no-fallback rule). */
class FakeDurableEventStore implements DurableEventStore {
  readonly stored: TelemetryEvent[] = [];

  async storeLateEvent(event: TelemetryEvent): Promise<void> {
    this.stored.push(event);
  }
}

interface RawEventOptions {
  readonly eventId?: string;
  readonly installationId?: string;
  readonly invocationId?: string;
  readonly runId?: string | null;
  readonly installationSequence?: number;
  readonly invocationSequence?: number;
  readonly type?: string;
  readonly classification?: 'live-only' | 'aggregated' | 'durable';
}

/** Build a raw, wire-shaped telemetry event (an `unknown` payload, the
 * shape a real HTTP POST body would carry) satisfying
 * `validateTelemetryEvent`'s requirements. */
function makeRawEvent(options: RawEventOptions = {}): unknown {
  const invocationSequence = options.invocationSequence ?? 1;
  return {
    envelope: {
      eventId: options.eventId ?? mintUuidV7(),
      installationId: options.installationId ?? 'installation-1',
      invocationId: options.invocationId ?? 'invocation-1',
      runId: options.runId === undefined ? 'run-1' : options.runId,
      installationSequence: options.installationSequence ?? invocationSequence,
      invocationSequence,
      schemaVersion: 1,
      type: options.type ?? 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 12,
      classification: options.classification ?? 'durable',
      host: 'test-host',
      path: '/test/installation/root',
      sessionId: null,
    },
    snapshot: {},
  };
}

function makeDeps(): { deps: { durableStore: FakeDurableEventStore }; store: FakeDurableEventStore } {
  const store = new FakeDurableEventStore();
  return { deps: { durableStore: store }, store };
}

describe('telemetry ingest (T052, FR-042/FR-043)', () => {
  it('(a) a valid event ingests once — accepted, advances no-regress state', async () => {
    const state: IngestState = createIngestState();
    const { deps } = makeDeps();

    const outcome = await ingestEvent(state, deps, makeRawEvent({ invocationSequence: 1 }));

    expect(outcome.kind).toBe('accepted');
    if (outcome.kind !== 'accepted') throw new Error('unreachable');
    expect(outcome.event.envelope.invocationSequence).toBe(1);
  });

  it('(b) re-ingesting the same eventId is idempotent — no double-apply', async () => {
    const state: IngestState = createIngestState();
    const { deps } = makeDeps();
    const eventId = mintUuidV7();
    const raw = makeRawEvent({ eventId, invocationSequence: 1 });

    const first = await ingestEvent(state, deps, raw);
    const second = await ingestEvent(state, deps, raw);

    expect(first.kind).toBe('accepted');
    expect(second.kind).toBe('duplicate');
    if (second.kind !== 'duplicate') throw new Error('unreachable');
    expect(second.eventId).toBe(eventId);
  });

  it('(c) an older-invocationSequence event does NOT regress applied state (no-regress, FR-042/SC-015)', async () => {
    const state: IngestState = createIngestState();
    const { deps } = makeDeps();
    const runId = 'run-no-regress';

    const started = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.started', invocationSequence: 1 }),
    );
    const progress = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.progress', invocationSequence: 5 }),
    );
    // A later-arriving event carrying an OLDER sequence than what is
    // already applied (5) must not walk state backward.
    const older = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.progress', invocationSequence: 2 }),
    );

    expect(started.kind).toBe('accepted');
    expect(progress.kind).toBe('accepted');
    expect(older.kind).toBe('stale');

    // Prove the high-water mark truly stayed at 5, not reset to 2: a
    // fresh event at sequence 3 (newer than the stale 2, but NOT newer
    // than the already-applied 5) must ALSO be stale, not accepted.
    const stillStale = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.progress', invocationSequence: 3 }),
    );
    expect(stillStale.kind).toBe('stale');

    // A genuinely newer sequence (6) still advances normally.
    const newer = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.progress', invocationSequence: 6 }),
    );
    expect(newer.kind).toBe('accepted');
  });

  it('(d) a malformed event is REJECTED with a descriptive error (fail loud, not silently dropped)', async () => {
    const state: IngestState = createIngestState();
    const { deps } = makeDeps();

    await expect(ingestEvent(state, deps, { envelope: { eventId: 'only-an-eventId' } })).rejects.toThrow(
      /expected/i,
    );
    await expect(ingestEvent(state, deps, null)).rejects.toThrow();
    await expect(ingestEvent(state, deps, 'not an object')).rejects.toThrow();
  });

  it('(e) a late event (arriving after a run looks final) is handed to the durable-store seam, not discarded', async () => {
    const state: IngestState = createIngestState();
    const { deps, store } = makeDeps();
    const runId = 'run-late';

    const started = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.started', invocationSequence: 1 }),
    );
    const completed = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.completed', invocationSequence: 2 }),
    );
    expect(started.kind).toBe('accepted');
    expect(completed.kind).toBe('accepted');
    expect(store.stored).toHaveLength(0);

    // A straggler that arrives after the run already finalized.
    const straggler = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId, type: 'run.progress', invocationSequence: 3 }),
    );

    expect(straggler.kind).toBe('late');
    expect(store.stored).toHaveLength(1);
    expect(store.stored[0]?.envelope.invocationSequence).toBe(3);
    expect(store.stored[0]?.envelope.runId).toBe(runId);
  });

  it('non-run events (runId null, short verbs) skip no-regress tracking — dedupe is their only guard', async () => {
    const state: IngestState = createIngestState();
    const { deps } = makeDeps();

    const first = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId: null, type: 'invocation.completed', invocationSequence: 9 }),
    );
    const second = await ingestEvent(
      state,
      deps,
      makeRawEvent({ runId: null, type: 'invocation.completed', invocationSequence: 1 }),
    );

    expect(first.kind).toBe('accepted');
    // No run to regress against — a "lower sequence" non-run event is
    // still a fresh, distinct eventId, so it is accepted, not stale.
    expect(second.kind).toBe('accepted');
  });
});
