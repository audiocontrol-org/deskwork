/**
 * Fleet Dashboard BFF — `node:http` Server (T015)
 *
 * The dashboard's own `node:http` server: mounts the browser-facing
 * `/api/*` routes (routes.ts, T014/T016; drill-in-routes.ts, T018/T019) and
 * the static `GET /` placeholder (static.ts) on ONE listener, so the
 * browser talks to a single same-origin server (contracts/
 * dashboard-bff-api.md § Same-Origin Principle). The caller (index.ts) owns
 * `listen()`/`close()` and the loopback-by-default bind address (config.ts,
 * FR-024) — this module only wires request dispatch, mirroring
 * `src/plane/http/server.ts`'s `createPlaneServer` factory shape.
 *
 * Dispatch order: drill-in-routes.ts's `handleDrillInRequest` runs FIRST,
 * then routes.ts's `handleApiRequest`. This order is load-bearing —
 * routes.ts's own `/api/*` handling ends in an unconditional `not_found`
 * 404 for anything it doesn't itself recognize (`/api/instances` exact,
 * `/api/stream` exact), so if it ran first it would consume every drill-in
 * request (`/api/instances/:id`, `/api/runs/:id`, …) before drill-in-routes
 * ever saw it. drill-in-routes.ts, in turn, only recognizes its five
 * shapes and returns `false` for everything else (including non-GET
 * requests), so unmatched/non-GET `/api/*` requests still fall through to
 * routes.ts's generic `method_not_allowed`/`not_found` handling.
 *
 * Per FR-022/FR-023 (the no-in-app-auth invariant): the dispatch below is
 * exactly drill-in-routes.ts → routes.ts → `GET /` → static placeholder →
 * 404. There is no login/session/auth branch anywhere in that chain, so no
 * such route can exist here by construction; no header this module (or
 * routes.ts, drill-in-routes.ts, or static.ts) writes is ever `Set-Cookie`
 * or `WWW-Authenticate`.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { PlaneClient } from './plane-client.js';
import { handleApiRequest, type RoutesDeps } from './routes.js';
import { handleDrillInRequest } from './drill-in-routes.js';
import { serveNotFound, serveStaticRoot } from './static.js';

/**
 * Dependencies for {@link createDashboardServer}: the union of what
 * routes.ts's `handleApiRequest` needs (`instanceSnapshot` + the relay) and
 * what drill-in-routes.ts's `handleDrillInRequest` needs (the five drill-in
 * methods) — structurally a superset of both narrower `Pick<...>` shapes,
 * so a caller's full {@link PlaneClient} (index.ts's real, six-method
 * client) satisfies this without any cast, and this same object is passed
 * to both handlers unchanged (each narrows it structurally on its own).
 */
export interface DashboardServerDeps {
  readonly planeClient: Pick<
    PlaneClient,
    'instanceSnapshot' | 'instanceDetail' | 'instanceRuns' | 'runDetail' | 'runHistory' | 'runTimings'
  >;
  readonly relay: RoutesDeps['relay'];
}

/** The base used to resolve `req.url` (a path-only string) into a `URL` for
 * query-string parsing. Never a real network origin — this server is only
 * ever reached same-origin, so the authority component is discarded. */
const REQUEST_URL_BASE = 'http://dashboard.invalid';

function parseRequestUrl(rawUrl: string | undefined): URL | undefined {
  if (rawUrl === undefined) {
    return undefined;
  }
  try {
    return new URL(rawUrl, REQUEST_URL_BASE);
  } catch {
    return undefined;
  }
}

function writeMalformedRequest(res: ServerResponse): void {
  res.writeHead(400, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'malformed_request' }));
}

function writeInternalError(res: ServerResponse, error: unknown): void {
  if (res.headersSent) {
    res.destroy(error instanceof Error ? error : new Error(String(error)));
    return;
  }
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'internal_error' }));
}

async function dispatch(
  deps: DashboardServerDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = parseRequestUrl(req.url);
  if (url === undefined) {
    writeMalformedRequest(res);
    return;
  }

  const drillInHandled = await handleDrillInRequest(deps, req, res, url);
  if (drillInHandled) {
    return;
  }
  const handled = await handleApiRequest(deps, req, res, url);
  if (handled) {
    return;
  }
  if (url.pathname === '/' && req.method === 'GET') {
    serveStaticRoot(res);
    return;
  }
  serveNotFound(res);
}

/**
 * Build the dashboard BFF's `node:http` server. The caller supplies the
 * plane client + stream relay via {@link DashboardServerDeps}
 * (composition/DI, mirroring `plane-client.ts`/`stream-relay.ts`'s own
 * dependency shape) and owns `listen()`.
 */
export function createDashboardServer(deps: DashboardServerDeps): Server {
  return createServer((req, res) => {
    dispatch(deps, req, res).catch((error: unknown) => {
      writeInternalError(res, error);
    });
  });
}
