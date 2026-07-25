/**
 * Fleet Dashboard BFF — Plane Client (T011)
 *
 * The ONLY party in the dashboard BFF that calls the plane's `/v1/*` read
 * API, and the ONLY holder of the read credential (FR-002, FR-025). Every
 * outbound call is one of a FIXED, closed set of allowlisted read routes —
 * `PlaneClient`'s public surface has no generic "call this path" escape
 * hatch, so an off-allowlist upstream call is not merely discouraged, it is
 * unconstructable through this module's public API (mirrors the project's
 * "make the failure state impossible" design thesis).
 *
 * As defense-in-depth against path-injection via a caller-supplied id/runId
 * (an instance id is `host:path` and MAY itself contain `/`), every
 * caller-supplied identifier is `encodeURIComponent`-escaped before being
 * spliced into the request path, and the resulting path is re-validated
 * against the allowlist ({@link isAllowlistedPlanePath}) immediately before
 * the credentialed fetch is issued — so even a malformed/malicious id
 * cannot widen a call past its own route's shape.
 *
 * The read credential is attached ONLY as the `Authorization: Bearer
 * <token>` header on these allowlisted calls — matching the plane's own
 * bearer-scheme verification (src/plane/http/auth.ts) — never in a query
 * string, never logged. Every method's return value is exactly the parsed
 * upstream JSON body; nothing else this module holds (config, token,
 * headers) is ever mixed into it, and no thrown error's message ever
 * contains the token (FR-003).
 *
 * `fetch` and `DashboardConfig` are both injected via the `PlaneClientDeps`
 * constructor argument (composition, interface-first DI — mirrors
 * `CdnReaderDeps`/`createCdnReader`, src/storage/cdn-reader.ts) so tests can
 * assert on outgoing requests without any real network I/O.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution — this package has no `@/` alias
 * (see config.ts / index.ts).
 */

import type { DashboardConfig } from './config.js';

/** Raised for any upstream failure this client cannot silently absorb: a
 * refused (non-allowlisted) upstream path, a transport failure, a non-2xx
 * upstream response, or a malformed upstream body. Never carries the read
 * credential in its message (FR-003). */
export class PlaneClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaneClientError';
  }
}

/** Options for {@link PlaneClient.instanceSnapshot}'s reveal query
 * (FR-014a): `includeAll` requests `?include=all` so gone/disconnected
 * instances are included in the snapshot. */
export interface InstanceSnapshotOptions {
  readonly includeAll?: boolean;
}

/**
 * The dashboard BFF's sole upstream-read surface. Every method proxies
 * exactly one plane `/v1/*` GET route (dashboard-bff-api.md's upstream
 * allowlist) and resolves to the parsed JSON body verbatim — no reshaping,
 * no new projection (FR-017). There is deliberately no generic `get(path)`
 * method: the six methods below ARE the allowlist.
 */
export interface PlaneClient {
  /** `GET /v1/instances` (optionally `?include=all`, FR-014a). */
  instanceSnapshot(opts?: InstanceSnapshotOptions): Promise<unknown>;
  /** `GET /v1/instances/:id`. */
  instanceDetail(id: string): Promise<unknown>;
  /** `GET /v1/instances/:id/runs`. */
  instanceRuns(id: string): Promise<unknown>;
  /** `GET /v1/runs/:runId`. */
  runDetail(runId: string): Promise<unknown>;
  /** `GET /v1/runs/:runId/history`. */
  runHistory(runId: string): Promise<unknown>;
  /** `GET /v1/runs/:runId/timings`. */
  runTimings(runId: string): Promise<unknown>;
}

/** Dependencies for {@link createPlaneClient}. Both are supplied by the
 * caller (composition/DI) — this module never reaches for the global
 * ambient `fetch` or `process.env` on its own. */
export interface PlaneClientDeps {
  readonly config: DashboardConfig;
  readonly fetchFn: typeof fetch;
}

/**
 * The six upstream path SHAPES this client will ever request, as regular
 * expressions over the request path only (no query string — the
 * `?include=all` reveal query is validated separately, see
 * {@link getJson}). A caller-supplied id/runId is always
 * `encodeURIComponent`-escaped before reaching here, so it can never
 * introduce an extra `/`-segment; this is the final, structural check that
 * a constructed path still matches its own route's shape immediately
 * before the credentialed request goes out.
 *
 * The `/v1/instances/:id` and `/v1/instances/:id/runs` patterns exclude
 * the literal id `stream` — on the plane's OWN route table (src/plane/
 * http/server.ts) `/v1/instances/stream` is the reserved SSE route
 * (`instanceStream`, owned by stream-relay.ts / T012–T013, not this
 * module), and an unqualified `[^/]+` id pattern would otherwise treat
 * that literal segment as a valid — but wrong-route — instance id.
 */
const ALLOWLISTED_PATH_PATTERNS: readonly RegExp[] = [
  /^\/v1\/instances$/,
  /^\/v1\/instances\/(?!stream$)[^/]+$/,
  /^\/v1\/instances\/(?!stream\/)[^/]+\/runs$/,
  /^\/v1\/runs\/[^/]+$/,
  /^\/v1\/runs\/[^/]+\/history$/,
  /^\/v1\/runs\/[^/]+\/timings$/,
];

/**
 * Whether `path` (no query string) matches one of the six allowlisted
 * upstream route shapes. Exported so the allowlist is directly testable —
 * not only observable indirectly through {@link PlaneClient}'s methods.
 */
export function isAllowlistedPlanePath(path: string): boolean {
  return ALLOWLISTED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function assertAllowlistedPath(path: string): void {
  if (!isAllowlistedPlanePath(path)) {
    throw new PlaneClientError(
      `plane-client refuses to proxy non-allowlisted upstream path '${path}' — ` +
        'the dashboard BFF only issues its fixed set of allowlisted /v1/* reads (FR-025).',
    );
  }
}

/** Splits `path` into its pathname and query-string components (`?`
 * onward, empty string if absent) — the allowlist is validated against the
 * pathname only. */
function splitQuery(path: string): { readonly pathname: string; readonly query: string } {
  const idx = path.indexOf('?');
  if (idx === -1) {
    return { pathname: path, query: '' };
  }
  return { pathname: path.slice(0, idx), query: path.slice(idx) };
}

/**
 * Attach the plane read credential to `path` (Authorization: Bearer,
 * matching the plane's own bearer-scheme verification, src/plane/http/
 * auth.ts), issue the request via the injected `fetchFn`, and return the
 * parsed JSON body. `path`'s pathname is re-validated against the
 * allowlist immediately before the credentialed fetch — this is the ONE
 * place in this module the credential is ever attached, so every
 * allowlisted call, and only allowlisted calls, ever carry it.
 */
async function getJson(deps: PlaneClientDeps, path: string): Promise<unknown> {
  const { pathname } = splitQuery(path);
  assertAllowlistedPath(pathname);

  const url = new URL(path, deps.config.planeUrl).toString();

  let response: Response;
  try {
    response = await deps.fetchFn(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${deps.config.planeReadToken}` },
    });
  } catch (err) {
    throw new PlaneClientError(
      `plane-client: request to upstream path '${path}' failed to reach the plane: ${String(err)}`,
    );
  }

  if (!response.ok) {
    throw new PlaneClientError(
      `plane-client: upstream path '${path}' returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new PlaneClientError(
      `plane-client: upstream path '${path}' returned a non-JSON body: ${String(err)}`,
    );
  }
  return body;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function buildInstanceSnapshotPath(opts?: InstanceSnapshotOptions): string {
  return opts?.includeAll === true ? '/v1/instances?include=all' : '/v1/instances';
}

function buildInstanceDetailPath(id: string): string {
  return `/v1/instances/${encodeSegment(id)}`;
}

function buildInstanceRunsPath(id: string): string {
  return `/v1/instances/${encodeSegment(id)}/runs`;
}

function buildRunDetailPath(runId: string): string {
  return `/v1/runs/${encodeSegment(runId)}`;
}

function buildRunHistoryPath(runId: string): string {
  return `/v1/runs/${encodeSegment(runId)}/history`;
}

function buildRunTimingsPath(runId: string): string {
  return `/v1/runs/${encodeSegment(runId)}/timings`;
}

/**
 * The real, `fetch`-backed {@link PlaneClient}. `deps.fetchFn` is called
 * exactly once per method call (no retry/backoff — mirrors the project's
 * "bare wire operation only" scope discipline, src/sidecar/uplink/post.ts),
 * and only ever with one of the six allowlisted paths above.
 */
export function createPlaneClient(deps: PlaneClientDeps): PlaneClient {
  return {
    instanceSnapshot: (opts) => getJson(deps, buildInstanceSnapshotPath(opts)),
    instanceDetail: (id) => getJson(deps, buildInstanceDetailPath(id)),
    instanceRuns: (id) => getJson(deps, buildInstanceRunsPath(id)),
    runDetail: (runId) => getJson(deps, buildRunDetailPath(runId)),
    runHistory: (runId) => getJson(deps, buildRunHistoryPath(runId)),
    runTimings: (runId) => getJson(deps, buildRunTimingsPath(runId)),
  };
}
