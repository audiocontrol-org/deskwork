// specs/036-fleet-control-plane — T139 (RED), Phase 6 (US4 — trust what the
// fleet says), pairs with an EXTENSION to `src/plane/http/ingest.ts` (T052's
// impl, already shipped) that this task's implementation must add.
//
// CONTRACT UNDER TEST (spec.md FR-042a): "The plane's `eventId` deduplication
// MUST be understood and documented as an OPTIMIZATION, not a correctness
// mechanism — FR-042's no-regress rule plus deterministic object naming
// (FR-063) and byte-identity (FR-049) make ingestion correct with the dedupe
// set entirely absent." T052 (ingest.ts) implements dedupe UNCONDITIONALLY
// and T079 (dedupe-reorder.test.ts) tests it PRESENT — this is the first test
// that pins the claim ITSELF: turn dedupe OFF and prove correctness survives
// on no-regress + downstream idempotency alone.
//
// WHAT "correct despite no dedupe" ACTUALLY MEANS HERE (worked out from the
// existing ingest.ts no-regress logic, not asserted blindly): for a RUN event,
// the existing no-regress guard (`invocationSequence <= runState.
// latestInvocationSequence` => 'stale') ALREADY catches an exact duplicate
// (same eventId => same invocationSequence, since the sidecar assigns both
// together and FR-049 byte-identity means a retry resends the identical
// envelope) independently of the eventId dedupe set. So disabling dedupe
// does NOT change whether a run-event duplicate gets re-applied — it changes
// WHICH outcome KIND is returned for it: 'duplicate' (dedupe catches it first)
// vs 'stale' (no-regress catches it once dedupe is out of the way). For a
// NON-RUN event (`runId: null` — short verbs), there is no no-regress
// tracking at all (the existing module comment says so explicitly: "dedupe
// is their only guard") — so with dedupe OFF, a non-run duplicate DOES flow
// through ingest as 'accepted' twice. Correctness there falls to the
// REGISTRY layer: `buildRegistry`'s `recordTiming` keeps only the
// highest-`invocationSequence` reading per invocation, which is naturally
// idempotent against being called twice with the SAME envelope — so the
// final registry state is unaffected either way. Both sub-scenarios are
// exercised below.
//
// SEAM CHOSEN (the seam this test needs and does not yet exist): a new
// optional `dedupe` flag on `createIngestState`, defaulting to enabled (so
// every EXISTING caller/test — including T079/T052's own suite — keeps
// today's behavior unchanged):
//
//   export interface IngestStateOptions {
//     readonly dedupe?: boolean; // default true
//   }
//   export function createIngestState(options?: IngestStateOptions): IngestState;
//
// WHY THIS IS RED BUT NOT A MODULE-LOAD FAILURE: `src/plane/http/ingest.ts`
// already exists (T052 shipped it) and already exports `createIngestState` /
// `ingestEvent`, so importing them does NOT fail at module load. The RED
// here is a genuine BEHAVIORAL failure: today's `createIngestState()` takes
// no parameters and ALWAYS dedupes, so calling `createIngestState({ dedupe:
// false })` silently ignores the option (extra call argument, unused) and
// the assertions below — which require dedupe to actually be OFF — fail
// against the current, unextended implementation. This is the "import the
// seam and let the missing OPTION be the RED" shape T139's brief calls for,
// not a typo: every assertion traces to the FR-042a claim, and each fails
// for a stated, specific reason (see inline comments at each assertion).
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks (the in-memory `DurableEventStore` fake is
// legitimate test code per the project's testing rules, mirroring ingest.
// test.ts's own fake).

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { TelemetryEvent } from '../../src/fleet/event.js';
import {
  createIngestState,
  ingestEvent,
  type DurableEventStore,
  type IngestState,
} from '../../src/plane/http/ingest.js';
import { buildRegistry, type ClassifiedEvent } from '../../src/plane/registry.js';

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
  readonly invocationSequence?: number;
  readonly type?: string;
  readonly classification?: 'live-only' | 'aggregated' | 'durable';
}

function makeRawEvent(options: RawEventOptions = {}): TelemetryEvent {
  const invocationSequence = options.invocationSequence ?? 1;
  const runId = options.runId === undefined ? 'run-1' : options.runId;
  return {
    envelope: {
      eventId: options.eventId ?? mintUuidV7(),
      installationId: options.installationId ?? 'installation-1',
      invocationId: options.invocationId ?? 'invocation-1',
      runId,
      installationSequence: invocationSequence,
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

function makeDeps(): { deps: { durableStore: FakeDurableEventStore } } {
  return { deps: { durableStore: new FakeDurableEventStore() } };
}

describe('eventId dedupe is an optimization, not a correctness mechanism (T139, FR-042a)', () => {
  it('non-run (short-verb) duplicate: with dedupe DISABLED, both deliveries are "accepted" — yet registry.timings() stays correct', async () => {
    // The seam this test needs: createIngestState({ dedupe: false }).
    // Current signature is createIngestState() with no parameters, so this
    // call today silently ignores the option and dedupe stays hardwired on.
    const state: IngestState = createIngestState({ dedupe: false });
    const { deps } = makeDeps();

    const invocationId = 'invocation-short-verb-no-dedupe';
    const duplicateEventId = mintUuidV7();
    const event = makeRawEvent({
      eventId: duplicateEventId,
      invocationId,
      runId: null, // short verb — never a fleet entry, no no-regress tracking
      type: 'invocation.completed',
      classification: 'aggregated',
      invocationSequence: 7,
    });

    const first = await ingestEvent(state, deps, event);
    expect(first.kind).toBe('accepted');

    const second = await ingestEvent(state, deps, event); // exact re-delivery
    // FAILS TODAY: today's createIngestState() always dedupes by eventId, so
    // this redelivery returns 'duplicate'. With dedupe genuinely disabled, a
    // non-run event has NO other guard (per ingest.ts's own comment: "dedupe
    // is their only guard"), so it must flow through as 'accepted' again.
    expect(second.kind).toBe('accepted');

    // Correctness check: even though ingest happily accepted the exact same
    // envelope twice, the registry's timing projection (FR-014) is still
    // exactly right — recordTiming keeps only the highest-invocationSequence
    // reading per invocation, which two identical-sequence deliveries cannot
    // corrupt or double up.
    const classified: ClassifiedEvent[] = [];
    if (first.kind === 'accepted') classified.push(first.event);
    if (second.kind === 'accepted') classified.push(second.event);
    const registry = buildRegistry(classified);
    const timing = registry.timings(invocationId);
    expect(timing).toBeDefined();
    if (timing === undefined) throw new Error('unreachable');
    expect(timing.invocationSequence).toBe(7);
  });

  it('run event duplicate: with dedupe DISABLED, the redelivery is caught as "stale" (not "duplicate") by no-regress alone, and final registry state is still correct', async () => {
    const state: IngestState = createIngestState({ dedupe: false });
    const { deps } = makeDeps();

    const runId = 'run-no-dedupe';
    const invocationId = 'invocation-run-no-dedupe';
    const startedEventId = mintUuidV7();
    const started = makeRawEvent({
      eventId: startedEventId,
      invocationId,
      runId,
      type: 'run.started',
      invocationSequence: 1,
    });
    const progress = makeRawEvent({
      invocationId,
      runId,
      type: 'run.progress',
      invocationSequence: 2,
    });

    const firstStarted = await ingestEvent(state, deps, started);
    expect(firstStarted.kind).toBe('accepted');

    const firstProgress = await ingestEvent(state, deps, progress);
    expect(firstProgress.kind).toBe('accepted');

    // Re-deliver `started` (exact duplicate: same eventId AND same
    // invocationSequence, since FR-049 byte-identity means a transport-level
    // retry resends the identical envelope the sidecar already assigned).
    const duplicateStarted = await ingestEvent(state, deps, started);
    // FAILS TODAY: today's always-on dedupe returns 'duplicate' here (it
    // short-circuits before the no-regress check ever runs). With dedupe OFF,
    // the SAME correctness outcome (never re-applied) must instead come from
    // the no-regress guard, which classifies a same-or-lower sequence as
    // 'stale' rather than 'duplicate' — a different, but equally non-applying,
    // outcome kind. This is the crux of FR-042a: the KIND of rejection
    // changes; whether it gets re-applied does not.
    expect(duplicateStarted.kind).toBe('stale');

    const classified: ClassifiedEvent[] = [];
    if (firstStarted.kind === 'accepted') classified.push(firstStarted.event);
    if (firstProgress.kind === 'accepted') classified.push(firstProgress.event);
    // duplicateStarted is 'stale' — never pushed; it must not reach the registry.

    const registry = buildRegistry(classified);
    const entry = registry.entries().find((candidate) => candidate.runId === runId);
    expect(entry).toBeDefined();
    if (entry === undefined) throw new Error('unreachable');
    expect(entry.statusAxes.executionStatus).toBe('running'); // run.progress is latest
    expect(entry.progress.progressEventCount).toBe(1); // not double-counted
  });
});
