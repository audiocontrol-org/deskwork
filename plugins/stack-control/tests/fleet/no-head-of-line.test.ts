/**
 * specs/036-fleet-control-plane — T108 (RED).
 *
 * INFERENCE BEING VERIFIED (contracts/sidecar-plane-protocol.md § C2,
 * research.md § Transport topology — "two connections is the baseline"):
 *
 *   The sidecar↔plane transport is TWO connections — a held-open SSE stream
 *   (plane→sidecar, opened by the sidecar) and HTTP POST for telemetry
 *   (sidecar→plane). The contract names a specific TRAP: forcing
 *   multiplexing onto ONE connection (e.g. undici `connections: 1`) "would
 *   likely make telemetry POSTs queue forever behind an SSE response that
 *   never completes — converting a cost into an actual protocol failure."
 *   Both § C2 and research.md flag this head-of-line reasoning as
 *   INFERENCE, NOT VERIFIED, and require it pinned as a RED test that must
 *   PASS before the transport topology is fixed. This file is that pin.
 *
 * WHY A REAL SERVER, NOT A MOCK (research.md § Testability strategy — "a
 * mock cannot be cruel"): socket-pool head-of-line blocking is a property
 * of a real TCP connection pool against a real origin. A mock cannot hold a
 * socket open without EOF and cannot make a second request queue behind the
 * first. So this test stands up a REAL in-process `node:http` server on an
 * ephemeral port (mirroring tests/fleet/transport.test.ts /
 * tests/fleet/_server-fixture.ts) with two routes:
 *   - GET  /stream    → a held-open SSE stream that never completes (the
 *                       stall-no-eof cruelty: 200 + text/event-stream + one
 *                       keepalive comment, then silence forever).
 *   - POST /telemetry → a normal request/response (200 + a body).
 * The real sidecar SSE transport (FetchSseTransport, transport.ts) holds the
 * /stream connection open and silent, and CONCURRENTLY the telemetry POST
 * dispatcher must make progress against the same origin.
 *
 * ASSUMED POST-DISPATCHER API (task T114 — src/sidecar/uplink/post.ts —
 * does NOT exist yet; that missing module IS this test's RED signal). T114
 * MUST conform to exactly this surface:
 *
 *   export interface TelemetryPostRequest {
 *     readonly url: string;
 *     readonly headers?: Readonly<Record<string, string>>;
 *     readonly body: string;
 *   }
 *   export interface TelemetryPostResult {
 *     readonly status: number;
 *     readonly body: string;
 *   }
 *   export interface TelemetryPoster {
 *     post(req: TelemetryPostRequest): Promise<TelemetryPostResult>;
 *   }
 *   export function createTelemetryPoster(): TelemetryPoster;
 *
 * The KEY design assertion: the POST path must NOT share a connection-pool
 * slot with the SSE stream. If T114 were (wrongly) built to force
 * single-connection multiplexing (undici `connections: 1` shared with the
 * SSE pool), the held-open silent /stream would occupy the one slot and the
 * POST below would QUEUE FOREVER — this test would then hang, and the
 * bounded race + finite vitest timeout below convert that hang into a
 * FAILURE rather than an infinite wait. That is exactly the regression this
 * test guards.
 *
 * Repo convention (matches sibling T007/T010 fleet tests): relative `.js`
 * imports with node16 resolution (no `@/` alias in this plugin); real
 * `node:http` servers on ephemeral ports; never a mocked filesystem or
 * mocked HTTP client.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { FetchSseTransport } from '../../src/sidecar/uplink/transport.js';
import { createTelemetryPoster } from '../../src/sidecar/uplink/post.js';

/** How long the telemetry POST is given to complete while the SSE stream is
 * held open. A genuine head-of-line hang exceeds this; a two-connection
 * transport resolves in single-digit milliseconds. Kept well under the
 * per-test vitest timeout so the failure is this descriptive rejection, not
 * vitest's generic timeout. */
const POST_DEADLINE_MS = 3000;

/** A dual-route server: a held-open silent SSE stream and a normal
 * telemetry POST endpoint. Sockets are tracked so `close()` can
 * force-destroy the deliberately-never-closed SSE connection (a bare
 * `server.close()` would hang on it). */
async function startDualRouteServer(): Promise<{
  baseUrl: string;
  close(): Promise<void>;
}> {
  const sockets = new Set<Socket>();

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/stream') {
      // stall-no-eof: headers + one keepalive comment, then silence forever.
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(':keepalive\n\n');
      // Deliberately never end() and never close the socket.
      return;
    }
    if (req.method === 'POST' && req.url === '/telemetry') {
      // Drain the request body, then answer normally. A telemetry POST is a
      // plain request/response — it must NOT wait on the SSE stream.
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, received: Buffer.concat(chunks).length }));
      });
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a bound TCP address from the ephemeral-port listener');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let closed = false;
  return {
    baseUrl,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

/** Rejects if the wrapped promise does not settle within `ms`, so a
 * head-of-line hang surfaces as a descriptive failure instead of an
 * infinite wait. */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label} did not complete within ${ms}ms — telemetry POST appears head-of-line ` +
            'blocked behind the held-open SSE stream (C2 trap: single-connection multiplexing)',
        ),
      );
    }, ms);
  });
  return Promise.race<T>([promise, deadline]).finally(() => clearTimeout(timer));
}

describe('telemetry POSTs are not head-of-line blocked by the SSE stream (T108 — C2)', () => {
  it(
    'a telemetry POST completes while a silent SSE stream is concurrently held open on the same origin',
    async () => {
      const { baseUrl, close } = await startDualRouteServer();
      const sseTransport = new FetchSseTransport();

      const sse = await sseTransport.connect({ url: `${baseUrl}/stream`, headers: {} });
      try {
        // Prove the SSE connection is genuinely established and streaming
        // (the keepalive comment), then leave it OPEN and SILENT for the
        // duration of the telemetry POST below.
        expect(sse.status).toBe(200);
        const iterator = sse.chunks[Symbol.asyncIterator]();
        const first = await iterator.next();
        expect(first.done).toBe(false);

        // The system under test: the telemetry POST dispatcher. It must make
        // progress against the same origin while the SSE stream above stays
        // open and silent. If the POST shared the SSE's connection-pool slot
        // (the C2 single-connection trap), this would never resolve.
        const poster = createTelemetryPoster();
        const result = await withDeadline(
          poster.post({
            url: `${baseUrl}/telemetry`,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'heartbeat', ts: 1 }),
          }),
          POST_DEADLINE_MS,
          'telemetry POST',
        );

        expect(result.status).toBe(200);
        expect(result.body).toContain('"ok":true');
      } finally {
        sse.close();
        await close();
      }
    },
    // Generous-but-finite: a real head-of-line hang fails here rather than
    // hanging the run forever. Above POST_DEADLINE_MS so the descriptive
    // race rejection wins first.
    10000,
  );
});
