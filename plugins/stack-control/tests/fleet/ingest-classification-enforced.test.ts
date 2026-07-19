// specs/036-fleet-control-plane — AUDIT-20260717-11 (RED→GREEN). The plane's
// ingest boundary must NOT trust the wire-provided event classification when
// it CONTRADICTS the catalog (src/fleet/classification.ts's `classifyEvent`).
//
// THE HARM (FR-015): classification is load-bearing for durable-object cost
// and history retention. A malformed/buggy sidecar that sends a DURABLE
// run-lifecycle event (`run.started`) mislabeled as a cheaper class
// (`live-only`) DOWNGRADES it — the plane would treat a historical-record
// event as non-durable, silently dropping the history FR-015 exists to keep.
// `ingestEvent` must reject that downgrade at the boundary, fail loud.
//
// SCOPE NOTE (see the impl): the enforced rule rejects a wire classification
// that UNDER-states the catalog's durability (a downgrade — the data-losing
// direction the audit names), keyed off the ordering live-only < aggregated <
// durable. An over-classification (e.g. a `run.progress` labeled `durable`) is
// a lesser cost-only concern and is NOT rejected here — that is also the
// direction the existing test fixtures happen to use, so it stays green.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fakes, no mocks. No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { TelemetryEvent } from '../../src/fleet/event.js';
import {
  createIngestState,
  ingestEvent,
  type DurableEventStore,
  type IngestState,
} from '../../src/plane/http/ingest.js';

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
  readonly type?: string;
  readonly classification?: string;
  readonly runId?: string | null;
}

function makeRawEvent(options: RawEventOptions = {}): unknown {
  return {
    envelope: {
      eventId: mintUuidV7(),
      installationId: 'installation-1',
      invocationId: 'invocation-1',
      runId: options.runId === undefined ? 'run-1' : options.runId,
      installationSequence: 1,
      invocationSequence: 1,
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

describe('ingest enforces the classification catalog at the boundary (AUDIT-20260717-11)', () => {
  it('REJECTS a durable run-lifecycle event mislabeled live-only (a downgrade), failing loud', async () => {
    const state: IngestState = createIngestState();
    await expect(
      ingestEvent(state, makeDeps(), makeRawEvent({ type: 'run.started', classification: 'live-only' })),
    ).rejects.toThrow(/classif/i);
  });

  it('REJECTS a durable run-lifecycle event mislabeled aggregated (also a downgrade)', async () => {
    const state: IngestState = createIngestState();
    await expect(
      ingestEvent(state, makeDeps(), makeRawEvent({ type: 'run.completed', classification: 'aggregated' })),
    ).rejects.toThrow(/classif/i);
  });

  it('REJECTS an unknown event type (fail loud, never silently accepted)', async () => {
    const state: IngestState = createIngestState();
    await expect(
      ingestEvent(state, makeDeps(), makeRawEvent({ type: 'run.teleported', classification: 'durable' })),
    ).rejects.toThrow();
  });

  it('ACCEPTS a correctly-classified durable run-lifecycle event', async () => {
    const state: IngestState = createIngestState();
    const outcome = await ingestEvent(
      state,
      makeDeps(),
      makeRawEvent({ type: 'run.started', classification: 'durable' }),
    );
    expect(outcome.kind).toBe('accepted');
  });
});
