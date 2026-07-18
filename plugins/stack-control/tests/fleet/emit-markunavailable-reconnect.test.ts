// specs/036-fleet-control-plane — AUDIT-20260718-32 (RED-first regression).
//
// THE DEFECT (a REGRESSION on the round-2 AUDIT-20260718-11 fix): the reconnect
// arming that AUDIT-20260718-11 added to drain retained events WITHOUT another
// `emit()` was wired into only ONE of the four `markUnavailable()` reach paths —
// `onData()`'s version-mismatch branch. The other three paths
//   (1) `beginConnect()`'s synchronous `createConnection` catch,
//   (2) the socket `'error'` listener (a connect error / mid-stream reset), and
//   (3) `writeRaw()`'s catch
// call `markUnavailable()` (which sets `stateValue='unavailable'` synchronously)
// and then rely on the socket's subsequent `'close'` event reaching `onClose()`
// to arm the reconnect. But `onClose()` opens with
//   `if (stateValue === 'closed' || stateValue === 'unavailable') return;`
// and `markUnavailable()` already set `unavailable` before `'close'` can fire
// (Node emits `'error'` strictly before `'close'`), so `onClose()` short-circuits
// and `armReconnect()` is NEVER invoked on those three paths. A `'long-run'`
// caller that emits its FINAL event, hits a plain connect/write failure, and does
// not `emit()` again leaves that event stranded in the buffer forever — precisely
// the AUDIT-20260718-11 defect, still live on 3 of 4 trigger paths.
//
// THE FIX: arm the reconnect INSIDE `markUnavailable()` itself (the single choke
// point every failure path funnels through), keeping the existing gate (fire only
// while `unavailable` AND the buffer actually holds retained events). Every caller
// then gets the arming — sites (1)-(3) included — not just the mismatch branch.
//
// RED PROOF (deterministic; isolates the choke-point fix): the CONNECT-ERROR path
// (site 2, "sidecar not up yet" — the exact "last event before close()" scenario
// the AUDIT-20260718-11 comment names). Point a `'long-run'` client at a socket
// path with NO listener, buffer events, let the eager connect fail (ENOENT →
// `'error'` → `markUnavailable()`; `'close'` then short-circuits `onClose()`), THEN
// start a compatible peer at that path. With NO further `emit()`:
//   - Post-fix: `markUnavailable()` armed a reconnect, so a background retry
//     connects to the now-live peer and DRAINS the retained events.
//   - Pre-fix: nothing was armed on the connect-error path (and `onClose()`
//     short-circuited), so the peer never sees a connection and the drain never
//     happens → the wait times out → RED.
// This path is load-bearing for the fix LOCATION: because `onClose()` provably
// short-circuits here, the ONLY thing that can arm the reconnect is
// `markUnavailable()` — so a green run proves the arming moved into the choke
// point, not merely that some path happens to arm. (Site 4, the mismatch branch,
// stays covered by emit-mismatch-reconnect.test.ts; sites 1 and 3 funnel through
// the same `markUnavailable()` choke point this test pins.)
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

/** A reserved-but-not-yet-listening UDS path plus the ability to START a
 * compatible (matching-`hello-ack`) peer at that path LATER — modelling a
 * sidecar that is not up when the client first tries to connect, then comes up. */
interface DeferredAckPeer {
  readonly socketPath: string;
  /** Bind a compatible peer at `socketPath`; resolves once it is listening. */
  start(): Promise<void>;
  /** Distinct `event` frames received on the started peer. */
  eventCount(): number;
  close(): Promise<void>;
}

function makeDeferredAckPeer(): DeferredAckPeer {
  const dir = mkdtempSync(join(shortTmpBase(), `scf-deferred-peer-${process.pid}-`));
  const socketPath = join(dir, 'p.sock');
  const openSockets = new Set<Socket>();
  let server: Server | undefined;
  let events = 0;

  return {
    socketPath,
    async start(): Promise<void> {
      const srv: Server = createServer((socket: Socket) => {
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
              socket.write(serializeFrame(buildHelloAckFrame(hello, LOCAL_PROTOCOL_VERSION)));
            } else if (parsed.frame.kind === 'event') {
              events += 1;
            }
          }
        });
      });
      server = srv;
      await new Promise<void>((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(socketPath, () => {
          srv.removeListener('error', reject);
          resolve();
        });
      });
    },
    eventCount: () => events,
    async close(): Promise<void> {
      for (const socket of openSockets) socket.destroy();
      if (server !== undefined) {
        const srv = server;
        await new Promise<void>((resolve) => srv.close(() => resolve()));
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const clients: EmitClient[] = [];
const peers: DeferredAckPeer[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const peer of peers.splice(0)) await peer.close();
});

describe('AUDIT-20260718-32 — markUnavailable arms the reconnect on the connect-error path (not only the mismatch branch)', () => {
  it('drains retained long-run events after a connect failure, with NO further emit(), once the sidecar comes up', async () => {
    const peer = makeDeferredAckPeer();
    peers.push(peer);

    // Point at the peer's path BEFORE it is listening: the eager connect fails
    // ENOENT → `'error'` → `markUnavailable()`; `'close'` then short-circuits
    // `onClose()`. This is site (2), one of the three paths the fix must cover.
    const client = createEmitClient({ socketPath: peer.socketPath, callerKind: 'long-run' });
    clients.push(client);

    // Emit while the eager connect is still in flight so these land in the
    // long-run buffer (the "final events before close()" the fix must not strand).
    const events = [makeTelemetryEvent(), makeTelemetryEvent(), makeTelemetryEvent()];
    for (const event of events) client.emit(event);
    expect(client.buffer.size).toBe(events.length);

    // The connect fails; the client settles into `unavailable` with the events
    // still retained. Pre-fix nothing is armed from here on.
    await waitUntil(() => client.state === 'unavailable', 5000);
    expect(client.buffer.size).toBe(events.length);

    // NOW bring the sidecar up. THE LOAD-BEARING ASSERTION: with NO further
    // emit() call, the armed background reconnect (arm-point = markUnavailable)
    // must connect to the live peer and DRAIN the retained events. Pre-fix no
    // reconnect was armed on this path, so the peer never accepts a connection
    // and this wait times out → RED.
    await peer.start();
    await waitUntil(() => peer.eventCount() >= events.length, 5000);
    expect(peer.eventCount()).toBe(events.length);

    // The client converged to a healthy connected state and the buffer drained.
    await waitUntil(() => client.state === 'connected', 5000);
    expect(client.buffer.size).toBe(0);
  }, 20_000);
});
