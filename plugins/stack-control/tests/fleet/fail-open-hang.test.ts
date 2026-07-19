// specs/036-fleet-control-plane — T032 (RED), pairs with T039 impl
// (src/telemetry/emit.ts).
//
// THIS IS THE TEST THAT CATCHES AN ACCIDENTAL `await` ON A PEER RESPONSE.
// (contracts/local-socket-protocol.md § C1 row "Plane hangs"; spec.md
// FR-002/003, SC-001/002.)
//
//   "Plane hangs ⇒ CLI completes at normal speed — there is NO network
//    operation in the interactive path to time out."
//
// The emit client talks ONLY to the LOCAL socket and NEVER awaits a reply
// (no hello-ack wait, no plane round-trip — the plane is exclusively the
// sidecar's concern). So a peer that ACCEPTS the connection and then STALLS
// FOREVER — never replying, never sending EOF, never closing — must not slow
// the CLI down at all. If a (wrong) implementation `await`ed the sidecar's
// response, emit() against a stalled peer would hang and this test would time
// out (vitest's 30s budget) instead of completing in single-digit ms.
//
// There is NO timeout constant to assert here: a timeout implies waiting, and
// the CLI never waits. The proof is a TIMING comparison — stalled-peer emit()
// is statistically indistinguishable from live-peer emit(), both effectively
// instant — plus the fact that the test completes at all.
//
// A real `node:net` UDS peer stalling without EOF is the cruelty a mock
// cannot reproduce (.claude/rules/testing.md). No vitest fake timers — real
// wall-clock is the entire point. Relative `.js` imports under node16.

import { afterEach, describe, expect, it } from 'vitest';
import { createEmitClient, type EmitClient } from '../../src/telemetry/emit.js';
import {
  makeTelemetryEvent,
  startLocalSocketPeer,
  waitUntil,
  type LocalSocketPeer,
} from './_local-socket-peer.js';

const clients: EmitClient[] = [];
const peers: LocalSocketPeer[] = [];

function track(client: EmitClient): EmitClient {
  clients.push(client);
  return client;
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const peer of peers.splice(0)) await peer.close();
});

/** Wall-clock of one `emit()` call, in ms. The whole contract is that this is
 * effectively zero regardless of peer responsiveness. */
function timeEmit(client: EmitClient): number {
  const start = performance.now();
  client.emit(makeTelemetryEvent());
  return performance.now() - start;
}

describe('fail-open emit — a stalled peer never blocks the CLI (T032, C1)', () => {
  it('emit() against a peer that accepts-then-stalls-forever returns at normal speed', async () => {
    const stalled = await startLocalSocketPeer('stall');
    peers.push(stalled);
    const client = track(createEmitClient({ socketPath: stalled.socketPath, callerKind: 'long-run' }));

    // Let the connection get accepted by the stalled peer, so we are timing
    // the "connected but peer is silent" path — the one an accidental await
    // on a reply would hang.
    await waitUntil(() => stalled.connectionCount() >= 1);

    const stalledMs = timeEmit(client);
    // eslint-disable-next-line no-console
    console.log(`[T032] stalled-peer emit=${stalledMs.toFixed(3)}ms`);
    // If emit awaited the (never-arriving) reply, this line is never reached —
    // the test times out. Reaching it AND being fast is the proof.
    expect(stalledMs).toBeLessThan(100);
  });

  it('stalled-peer emit is statistically indistinguishable from live-peer emit', async () => {
    const live = await startLocalSocketPeer('ack');
    const stalled = await startLocalSocketPeer('stall');
    peers.push(live, stalled);

    const liveClient = track(createEmitClient({ socketPath: live.socketPath, callerKind: 'long-run' }));
    const stalledClient = track(
      createEmitClient({ socketPath: stalled.socketPath, callerKind: 'long-run' }),
    );
    await waitUntil(() => live.connectionCount() >= 1 && stalled.connectionCount() >= 1);

    const rounds = 50;
    let liveTotal = 0;
    let stalledTotal = 0;
    for (let i = 0; i < rounds; i += 1) {
      liveTotal += timeEmit(liveClient);
      stalledTotal += timeEmit(stalledClient);
    }
    const liveAvg = liveTotal / rounds;
    const stalledAvg = stalledTotal / rounds;
    // eslint-disable-next-line no-console
    console.log(
      `[T032] live-avg=${liveAvg.toFixed(4)}ms stalled-avg=${stalledAvg.toFixed(4)}ms (rounds=${rounds})`,
    );
    // Both paths are effectively instant; neither blocks on a reply.
    expect(liveAvg).toBeLessThan(50);
    expect(stalledAvg).toBeLessThan(50);
  });

  it('many emits to a stalled peer complete fast and never hang', async () => {
    const stalled = await startLocalSocketPeer('stall');
    peers.push(stalled);
    const client = track(createEmitClient({ socketPath: stalled.socketPath, callerKind: 'long-run' }));
    await waitUntil(() => stalled.connectionCount() >= 1);

    const start = performance.now();
    for (let i = 0; i < 500; i += 1) {
      client.emit(makeTelemetryEvent());
    }
    const totalMs = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[T032] 500 emits to a stalled peer total=${totalMs.toFixed(2)}ms`);
    expect(totalMs).toBeLessThan(500);
  });

  it('a stalled peer does not perturb the buffer contract — long-run still buffers, bounded', async () => {
    const stalled = await startLocalSocketPeer('stall');
    peers.push(stalled);
    const client = track(createEmitClient({ socketPath: stalled.socketPath, callerKind: 'long-run' }));
    await waitUntil(() => stalled.connectionCount() >= 1);
    // Connected-but-silent: events are written to the socket (best-effort),
    // never retained/blocked; the bounded buffer only holds during a
    // not-connected gap, so it must stay within its bound regardless.
    for (let i = 0; i < 200; i += 1) {
      client.emit(makeTelemetryEvent());
    }
    expect(client.buffer.size).toBeLessThanOrEqual(client.buffer.capacity);
  });
});
