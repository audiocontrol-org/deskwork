/**
 * specs/036-fleet-control-plane — T051 (impl), pairs with the RED test
 * tests/fleet/plane-server.test.ts.
 *
 * THE `node:http` SERVER + ROUTER (contracts/plane-client-api.md § Route
 * shape, C1/C7). No web framework — this repo carries ZERO network
 * dependencies today (package.json `dependencies`) and this file must not
 * change that. Only `node:http` is imported.
 *
 * SCOPE: this module owns wire-level dispatch ONLY — matching a request's
 * method + path against the contract's route table, extracting path
 * params, and handing off to an INJECTED handler. It does not know how to
 * build a snapshot, project a delta, or read the registry; those
 * projections are `src/plane/http/api.ts`'s job (T053/T054, a separate
 * concurrent task — deliberately not created here). `createPlaneServer`
 * takes a `PlaneRouteHandlers` map so this file is fully testable before
 * `api.ts` exists (inject fake handlers) and so T053/T054/T124 have a
 * single, named seam to fill in later — mount the real projections,
 * nothing about routing changes.
 *
 * Route shape lifted verbatim from contracts/plane-client-api.md § Route
 * shape (path-only, versioned, low-cardinality per FR-069 — no route here
 * accepts a query shape that shards the cache key; that constraint is
 * enforced by never routing on the query string, only the path).
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI). This file has no
 * relative imports (self-contained), so the repo's `.js`-suffixed relative-
 * import convention does not apply here.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

// ---------------------------------------------------------------------------
// The handler seam.
// ---------------------------------------------------------------------------

/**
 * Everything a route handler needs, already resolved by the router: the raw
 * request/response pair (a streaming handler — e.g. the SSE delta route —
 * writes multiple chunks over time and holds `res` open; a JSON handler
 * writes once and calls `res.end()`), the path params extracted from the
 * matched route pattern (e.g. `{ runId: '...' }` for `/v1/runs/:runId`),
 * and the parsed request URL (so a handler can read search params without
 * re-parsing `req.url` itself — though per FR-069 no route's SEMANTICS may
 * key off the query string).
 */
export interface RouteContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly params: Readonly<Record<string, string>>;
  readonly url: URL;
}

/**
 * A route handler owns writing the response (status, headers, body) and
 * ending or holding open `ctx.res` as appropriate for its route. Returning
 * (or resolving) without having called `res.end()` is only valid for a
 * deliberately-streaming route (e.g. SSE) that intends to keep the
 * connection open past this call.
 */
export type RouteHandler = (ctx: RouteContext) => void | Promise<void>;

/**
 * One named handler per contract route (contracts/plane-client-api.md §
 * Route shape). Named by PURPOSE, not by HTTP verb+path, so a caller
 * (T053/T054/T124) wires real projections against stable names rather than
 * re-deriving route shape from strings.
 */
export interface PlaneRouteHandlers {
  /** `GET /v1/fleet` — snapshot of current fleet state (C2). */
  readonly fleetSnapshot: RouteHandler;
  /** `GET /v1/fleet/stream` — live deltas over SSE (C2). */
  readonly fleetStream: RouteHandler;
  /** `GET /v1/runs/{runId}` — per-run detail (C5). */
  readonly runDetail: RouteHandler;
  /** `GET /v1/runs/{runId}/history` — historical view (C7). */
  readonly runHistory: RouteHandler;
  /** `GET /v1/runs/{runId}/timings` — per-run phase durations (C7). */
  readonly runTimings: RouteHandler;
  /** `POST /v1/runs/{runId}/commands` — issue a command against one run (C6). */
  readonly issueRunCommand: RouteHandler;
  /** `GET /v1/commands/{commandId}` — command lifecycle status (C6). */
  readonly commandStatus: RouteHandler;
  /** `POST /v1/fleet/commands` — fan-out command, never atomic (C6). */
  readonly issueFleetCommand: RouteHandler;
  /** `GET /v1/health/store` — durable-store health. */
  readonly storeHealth: RouteHandler;
  /** `GET /v1/instances` — instance snapshot (specs/037, read-only). */
  readonly instanceSnapshot: RouteHandler;
  /** `GET /v1/instances/stream` — instance deltas over SSE (specs/037, T036). */
  readonly instanceStream: RouteHandler;
  /** `GET /v1/instances/{id}` — per-instance detail (specs/037, read-only). */
  readonly instanceDetail: RouteHandler;
  /** `GET /v1/instances/{id}/runs` — the instance's runs, filtered (specs/037, T037). */
  readonly instanceRuns: RouteHandler;
}

// ---------------------------------------------------------------------------
// The route table — contracts/plane-client-api.md § Route shape, verbatim.
// ---------------------------------------------------------------------------

type HttpMethod = 'GET' | 'POST';

interface RouteDefinition {
  readonly method: HttpMethod;
  /** `:name` segments become path params; every other segment matches
   * literally. */
  readonly pattern: string;
  readonly handler: keyof PlaneRouteHandlers;
}

export const ROUTE_TABLE: readonly RouteDefinition[] = [
  { method: 'GET', pattern: '/v1/fleet', handler: 'fleetSnapshot' },
  { method: 'GET', pattern: '/v1/fleet/stream', handler: 'fleetStream' },
  { method: 'GET', pattern: '/v1/runs/:runId', handler: 'runDetail' },
  { method: 'GET', pattern: '/v1/runs/:runId/history', handler: 'runHistory' },
  { method: 'GET', pattern: '/v1/runs/:runId/timings', handler: 'runTimings' },
  { method: 'POST', pattern: '/v1/runs/:runId/commands', handler: 'issueRunCommand' },
  { method: 'GET', pattern: '/v1/commands/:commandId', handler: 'commandStatus' },
  { method: 'POST', pattern: '/v1/fleet/commands', handler: 'issueFleetCommand' },
  { method: 'GET', pattern: '/v1/health/store', handler: 'storeHealth' },
  // specs/037 instance-observability (read-only). ROUTE-ORDERING CONTRACT
  // (contracts/instance-query-api.md): `/v1/instances/stream` (T036) MUST be
  // registered BEFORE `/v1/instances/:id` — first-path-match dispatch
  // (dispatch(), below) + the `[^/]+` param regex would otherwise route the
  // literal `stream` segment to `instanceDetail` as an `:id`. `:id/runs` (T037)
  // is a distinct DEEPER path (4 segments vs. 3): its anchored `^...$` regex
  // cannot collide with `:id`, so it orders after `:id` (mirroring the fleet
  // `/v1/runs/:runId` → `/v1/runs/:runId/history` nesting). `:id` is a
  // URL-encoded `host:path` (the handler decodes).
  { method: 'GET', pattern: '/v1/instances', handler: 'instanceSnapshot' },
  { method: 'GET', pattern: '/v1/instances/stream', handler: 'instanceStream' },
  { method: 'GET', pattern: '/v1/instances/:id', handler: 'instanceDetail' },
  { method: 'GET', pattern: '/v1/instances/:id/runs', handler: 'instanceRuns' },
];

/**
 * An additional route mounted alongside the nine consumer routes, carrying
 * its handler INLINE rather than by a `PlaneRouteHandlers` key. This is the
 * seam the plane RUNTIME (T124, src/plane/runtime.ts) uses to mount the
 * three SIDECAR-FACING routes (POST /v1/ingest, GET /v1/sidecar/stream, POST
 * /v1/sidecar/liveness — contracts/sidecar-plane-protocol.md C1/C3/C7) that
 * are NOT part of the consumer contract's route table, WITHOUT duplicating
 * this module's dispatch/matching machinery: extra routes compile and match
 * through exactly the same path (`compilePattern`) the built-in table does.
 */
export interface ExtraRoute {
  readonly method: HttpMethod;
  readonly pattern: string;
  readonly handler: RouteHandler;
}

// ---------------------------------------------------------------------------
// Pattern compilation — `:param` segments to capture groups, no dependency.
// ---------------------------------------------------------------------------

interface CompiledRoute {
  readonly method: HttpMethod;
  readonly pattern: string;
  readonly paramNames: readonly string[];
  readonly regex: RegExp;
  readonly handlerKey: keyof PlaneRouteHandlers;
}

/**
 * A route whose handler is fully resolved to a `RouteHandler` — either a
 * built-in table route (handler looked up from `PlaneRouteHandlers` at
 * factory time) or an {@link ExtraRoute} (handler carried inline). Dispatch
 * operates over these uniformly, so the sidecar routes and the consumer
 * routes share ONE matcher.
 */
interface ResolvedRoute {
  readonly method: HttpMethod;
  readonly pattern: string;
  readonly paramNames: readonly string[];
  readonly regex: RegExp;
  readonly handler: RouteHandler;
}

function escapeLiteralSegment(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile a `:param`-bearing pattern into its param names + match regex. */
function compilePattern(pattern: string): { paramNames: readonly string[]; regex: RegExp } {
  const paramNames: string[] = [];
  const segments = pattern.split('/').filter((segment) => segment.length > 0);
  const regexParts = segments.map((segment) => {
    if (segment.startsWith(':')) {
      paramNames.push(segment.slice(1));
      return '([^/]+)';
    }
    return escapeLiteralSegment(segment);
  });
  const regex = new RegExp(`^/${regexParts.join('/')}$`);
  return { paramNames, regex };
}

function compileRoute(def: RouteDefinition): CompiledRoute {
  const { paramNames, regex } = compilePattern(def.pattern);
  return {
    method: def.method,
    pattern: def.pattern,
    paramNames,
    regex,
    handlerKey: def.handler,
  };
}

const COMPILED_ROUTES: readonly CompiledRoute[] = ROUTE_TABLE.map(compileRoute);

/**
 * Resolve the built-in table (handlers looked up by key) plus any extra
 * inline-handler routes into one uniform, matchable list. Extra routes are
 * appended AFTER the built-ins; they never shadow a built-in pattern (the
 * runtime mounts only new sidecar paths, disjoint from the consumer table).
 */
function resolveRoutes(
  handlers: PlaneRouteHandlers,
  extraRoutes: readonly ExtraRoute[],
): readonly ResolvedRoute[] {
  const builtins: ResolvedRoute[] = COMPILED_ROUTES.map((route) => ({
    method: route.method,
    pattern: route.pattern,
    paramNames: route.paramNames,
    regex: route.regex,
    handler: handlers[route.handlerKey],
  }));
  const extras: ResolvedRoute[] = extraRoutes.map((route) => {
    const { paramNames, regex } = compilePattern(route.pattern);
    return {
      method: route.method,
      pattern: route.pattern,
      paramNames,
      regex,
      handler: route.handler,
    };
  });
  return [...builtins, ...extras];
}

function extractParams(route: ResolvedRoute, pathname: string): Record<string, string> {
  const match = route.regex.exec(pathname);
  if (match === null) {
    throw new Error(
      `extractParams: pathname ${JSON.stringify(pathname)} does not match route ` +
        `${JSON.stringify(route.pattern)} — caller must only extract params after a ` +
        'positive regex.test() match.',
    );
  }
  const params: Record<string, string> = {};
  route.paramNames.forEach((name, index) => {
    // Capture group index 0 is the whole match; groups start at 1.
    const value = match[index + 1];
    if (value === undefined) {
      throw new Error(
        `extractParams: route ${JSON.stringify(route.pattern)} declares param ` +
          `${JSON.stringify(name)} but the match produced no capture at index ${index}.`,
      );
    }
    params[name] = value;
  });
  return params;
}

// ---------------------------------------------------------------------------
// Response helpers.
// ---------------------------------------------------------------------------

function respondError(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) {
    res.destroy(new Error(message));
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function parseRequestUrl(req: IncomingMessage): URL | undefined {
  if (req.url === undefined) {
    return undefined;
  }
  try {
    return new URL(req.url, 'http://plane.invalid');
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------

async function dispatch(
  routes: readonly ResolvedRoute[],
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method;
  if (method === undefined) {
    respondError(res, 400, 'request carries no HTTP method');
    return;
  }
  if (method !== 'GET' && method !== 'POST') {
    // Every contract route is GET or POST (§ Route shape); anything else
    // cannot match any pattern's method, so treat it as a 405 uniformly
    // rather than falling through to per-route matching.
    respondError(res, 405, `method ${method} is not used by any route on this server`);
    return;
  }

  const url = parseRequestUrl(req);
  if (url === undefined) {
    respondError(res, 400, `malformed request URL: ${JSON.stringify(req.url)}`);
    return;
  }

  const pathMatches = routes.filter((route) => route.regex.test(url.pathname));
  if (pathMatches.length === 0) {
    respondError(res, 404, `no route matches ${url.pathname}`);
    return;
  }

  const exact = pathMatches.find((route) => route.method === method);
  if (exact === undefined) {
    const allowed = [...new Set(pathMatches.map((route) => route.method))];
    res.setHeader('allow', allowed.join(', '));
    respondError(res, 405, `method ${method} not allowed on ${url.pathname}`);
    return;
  }

  const params = extractParams(exact, url.pathname);
  const handler = exact.handler;
  const ctx: RouteContext = { req, res, params, url };

  try {
    await handler(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    respondError(res, 500, message);
  }
}

// ---------------------------------------------------------------------------
// The factory.
// ---------------------------------------------------------------------------

/**
 * Build a `node:http` server that dispatches every contract route
 * (contracts/plane-client-api.md § Route shape) to the corresponding
 * injected handler. The caller owns `listen()`/`close()` — this factory
 * only wires request dispatch, matching `createServer`'s own contract so
 * this composes with the rest of the plane's process lifecycle (T124)
 * without this module knowing anything about ports, hosts, or supervision.
 *
 * `extraRoutes` (default `[]`) mounts additional inline-handler routes
 * alongside the nine consumer routes through the SAME matcher — the plane
 * runtime (T124) passes the three sidecar-facing routes here so the
 * single-arg callers (server.ts's own tests, T053/T054) keep working
 * unchanged while the runtime gets one server that serves both surfaces
 * without a duplicated router.
 */
export function createPlaneServer(
  handlers: PlaneRouteHandlers,
  extraRoutes: readonly ExtraRoute[] = [],
): Server {
  const routes = resolveRoutes(handlers, extraRoutes);
  return createServer((req, res) => {
    dispatch(routes, req, res).catch((error: unknown) => {
      // dispatch() itself catches handler errors; this only guards against
      // a rejection escaping dispatch() before a response was ever sent
      // (e.g. a synchronous throw resolving in the async wrapper before
      // headers were written). Destroy the connection rather than hang.
      if (!res.headersSent) {
        respondError(res, 500, error instanceof Error ? error.message : String(error));
        return;
      }
      res.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
