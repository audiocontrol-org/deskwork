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

    const url = new URL(INSTANCE_STREAM_PATH, deps.config.planeUrl).toString();

    const run = async (): Promise<void> => {
      try {
        const response = await deps.fetchFn(url, {
          headers: { Authorization: `Bearer ${deps.config.planeReadToken}` },
          signal: controller.signal,
        });
        if (closed) {
          return;
        }
        if (!response.ok || response.body === null) {
          fireDrop();
          return;
        }
        await readDeltaFrames(response.body, handlers, () => closed);
      } catch {
        // Connect refused, DNS failure, TLS error, or a mid-stream
        // transport rejection all land here — a reestablish-class end, not
        // a crash. `fireDrop` filters out the case where `close()` already
        // ran (an aborted fetch rejects too, and that is a deliberate
        // teardown, not a drop).
      }
      fireDrop();
    };

    void run();

    return {
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
