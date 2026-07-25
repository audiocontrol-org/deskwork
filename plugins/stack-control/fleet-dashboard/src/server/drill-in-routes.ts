/**
 * Fleet Dashboard BFF — Drill-In Routes (T018/T019, US3)
 *
 * Per contracts/dashboard-bff-api.md § Drill-In Endpoints and data-model.md
 * (Run entity), this module owns the five per-instance / per-run detail
 * proxy routes:
 *
 *   - `GET /api/instances/:id`        -> `PlaneClient.instanceDetail(id)`
 *   - `GET /api/instances/:id/runs`   -> `PlaneClient.instanceRuns(id)`
 *   - `GET /api/runs/:id`             -> `PlaneClient.runDetail(id)`
 *   - `GET /api/runs/:id/history`     -> `PlaneClient.runHistory(id)`
 *   - `GET /api/runs/:id/timings`     -> `PlaneClient.runTimings(id)`
 *
 * This is a SIBLING to routes.ts (not an extension of it) so routes.ts
 * stays under the project's 300–500 line file cap — http-server.ts wires
 * both modules into the same dispatch (see {@link handleDrillInRequest}'s
 * doc for the ordering contract).
 *
 * Per FR-017 ("no reshaping, no new projection"), every matched route's
 * resolved plane-client body is forwarded to the browser VERBATIM.
 *
 * Per FR-003/FR-025, this module never sees the plane read credential: its
 * dependency is narrowed via `Pick<...>` to exactly the five methods it
 * calls, and on any upstream failure it returns routes.ts's fixed,
 * credential-free `upstream_unavailable` body — never the underlying
 * error's message, mirroring routes.ts's own `handleInstancesSnapshot`.
 *
 * Per data-model.md's explicit note ("there is no instance-level
 * history/timings endpoint"), this module deliberately does NOT recognize
 * `/api/instances/:id/history` or `/api/instances/:id/timings` — there is
 * no `PlaneClient` method it could proxy those to. An instance's "history"
 * is its `recentActivity` field (already served by `/api/instances(/:id)`)
 * plus its owned runs (`/api/instances/:id/runs`); a request to either
 * unrecognized path falls through to routes.ts's `not_found` 404, same as
 * any other unrecognized `/api/*` path.
 *
 * A caller-supplied `id`/`runId` MAY itself contain `/` (an instance id is
 * `host:path`, mirroring plane-client.ts's own note) — the browser is
 * expected to `encodeURIComponent` it into the URL, so this module never
 * sees a raw `/` inside a matched id segment; it `decodeURIComponent`s the
 * matched segment before handing it to `PlaneClient`, which re-encodes it
 * for the upstream call (plane-client.ts's own escaping is the single
 * source of truth for the upstream path shape — this module never builds
 * an upstream path itself).
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PlaneClient } from './plane-client.js';
import { writeJson, writeUpstreamUnavailable } from './routes.js';

/** Dependencies for {@link handleDrillInRequest}. Narrowed via `Pick` to
 * exactly the five methods this module calls — mirrors routes.ts's
 * `RoutesDeps` narrowing discipline for `instanceSnapshot`. */
export interface DrillInDeps {
  readonly planeClient: Pick<
    PlaneClient,
    'instanceDetail' | 'instanceRuns' | 'runDetail' | 'runHistory' | 'runTimings'
  >;
}

/** One matched drill-in route: a path pattern with exactly one capture
 * group (the id/runId segment), and the `PlaneClient` call it proxies to. */
interface DrillInRoute {
  readonly pattern: RegExp;
  readonly call: (planeClient: DrillInDeps['planeClient'], id: string) => Promise<unknown>;
}

/**
 * The five drill-in path SHAPES this module recognizes, as regular
 * expressions over the request pathname only (no query string). Each
 * pattern's single capture group is the URL-encoded id/runId segment;
 * `[^/]+` cannot itself contain a raw `/`, so a caller-supplied id
 * containing `/` MUST already be `encodeURIComponent`-escaped by the
 * browser to be matched at all — this is a structural property of the
 * pattern, not a runtime check.
 *
 * Order matters only for the (extremely unlikely) case of a route ever
 * overlapping another's shape; today none do — `/api/runs/:id` cannot
 * match `/api/runs/:id/history` or `/api/runs/:id/timings` because
 * `[^/]+$` requires the id segment to be the final path component.
 */
const DRILL_IN_ROUTES: readonly DrillInRoute[] = [
  {
    pattern: /^\/api\/instances\/([^/]+)$/,
    call: (planeClient, id) => planeClient.instanceDetail(id),
  },
  {
    pattern: /^\/api\/instances\/([^/]+)\/runs$/,
    call: (planeClient, id) => planeClient.instanceRuns(id),
  },
  {
    pattern: /^\/api\/runs\/([^/]+)$/,
    call: (planeClient, runId) => planeClient.runDetail(runId),
  },
  {
    pattern: /^\/api\/runs\/([^/]+)\/history$/,
    call: (planeClient, runId) => planeClient.runHistory(runId),
  },
  {
    pattern: /^\/api\/runs\/([^/]+)\/timings$/,
    call: (planeClient, runId) => planeClient.runTimings(runId),
  },
];

/**
 * Dispatch one GET request whose `url.pathname` matches one of the five
 * drill-in route shapes above. Returns `true` once a response has been
 * written — the caller (http-server.ts) must not fall through to
 * routes.ts's `/api/*` handling in that case. Returns `false` for any
 * path/method this module does NOT recognize (including non-GET requests,
 * and the deliberately-unrecognized `/api/instances/:id/history` and
 * `/api/instances/:id/timings` shapes — see this module's top doc), so the
 * caller falls through to routes.ts, which owns the generic `/api/*`
 * method-not-allowed and not-found responses.
 *
 * MUST be dispatched BEFORE routes.ts's `handleApiRequest` in
 * http-server.ts: routes.ts's own `/api/*` handling ends in an unconditional
 * `not_found` 404 for any path it does not itself recognize, so if it ran
 * first it would consume every drill-in request before this module ever
 * saw it.
 */
export async function handleDrillInRequest(
  deps: DrillInDeps,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method !== 'GET') {
    return false;
  }
  for (const route of DRILL_IN_ROUTES) {
    const match = route.pattern.exec(url.pathname);
    if (match === null) {
      continue;
    }
    const encodedId = match[1];
    if (encodedId === undefined) {
      continue;
    }
    const id = decodeURIComponent(encodedId);
    let body: unknown;
    try {
      body = await route.call(deps.planeClient, id);
    } catch {
      writeUpstreamUnavailable(res);
      return true;
    }
    writeJson(res, 200, body);
    return true;
  }
  return false;
}
