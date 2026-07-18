// specs/036-fleet-control-plane — AUDIT-20260718-09 (RED-first regression).
//
// THE DEFECT (REGRESSION-adjacent to the round-1 AUDIT-20260717-02 requeue):
// `FailOpenEmitClient.close()` calls `destroySocket()`, which does
// `socket.removeAllListeners()` + `socket.destroy()` with NO flush and NO
// `requeueUnconfirmed()`. `invocation-telemetry.ts` calls `emit(event)` then
// `close()` in the SAME synchronous tick (a `finally` block). If the write has
// not yet been flushed past Node's internal write queue (a slow/backpressured
// sidecar), `socket.destroy()` DISCARDS the queued bytes per Node stream
// semantics — silently losing the event. For a short verb whose ONLY event is
// `invocation.completed`, that is a silent FR-012 violation ("every invocation
// emits"). The AUDIT-20260717-02 unconfirmed-requeue never covers this path
// because it only fires from `markUnavailable()`/`onClose()`, never `close()`.
//
// THE FIX: `close()` must FLUSH pending writes before the socket goes away —
// `socket.end()` drains the write queue and sends FIN, unlike `destroy()` which
// abandons it. Still non-blocking (`close()` returns promptly; the flush is
// event-driven and `unref()`d).
//
// RED PROOF (deterministic, not timing-luck): a peer that accepts but does NOT
// read builds real client-side backpressure once its kernel buffer fills, so a
// tail of emitted frames sits in Node's internal write queue at `close()` time.
//   - Pre-fix: `destroy()` discards that tail → the peer (after it finally
//     drains) receives FEWER than the emitted frames.
//   - Post-fix: `end()` flushes the whole queue → the peer receives ALL of them.
// `close()` also returns promptly in both cases (no long block).
//
// Real `node:net` UDS peer + real temp dirs. No fake timers. Relative `.js`.

import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmitClient, type EmitClient } from '../../src/telemetry/emit.js';
import { makeTelemetryEvent, waitUntil } from './_local-socket-peer.js';

function shortTmpBase(): string {
  return process.platform === 'win32' ? tmpdir() : '/tmp';
}

/**
 * A UDS peer that ACCEPTS a connection and stays PAUSED (never reads) until the
 * test calls `startDraining()`. While paused, the client's writes back up: the
 * kernel send buffer fills and further frames queue inside Node — exactly the
 * "unflushed write" condition `close()` must not discard.
 */
interface BackpressurePeer {
  readonly socketPath: string;
  /** Begin reading; resolve every complete `event` frame seen from here on. */
  startDraining(): void;
  /** Count of distinct `event` frames received so far. */
  eventCount(): number;
  close(): Promise<void>;
}

async function startBackpressurePeer(): Promise<BackpressurePeer> {
  const dir = mkdtempSync(join(shortTmpBase(), `scf-bp-peer-${process.pid}-`));
  const socketPath = join(dir, 'p.sock');
  const openSockets = new Set<Socket>();
  let accepted: Socket | undefined;
  let draining = false;
  let buffered = '';
  let events = 0;

  const consume = (chunk: string): void => {
    buffered += chunk;
    let nl = buffered.indexOf('\n');
    while (nl !== -1) {
      const line = buffered.slice(0, nl);
      buffered = buffered.slice(nl + 1);
      if (line.length > 0) {
        try {
          const frame: unknown = JSON.parse(line);
          if (
            frame !== null &&
            typeof frame === 'object' &&
            'kind' in frame &&
            (frame as { kind: unknown }).kind === 'event'
          ) {
            events += 1;
          }
        } catch {
          /* ignore a partial/garbage line — never crash the peer. */
        }
      }
      nl = buffered.indexOf('\n');
    }
  };

  const server: Server = createServer((socket: Socket) => {
    openSockets.add(socket);
    socket.setEncoding('utf8');
    socket.on('close', () => openSockets.delete(socket));
    socket.on('error', () => {
      /* a client RST (pre-fix destroy) is expected — never crash the peer. */
    });
    // Stay PAUSED: attach no 'data' handler yet, and pause explicitly so the
    // kernel receive buffer fills and pushes back on the client.
    socket.pause();
    accepted = socket;
    if (draining) {
      socket.on('data', consume);
      socket.resume();
    }
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
    startDraining(): void {
      draining = true;
      if (accepted !== undefined) {
        accepted.on('data', consume);
        accepted.resume();
      }
    },
    eventCount: () => events,
    async close(): Promise<void> {
      for (const socket of openSockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const clients: EmitClient[] = [];
const peers: BackpressurePeer[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const peer of peers.splice(0)) await peer.close();
});

describe('AUDIT-20260718-09 — close() flushes pending writes, never discards the only event', () => {
  it('emit-then-close does not drop a backpressured write — the peer receives every emitted event', async () => {
    const peer = await startBackpressurePeer();
    peers.push(peer);
    const client = createEmitClient({ socketPath: peer.socketPath, callerKind: 'short-verb' });
    clients.push(client);

    // Wait until the connection is established so emits take the immediate-write
    // path (the peer is still paused → writes will back up).
    await waitUntil(() => client.state === 'connected');

    // Emit enough frames to overflow the socket send buffer, so a large tail
    // sits in Node's internal write queue at close() time (the bytes destroy()
    // would silently discard).
    const N = 4000;
    for (let i = 0; i < N; i += 1) {
      client.emit(makeTelemetryEvent(null));
    }

    // emit + close in the caller's synchronous shape; close() must be prompt.
    const start = performance.now();
    client.close();
    const closeMs = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[AUDIT-09] close() returned in ${closeMs.toFixed(2)}ms`);
    expect(closeMs).toBeLessThan(100); // prompt — no long synchronous block

    // Now let the peer drain: relieving backpressure lets close()'s flush push
    // the whole write queue through before FIN. Post-fix the peer receives ALL
    // N events; pre-fix destroy() discarded the internally-queued tail.
    peer.startDraining();
    await waitUntil(() => peer.eventCount() >= N, 8000);
    expect(peer.eventCount()).toBe(N);
  }, 20_000);
});
