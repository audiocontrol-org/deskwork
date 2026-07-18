// specs/036-fleet-control-plane — AUDIT-20260717-02 (RED-first regression).
//
// THE DEFECT: `onConnect()` drained the long-run buffer and WROTE all held
// events before the sidecar's `hello-ack` was validated. On a version MISMATCH,
// `onData()` then called `markUnavailable()` AFTER the buffer was already empty,
// so those held events were neither delivered to a compatible sidecar nor
// retained for the C3 restart path — the long-run restart-gap buffer silently
// lost telemetry exactly during the upgrade/skew case C3 exists to handle.
//
// THE FIX: events written before a matching `hello-ack` are provisional; on a
// mismatched ack (or a drop before the ack) they are requeued into the buffer
// rather than lost.
//
// RED PROOF: against the pre-fix emit.ts this asserts `buffer.size === N` after
// a mismatch — but the buffer was drained-and-lost, so size was 0 and this
// FAILED. GREEN after the requeue fix.
//
// Real UDS peer + real temp dirs. No fake timers. Relative `.js` imports.

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

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const peer of peers.splice(0)) await peer.close();
});

describe('AUDIT-20260717-02 — buffered events survive a protocol-version mismatch', () => {
  it('a MISMATCHED hello-ack RETAINS the drained long-run events (re-buffered), never drops them', async () => {
    const peer = await startLocalSocketPeer('mismatch');
    peers.push(peer);

    const client = createEmitClient({ socketPath: peer.socketPath, callerKind: 'long-run' });
    clients.push(client);

    // Emit while the eager connect is still in flight ('connecting') so these
    // land in the long-run buffer (the restart-gap events C3 promises to keep).
    const events = [makeTelemetryEvent(), makeTelemetryEvent(), makeTelemetryEvent()];
    for (const event of events) client.emit(event);
    expect(client.buffer.size).toBe(events.length);

    // Connect fires → onConnect drains + writes them (provisionally) → the peer
    // replies with a MISMATCHED hello-ack → onData must requeue, not lose them.
    await waitUntil(() => client.state === 'unavailable');

    // The load-bearing assertion: the events are retained in the buffer, ready
    // for a compatible sidecar's next drain — NOT lost. Pre-fix this was 0.
    expect(client.buffer.size).toBe(events.length);

    const retained = client.buffer.drain();
    expect(retained.map((e) => e.envelope.eventId).sort()).toEqual(
      events.map((e) => e.envelope.eventId).sort(),
    );
  });

  it('a MATCHING hello-ack confirms delivery and retains NOTHING to requeue', async () => {
    const peer = await startLocalSocketPeer('ack');
    peers.push(peer);

    const client = createEmitClient({ socketPath: peer.socketPath, callerKind: 'long-run' });
    clients.push(client);

    const event = makeTelemetryEvent();
    client.emit(event);
    // Peer receives hello + event and answers a MATCHING hello-ack.
    await waitUntil(() => peer.receivedLines.length >= 2);
    await waitUntil(() => client.state === 'connected');

    // A matching ack means the provisional event reached a compatible peer;
    // nothing is left buffered to requeue.
    expect(client.buffer.size).toBe(0);
  });
});
