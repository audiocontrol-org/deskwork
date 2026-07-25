/**
 * Fleet Dashboard BFF — Browser-Facing `/api/*` Routes (T014/T015/T016)
 *
 * Per contracts/dashboard-bff-api.md, this module owns the two live Phase-4
 * (US2) routes:
 *
 *   - `GET /api/instances` — the current fleet snapshot, proxied/adapted
 *     from the plane's `GET /v1/instances` via {@link PlaneClient}
 *     (FR-014a: `?include=all` reveals gone/disconnected instances — the
 *     PLANE does the actual filtering, per src/plane/http/instance-api.ts's
 *     `instanceSnapshot`; this route's whole job is to translate the
 *     browser-facing `?include=all` query param into
 *     `PlaneClient.instanceSnapshot({ includeAll: true })`).
 *   - `GET /api/stream` — same-origin SSE fan-out of the dashboard's single
 *     upstream instance-delta subscription ({@link StreamRelay}, T013).
 *
 * Drill-in routes (`/api/instances/:id`, `/api/runs/:id`, …) are Phase 5 /
 * US3 (T018–T019) and are NOT mounted here — any other `/api/*` path 404s.
 *
 * Per FR-017 ("no reshaping, no new projection"), `PlaneClient.
 * instanceSnapshot()`'s resolved body is forwarded to the browser VERBATIM
 * — this route neither unwraps nor re-shapes it.
 *
 * Per FR-003/FR-025, this module never sees the plane read credential: its
 * dependencies are narrowed via `Pick<...>` to exactly the methods it
 * calls, and on any upstream failure it returns a FIXED, credential-free
 * `upstream_unavailable` body — never the underlying error's message,
 * which could (in principle, for an unexpected non-`PlaneClientError`
 * throw) contain something this module cannot audit.
 *
 * Per FR-022/FR-023 (the no-in-app-auth invariant, T014's U1 hardening):
 * the two routes below, plus the `not_found` fallback, are the WHOLE
 * `/api/*` route surface this module recognizes — there is no login/
 * session/auth branch, and no response written here ever sets a
 * `Set-Cookie` or `WWW-Authenticate` header.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PlaneClient } from './plane-client.js';
import type { RelayEvent, StreamRelay } from './stream-relay.js';

/** Dependencies for {@link handleApiRequest}. Each is narrowed via `Pick`
 * to exactly the methods this module calls — `/api/instances` only ever
 * needs `instanceSnapshot`; `/api/stream` only ever needs `subscribe`. */
export interface RoutesDeps {
  readonly planeClient: Pick<PlaneClient, 'instanceSnapshot'>;
  readonly relay: Pick<StreamRelay, 'subscribe'>;
}

const API_INSTANCES_PATH = '/api/instances';
const API_STREAM_PATH = '/api/stream';
const INCLUDE_ALL_VALUE = 'all';

/** Exported so drill-in-routes.ts (T019, US3) reuses the exact same
 * JSON-response shape instead of re-implementing it — one write helper for
 * the whole `/api/*` surface. */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** The one, fixed, credential-free body returned for ANY upstream failure
 * — a `PlaneClientError` (already credential-free per plane-client.ts's own
 * contract) or an unexpected non-`PlaneClientError` throw. Never forwards
 * `err.message` to the browser: this module cannot itself audit that an
 * unexpected error's message is credential-free, so it never takes the
 * risk (FR-003). Exported so drill-in-routes.ts (T019, US3) returns the
 * IDENTICAL upstream-unavailable shape rather than a near-duplicate. */
export function writeUpstreamUnavailable(res: ServerResponse): void {
  writeJson(res, 503, {
    error: 'upstream_unavailable',
    message: 'the fleet plane is unreachable',
  });
}

async function handleInstancesSnapshot(deps: RoutesDeps, url: URL, res: ServerResponse): Promise<void> {
  const includeAll = url.searchParams.get('include') === INCLUDE_ALL_VALUE;
  let body: unknown;
  try {
    body = await deps.planeClient.instanceSnapshot(includeAll ? { includeAll: true } : undefined);
  } catch {
    writeUpstreamUnavailable(res);
    return;
  }
  writeJson(res, 200, body);
}

function writeSseEvent(res: ServerResponse, eventName: string, data: unknown): void {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Forward one relay event onto the SSE wire (contracts/dashboard-bff-api.md
 * § Live-Update Stream), or — for `disconnected` — end the response so the
 * browser's native `EventSource` fires `onerror` and reconnects (FR-016). A
 * fresh `GET /api/stream` re-subscribes and receives the relay's next ready
 * snapshot once its own reconnect/resync completes. */
function forwardRelayEvent(
  res: ServerResponse,
  unsubscribe: () => void,
  event: RelayEvent,
): void {
  if (event.kind === 'snapshot') {
    writeSseEvent(res, 'snapshot', { instances: event.instances });
    return;
  }
  if (event.kind === 'delta') {
    const { delta } = event;
    if (delta.kind === 'instance-upserted') {
      writeSseEvent(res, 'instance-upserted', delta.instance);
    } else {
      writeSseEvent(res, 'instance-removed', { id: delta.id });
    }
    return;
  }
  // event.kind === 'disconnected'
  unsubscribe();
  res.end();
}

function handleStream(deps: RoutesDeps, res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  // `writeHead()` alone only sets internal header state — Node does not
  // send the status line + headers over the wire until the first `write()`
  // or `end()`, which for a long-lived SSE stream may be arbitrarily far in
  // the future (no delta may arrive for a while). Flush explicitly so the
  // browser's `EventSource`/`fetch()` connects promptly instead of hanging
  // until the first byte of body data.
  res.flushHeaders();
  // `subscription` is assigned from `subscribe()`'s return value, but the
  // listener below may itself be invoked SYNCHRONOUSLY from inside that
  // same `subscribe()` call (e.g. an already-ready relay delivers its
  // current snapshot before returning) — before the `subscription`
  // assignment below has run. Route unsubscribe through a `let` + closure
  // rather than closing over the `subscribe()` result directly, so a
  // same-tick call can never observe an uninitialized binding.
  let subscription: { readonly unsubscribe: () => void } | undefined;
  let torndown = false;
  const unsubscribe = (): void => {
    // Idempotent: `close` and `error` (below) can both fire for one severed
    // connection; tearing down twice must be a no-op.
    if (torndown) {
      return;
    }
    torndown = true;
    subscription?.unsubscribe();
  };
  subscription = deps.relay.subscribe((event) => {
    forwardRelayEvent(res, unsubscribe, event);
  });
  // A client-initiated disconnect (browser tab closed, EventSource torn
  // down) must not leak a listener registration on the relay forever.
  res.once('close', unsubscribe);
  // AUDIT-20260725-02: an abrupt client disconnect (tab close, laptop sleep,
  // network drop) surfaces as an `error` event (EPIPE/ECONNRESET) on the
  // response stream. With NO `error` listener, Node treats it as an unhandled
  // stream `error` and THROWS — an uncaught exception that would terminate the
  // whole BFF process, killing EVERY connected dashboard, not just this one.
  // Attaching a handler absorbs the error and tears this one subscriber down.
  res.on('error', unsubscribe);
}

/**
 * Dispatch one request whose `url.pathname` starts with `/api/`. Returns
 * `true` once a response has been written (or, for `/api/stream`, is
 * actively streaming) — the caller (http-server.ts) must not fall through
 * to static/404 handling in that case. Returns `false` for any path NOT
 * under `/api/`, so the caller dispatches it elsewhere; this function never
 * recognizes a login/session/auth path under any prefix (FR-022/FR-023).
 */
export async function handleApiRequest(
  deps: RoutesDeps,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/')) {
    return false;
  }
  if (req.method !== 'GET') {
    writeJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (url.pathname === API_INSTANCES_PATH) {
    await handleInstancesSnapshot(deps, url, res);
    return true;
  }
  if (url.pathname === API_STREAM_PATH) {
    handleStream(deps, res);
    return true;
  }
  writeJson(res, 404, { error: 'not_found' });
  return true;
}
