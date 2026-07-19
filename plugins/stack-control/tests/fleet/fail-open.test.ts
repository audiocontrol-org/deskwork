// specs/036-fleet-control-plane — T031 (RED), pairs with T039 impl
// (src/telemetry/emit.ts).
//
// THE CONSTRAINT THAT DOMINATES THE FEATURE (spec § "The constraint that
// dominates every other", plan.md § Complexity Tracking — the DECLARED,
// bounded Principle-V violation): the control plane must NEVER degrade the
// tool it observes. Telemetry is not the verb's functionality — the verb's
// contract (output, exit code, wall-clock) is UNCHANGED whether or not
// anyone is observing. When no sidecar is reachable the CLI's local connect
// fails IMMEDIATELY and the invocation continues unaffected; it does NOT
// raise a descriptive error (that would convert an observability outage into
// a total tool outage — precisely the harm forbidden). This is the ONE file
// where "silently continue" is correct, and only for the telemetry path.
//
// This test proves (contracts/local-socket-protocol.md § C1 row 1, § C4;
// spec.md FR-002/003/012, SC-001/002):
//   1. With NO sidecar, constructing the emit client + emitting adds no
//      measurable latency vs a telemetry-disabled baseline (SC-001) — no
//      blocking network wait, because there IS no network in this path.
//   2. emit() NEVER throws and returns void — the invocation's exit code /
//      output cannot be perturbed by telemetry state (SC-002).
//   3. Buffering asymmetry (C4): a SHORT verb DROPS on an unavailable socket
//      (no buffer); a LONG run BUFFERS (bounded) to cover a restart gap.
//   4. An unavailable socket triggers a FIRE-AND-FORGET sidecar spawn seam
//      for SUBSEQUENT invocations — and emit never awaits it.
//   5. A LIVE sidecar actually receives the hello + event frames (fail-open
//      is best-effort delivery, not "never send").
//
// Real UDS sockets + real temp dirs (a mock cannot reproduce ENOENT /
// stall-without-EOF). No vitest fake timers — real wall-clock is the point.
// Relative `.js` imports under node16 (no `@/` alias configured).

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createEmitClient, type EmitClient } from '../../src/telemetry/emit.js';
import {
  makeTelemetryEvent,
  startLocalSocketPeer,
  waitUntil,
  type LocalSocketPeer,
} from './_local-socket-peer.js';

/** A UDS path under a fresh short temp dir with NO listener behind it — the
 * ENOENT "no sidecar reachable" condition (C1 row 1). */
function nonexistentSocketPath(): { socketPath: string; cleanup: () => void } {
  const base = process.platform === 'win32' ? tmpdir() : '/tmp';
  const dir = mkdtempSync(join(base, `scf-nosock-${process.pid}-`));
  return {
    socketPath: join(dir, 'absent.sock'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const clients: EmitClient[] = [];
const peers: LocalSocketPeer[] = [];
const cleanups: Array<() => void> = [];

function track(client: EmitClient): EmitClient {
  clients.push(client);
  return client;
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const peer of peers.splice(0)) await peer.close();
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('fail-open emit — no sidecar ⇒ unchanged output/exit/wall-clock (T031, SC-001/002)', () => {
  it('adds no measurable wall-clock vs a telemetry-disabled baseline', () => {
    const { socketPath, cleanup } = nonexistentSocketPath();
    cleanups.push(cleanup);
    const iterations = 200;

    // Baseline: telemetry disabled entirely — the verb's own trivial work.
    const baselineStart = performance.now();
    let sink = 0;
    for (let i = 0; i < iterations; i += 1) {
      sink += i;
    }
    const baselineMs = performance.now() - baselineStart;

    // With telemetry: construct a client (connect fails ENOENT) + emit.
    const withTelemetryStart = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      const client = track(createEmitClient({ socketPath, callerKind: 'short-verb' }));
      client.emit(makeTelemetryEvent());
      sink += i;
    }
    const withTelemetryMs = performance.now() - withTelemetryStart;

    const perCallOverheadMs = (withTelemetryMs - baselineMs) / iterations;
    // eslint-disable-next-line no-console
    console.log(
      `[T031] baseline=${baselineMs.toFixed(2)}ms withTelemetry=${withTelemetryMs.toFixed(2)}ms ` +
        `perCallOverhead=${perCallOverheadMs.toFixed(3)}ms (n=${iterations})`,
    );
    expect(sink).toBeGreaterThan(0);
    // The load-bearing claim is NO blocking wait (which would be seconds /
    // infinite). Constructing a socket + firing a write is a few hundred µs;
    // assert the per-call overhead stays in the low-single-digit-ms range so
    // a regression that (re)introduced a blocking connect wait would fail.
    expect(perCallOverheadMs).toBeLessThan(5);
  });

  it('emit() returns void and never throws when no sidecar is reachable', () => {
    const { socketPath, cleanup } = nonexistentSocketPath();
    cleanups.push(cleanup);
    const client = track(createEmitClient({ socketPath, callerKind: 'short-verb' }));
    expect(() => {
      for (let i = 0; i < 10; i += 1) {
        const result: void = client.emit(makeTelemetryEvent());
        expect(result).toBeUndefined();
      }
    }).not.toThrow();
  });

  it('SHORT verb DROPS on an unavailable socket — no buffer (C4/FR-007)', () => {
    const { socketPath, cleanup } = nonexistentSocketPath();
    cleanups.push(cleanup);
    const client = track(createEmitClient({ socketPath, callerKind: 'short-verb' }));
    client.emit(makeTelemetryEvent(null));
    expect(client.buffer.kind).toBe('short-verb');
    expect(client.buffer.size).toBe(0);
    expect(client.buffer.droppedCount).toBeGreaterThanOrEqual(1);
  });

  it('LONG run BUFFERS on an unavailable socket — bounded (C4/FR-007)', () => {
    const { socketPath, cleanup } = nonexistentSocketPath();
    cleanups.push(cleanup);
    const client = track(createEmitClient({ socketPath, callerKind: 'long-run' }));
    client.emit(makeTelemetryEvent());
    expect(client.buffer.kind).toBe('long-run');
    expect(client.buffer.size).toBe(1);
  });

  it('an unavailable socket triggers a FIRE-AND-FORGET spawn seam, never awaited', async () => {
    const { socketPath, cleanup } = nonexistentSocketPath();
    cleanups.push(cleanup);
    let spawnCalls = 0;
    const client = track(
      createEmitClient({
        socketPath,
        callerKind: 'short-verb',
        onSocketUnavailable: () => {
          spawnCalls += 1;
        },
      }),
    );
    client.emit(makeTelemetryEvent(null));
    // emit returned BEFORE the async connect-error fired: the seam is NOT
    // awaited inline (that would be a blocking dependency on socket state).
    expect(spawnCalls).toBe(0);
    // The connect error to a nonexistent UDS is near-instant; the seam fires
    // for the NEXT invocation's benefit.
    await waitUntil(() => spawnCalls >= 1);
    expect(spawnCalls).toBeGreaterThanOrEqual(1);
    expect(client.state).toBe('unavailable');
  });

  it('a LIVE sidecar receives the hello + the event frame (best-effort delivery)', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);
    const client = track(createEmitClient({ socketPath: peer.socketPath, callerKind: 'long-run' }));
    const event = makeTelemetryEvent();
    client.emit(event);
    await waitUntil(() => peer.receivedLines.length >= 2);

    const parsed = peer.receivedLines.map((line) => JSON.parse(line));
    const kinds = parsed.map((f) => f.kind);
    expect(kinds).toContain('hello');
    expect(kinds).toContain('event');
    const eventFrame = parsed.find((f) => f.kind === 'event');
    expect(eventFrame?.event?.envelope?.eventId).toBe(event.envelope.eventId);
  });
});
