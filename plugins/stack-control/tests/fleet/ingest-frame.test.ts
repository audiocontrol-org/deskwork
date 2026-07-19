// specs/036/037 — AUDIT-20260719-18: `ingestFrameGuarded` must be NON-FATAL.
// A poison/malformed single frame (absent host/path, or a `receive` that
// throws for any reason) must be SURFACED and DROPPED — never thrown out of the
// ingest path where it would become an unhandled rejection that terminates the
// whole sidecar daemon (taking every instance's telemetry uplink down).
//
// Mirrors the file-local sibling guards `computeFleetTickGuarded` /
// `recordDroppedRecord`: catch the one bad unit, surface it, drop it, keep
// running. The unit under test is the guard logic ALONE — `receive` and
// `recordDroppedFrame` are injected stubs (no real WAL, no socket).
//
// Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { ingestFrameGuarded, type DroppedFrame } from '../../src/sidecar/ingest-frame.js';
import { buildEventFrame } from '../../src/telemetry/protocol.js';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope, TelemetryEvent } from '../../src/fleet/event.js';
import type { RawInvocationEvent } from '../../src/sidecar/pipeline.js';

function makeEvent(overrides: Partial<EventEnvelope>): TelemetryEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId: 'install-1',
    invocationId: 'invocation-1',
    runId: 'run-1',
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 2,
    type: 'run.started',
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: 5,
    classification: 'durable',
    host: 'producer-host',
    path: '/real/install/root',
    sessionId: 'session-1',
    ...overrides,
  };
  return { envelope, snapshot: {} };
}

/** A capturing `receive` stub: records each `RawInvocationEvent` it was handed
 * and resolves with a TelemetryEvent (the pipeline's real return shape). */
function capturingReceive(): {
  readonly calls: RawInvocationEvent[];
  readonly fn: (raw: RawInvocationEvent) => Promise<TelemetryEvent>;
} {
  const calls: RawInvocationEvent[] = [];
  return {
    calls,
    fn: async (raw: RawInvocationEvent): Promise<TelemetryEvent> => {
      calls.push(raw);
      return makeEvent({});
    },
  };
}

describe('ingestFrameGuarded — a poison frame is surfaced + dropped, never fatal (AUDIT-20260719-18)', () => {
  it('DROPS a frame with a null host/path (legacy/malformed) — surfaced, not thrown', async () => {
    const dropped: DroppedFrame[] = [];
    const receive = capturingReceive();
    const frame = buildEventFrame(
      makeEvent({ host: null, path: null, sessionId: null, schemaVersion: 1 }),
    );

    // MUST NOT reject: the guard surfaces + drops rather than throwing into the
    // frame-received callback (which has no per-frame handler that could stop an
    // unhandled rejection from terminating the daemon).
    await expect(
      ingestFrameGuarded(frame, { receive: receive.fn, recordDroppedFrame: (i) => dropped.push(i) }),
    ).resolves.toBeUndefined();

    // The bad frame was surfaced exactly once (loud, observable) and NOT ingested.
    expect(dropped).toHaveLength(1);
    expect(dropped[0].runId).toBe('run-1');
    expect(receive.calls).toHaveLength(0);
  });

  it('DROPS a frame whose ingest (receive) throws for any reason — surfaced, not thrown', async () => {
    const dropped: DroppedFrame[] = [];
    const failingReceive = async (): Promise<TelemetryEvent> => {
      throw new Error('WAL append failed (disk full)');
    };
    const frame = buildEventFrame(makeEvent({}));

    await expect(
      ingestFrameGuarded(frame, { receive: failingReceive, recordDroppedFrame: (i) => dropped.push(i) }),
    ).resolves.toBeUndefined();

    expect(dropped).toHaveLength(1);
    expect(dropped[0].runId).toBe('run-1');
  });

  it('INGESTS a valid 037 frame — preserves the producer host/path/sessionId, no drop', async () => {
    const dropped: DroppedFrame[] = [];
    const receive = capturingReceive();
    const frame = buildEventFrame(
      makeEvent({ host: 'producer-host.example', path: '/observed/root', sessionId: 'sess-abc' }),
    );

    await ingestFrameGuarded(frame, {
      receive: receive.fn,
      recordDroppedFrame: (i) => dropped.push(i),
    });

    // No drop; identity preserved intact into the pipeline receive.
    expect(dropped).toHaveLength(0);
    expect(receive.calls).toHaveLength(1);
    expect(receive.calls[0].host).toBe('producer-host.example');
    expect(receive.calls[0].path).toBe('/observed/root');
    expect(receive.calls[0].sessionId).toBe('sess-abc');
  });
});
