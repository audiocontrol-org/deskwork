// specs/036-fleet-control-plane — AUDIT-20260718-11 (RED-first regression).
//
// THE DEFECT (a REGRESSION from the round-1 AUDIT-20260717-02 requeue fix): on a
// protocol-version mismatch, `onData()` requeues the unconfirmed events and
// calls `markUnavailable()`, which sets state `unavailable`, destroys the
// socket, and fires `onSocketUnavailable` — but does NOT arm another connect
// attempt. The ONLY reconnect trigger is inside `emit()` (state idle/
// unavailable). So the retained long-run events sit in memory until another
// telemetry event happens to arrive. A long-running command can emit its FINAL
// event, hit a stale-sidecar mismatch, and then never emit again → the retained
// event is undelivered for the rest of the process (the C3 restart-path bug).
//
// THE FIX: after tearing down the incompatible socket, explicitly ARM a
// reconnect (non-blocking, `unref()`d, gated on there being retained events)
// so the retained events drain to a now-compatible sidecar — WITHOUT relying on
// another `emit()`. The never-blocks contract is preserved (a scheduled timer,
// never a synchronous wait).
//
// RED PROOF: an "upgrade" peer answers the FIRST connection with a MISMATCHED
// hello-ack (the stale sidecar) and every subsequent connection with a MATCHING
// one (the sidecar was restarted/upgraded). Buffer events, connect, take the
// mismatch — then, with NO further `emit()` call, assert the retained events
// DRAIN to the peer's second (compatible) connection. Pre-fix no reconnect is
// armed, the second connection never happens, and the drain never occurs → RED.
//
// Real `node:net` UDS peer + real temp dirs. No fake timers. Relative `.js`.

import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmitClient, type EmitClient } from '../../src/telemetry/emit.js';
import { makeTelemetryEvent, waitUntil } from './_local-socket-peer.js';
import {
  LOCAL_PROTOCOL_VERSION,
  buildHelloAckFrame,
  parseCliToSidecarFrame,
  serializeFrame,
  splitFrameLines,
  type HelloFrame,
} from '../../src/telemetry/protocol.js';

function shortTmpBase(): string {
  return process.platform === 'win32' ? tmpdir() : '/tmp';
}

const MISMATCH_VERSION = LOCAL_PROTOCOL_VERSION + 1000;

/**
 * A peer that is STALE for its first accepted connection (answers `hello` with a
 * mismatched `hello-ack`) and COMPATIBLE for every connection after (matching
 * `hello-ack`), recording the `event` frames delivered on the compatible
 * connection(s). Models a sidecar restart/upgrade across the C3 skew.
 */
interface UpgradePeer {
  readonly socketPath: string;
  connectionCount(): number;
  /** Distinct `event` frames received on the COMPATIBLE connection(s). */
  compatibleEventCount(): number;
  close(): Promise<void>;
}

async function startUpgradePeer(): Promise<UpgradePeer> {
  const dir = mkdtempSync(join(shortTmpBase(), `scf-upgrade-peer-${process.pid}-`));
  const socketPath = join(dir, 'p.sock');
  const openSockets = new Set<Socket>();
  let connections = 0;
  let compatibleEvents = 0;

  const server: Server = createServer((socket: Socket) => {
    connections += 1;
    const isStale = connections === 1; // only the FIRST connection is the stale sidecar
    openSockets.add(socket);
    socket.setEncoding('utf8');
    socket.on('close', () => openSockets.delete(socket));
    socket.on('error', () => {
      /* a client teardown mid-frame is expected — never crash the peer. */
    });
    let buffered = '';
    socket.on('data', (chunk: string) => {
      buffered += chunk;
      const { complete, remainder } = splitFrameLines(buffered);
      buffered = remainder;
      for (const line of complete) {
        const parsed = parseCliToSidecarFrame(line);
        if (!parsed.ok) continue;
        if (parsed.frame.kind === 'hello') {
          const hello: HelloFrame = parsed.frame;
          const version = isStale ? MISMATCH_VERSION : LOCAL_PROTOCOL_VERSION;
          socket.write(serializeFrame(buildHelloAckFrame(hello, version)));
        } else if (parsed.frame.kind === 'event' && !isStale) {
          compatibleEvents += 1;
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  return {
    socketPath,
    connectionCount: () => connections,
    compatibleEventCount: () => compatibleEvents,
    async close(): Promise<void> {
      for (const socket of openSockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const clients: EmitClient[] = [];
const peers: UpgradePeer[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const peer of peers.splice(0)) await peer.close();
});

describe('AUDIT-20260718-11 — retained events reconnect and drain after a mismatch, without another emit', () => {
  it('arms a reconnect after the incompatible teardown so retained long-run events drain to a compatible sidecar', async () => {
    const peer = await startUpgradePeer();
    peers.push(peer);

    const client = createEmitClient({ socketPath: peer.socketPath, callerKind: 'long-run' });
    clients.push(client);

    // Emit while the eager connect is still in flight so these land in the
    // long-run buffer (the restart-gap events C3 promises to keep).
    const events = [makeTelemetryEvent(), makeTelemetryEvent(), makeTelemetryEvent()];
    for (const event of events) client.emit(event);
    expect(client.buffer.size).toBe(events.length);

    // First connection → mismatch → requeue → markUnavailable. The events are
    // retained; pre-fix nothing else happens.
    await waitUntil(() => peer.connectionCount() >= 1);

    // THE LOAD-BEARING ASSERTION: with NO further emit() call, a reconnect must
    // be armed, the peer must accept a SECOND (compatible) connection, and the
    // retained events must DRAIN to it. Pre-fix this never happens (no reconnect
    // armed) and the wait times out.
    await waitUntil(() => peer.connectionCount() >= 2, 5000);
    await waitUntil(() => peer.compatibleEventCount() >= events.length, 5000);
    expect(peer.compatibleEventCount()).toBe(events.length);
    // The client converged to a healthy connected state on the compatible peer.
    await waitUntil(() => client.state === 'connected', 5000);
    expect(client.buffer.size).toBe(0);
  }, 20_000);
});
