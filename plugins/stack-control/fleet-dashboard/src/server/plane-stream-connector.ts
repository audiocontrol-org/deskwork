/**
 * Fleet Dashboard BFF — Plane Stream Connector (T013)
 *
 * The REAL, network-backed {@link ConnectUpstream} that `stream-relay.ts`'s
 * fan-out relay holds as its ONE upstream connection to the plane's
 * `GET /v1/instances/stream` SSE route. Deliberately a separate file, and
 * a separate module, from `plane-client.ts`: that client's allowlist
 * explicitly EXCLUDES the literal `stream` id (`/v1/instances/stream` is
 * the plane's reserved SSE route, not a `/v1/instances/:id` read) — this
 * module owns that one credentialed streaming call instead.
 *
 * Wire framing (mirrors src/plane/instance-handlers.ts `writeInstanceDelta`):
 * the plane frames each delta as `event: instance-delta\ndata: <json>\n\n`,
 * plus a `:keepalive` COMMENT frame on its own timer. This module treats
 * comment frames as pure liveness noise — there is no read-idle watchdog
 * here (unlike the sidecar's SseClient, src/sidecar/uplink/sse-client.ts);
 * "the stream ended or errored" is the whole drop signal, matching
 * `stream-relay.ts`'s simpler reconnect-on-drop contract (FR-016 asks for
 * reconnect + re-snapshot, not a bounded idle horizon).
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

import { createParser } from 'eventsource-parser';
import type { DashboardConfig } from './config.js';
import {
  isInstanceDelta,
  type ConnectUpstream,
  type UpstreamConnection,
  type UpstreamHandlers,
} from './stream-relay.js';

const INSTANCE_STREAM_PATH = '/v1/instances/stream';
const INSTANCE_DELTA_EVENT = 'instance-delta';

/** Dependencies for {@link createPlaneStreamConnector}. Both are supplied
 * by the caller (composition/DI), mirroring `PlaneClientDeps`. */
export interface PlaneStreamConnectorDeps {
  readonly config: DashboardConfig;
  readonly fetchFn: typeof fetch;
}

/**
 * Build the real {@link ConnectUpstream}. Each call opens ONE credentialed
 * `fetch` to the plane's instance-delta SSE route (Authorization: Bearer,
 * matching `plane-client.ts`'s scheme) and dispatches `handlers.onDelta`
 * for every well-formed `instance-delta` frame. The connect attempt
 * failing, a non-2xx / bodyless response, or the stream ending (body
 * closes, or a transport error mid-read) all surface as exactly one
 * `handlers.onDrop()` call — UNLESS the caller already called `close()`
 * (a deliberate teardown is never reported as a drop).
 *
 * The returned {@link UpstreamConnection.established} handshake
 * (AUDIT-20260725-10) resolves the instant the `fetch` resolves with an OK
 * response whose body is a readable stream — i.e. the plane has accepted the
 * SSE request and this module is about to consume the initial burst — and
 * BEFORE any body parsing begins. It REJECTS if the connect fails (transport
 * error), the response is non-2xx / bodyless, or a deliberate `close()` beats
 * the response. This lets `stream-relay.ts` await genuine registration at the
 * plane before it reads the authoritative snapshot, instead of racing the
 * fire-and-forget `void run()` below. A hung connect that never yields
 * response headers is bounded by the injected `fetch`'s own header timeout
 * (undici's `headersTimeout`) — surfacing as a rejection here — and by
 * `close()` aborting the request on teardown; the relay's retry / stop paths
 * (never an infinite await) take it from there. Establishment failure carries
 * only the URL and status, never the read credential (which lives in a
 * request header, not the message).
 */
export function createPlaneStreamConnector(deps: PlaneStreamConnectorDeps): ConnectUpstream {
  return (handlers: UpstreamHandlers): UpstreamConnection => {
    const controller = new AbortController();
    let closed = false;
    let dropped = false;

    const fireDrop = (): void => {
      if (dropped || closed) {
        return;
      }
      dropped = true;
      handlers.onDrop();
    };

    // The establishment handshake. `settleEstablished` collapses resolve/reject
    // into a single one-shot settle: a Promise settles only once, so the later
    // reject in the `catch` after a successful `markEstablished()` is an inert
    // no-op — no double-settle, no unhandled path.
    let markEstablished!: () => void;
    let failEstablished!: (reason: Error) => void;
    const established = new Promise<void>((resolve, reject) => {
      markEstablished = resolve;
      failEstablished = reject;
    });

    const url = new URL(INSTANCE_STREAM_PATH, deps.config.planeUrl).toString();

    const run = async (): Promise<void> => {
      try {
        const response = await deps.fetchFn(url, {
          headers: { Authorization: `Bearer ${deps.config.planeReadToken}` },
          signal: controller.signal,
        });
        if (closed) {
          // Deliberate teardown beat the response — never a drop; reject the
          // handshake so an awaiting resync abandons this attempt cleanly.
          failEstablished(new Error(`plane instance stream closed before it established: ${url}`));
          return;
        }
        if (!response.ok || response.body === null) {
          failEstablished(
            new Error(
              `plane instance stream did not establish (status ${response.status}): ${url}`,
            ),
          );
          fireDrop();
          return;
        }
        // Headers received and the body is a readable stream: the SSE is
        // ESTABLISHED at the plane. Signal the relay it may now read the
        // authoritative snapshot — BEFORE we begin consuming the body.
        markEstablished();
        await readDeltaFrames(response.body, handlers, () => closed);
      } catch {
        // Connect refused, DNS failure, TLS error, or a mid-stream
        // transport rejection all land here — a reestablish-class end, not
        // a crash. `fireDrop` filters out the case where `close()` already
        // ran (an aborted fetch rejects too, and that is a deliberate
        // teardown, not a drop). Reject the handshake in case headers never
        // arrived; if it already resolved, this settle is a no-op.
        failEstablished(new Error(`plane instance stream connect/transport error: ${url}`));
      }
      fireDrop();
    };

    void run();

    return {
      established,
      close(): void {
        closed = true;
        controller.abort();
      },
    };
  };
}

/**
 * Read `body` to completion, feeding each chunk through an
 * `eventsource-parser` framing pass and dispatching `handlers.onDelta` for
 * every well-formed `instance-delta` event. A malformed `data:` payload
 * (bad JSON, or JSON that fails {@link isInstanceDelta}) is dropped
 * silently — one bad frame must never crash the connector or reject the
 * whole stream. `isClosed` is polled between reads so a caller-triggered
 * `close()` stops the loop promptly instead of draining the rest of the
 * body.
 */
async function readDeltaFrames(
  body: ReadableStream<Uint8Array>,
  handlers: UpstreamHandlers,
  isClosed: () => boolean,
): Promise<void> {
  const parser = createParser({
    onEvent(message) {
      if (message.event !== INSTANCE_DELTA_EVENT) {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        return;
      }
      if (isInstanceDelta(parsed)) {
        handlers.onDelta(parsed);
      }
    },
    onError() {
      // An unknown field or malformed retry line: ignore, mirrors
      // sse-client.ts's framing tolerance — one bad line never rejects the
      // surrounding frame.
    },
  });

  const decoder = new TextDecoder();
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || isClosed()) {
        return;
      }
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}
