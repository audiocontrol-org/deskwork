# Fleet Dashboard — Design Record

- **Feature:** `design:feature/fleet-dashboard`
- **Date:** 2026-07-19 (built 2026-07-20)
- **Status:** BUILT — validation build, verified live in a browser. Not production.
- **Depends on:** `design:feature/fleet-control-plane` (036), `design:feature/instance-observability` (037) — both shipped to `main`.

## Problem / purpose

036 (fleet control plane) and 037 (instance observability) built a full sidecar → plane
telemetry pipeline and a per-instance projection, consumed today only as raw JSON + SSE over
`/v1/*`. There was no human-facing surface. This dashboard is the surface: open a screen and
watch instances appear, heartbeat, change lifecycle phase, and go stale/gone in real time —
**to validate the protean control plane end to end.** It is a validation build and will not
ship to production; the finer points of auth and productization are deliberately deferred.

## What was built (settled decisions, operator, 2026-07-19/20)

1. **Headline view:** fleet mission-control + drill-down (master-detail) — a live grid of
   instances; click a row for its detail.
2. **Serve + render:** embedded in the plane, **zero-build** (static HTML + vanilla JS/CSS, no
   bundler), same origin as the API.
3. **v1 scope:** instances-only, read-only. Runs and command issuance are later phases.
4. **Auth: deferred.** The plane injects one of its accepted bearer tokens into the served page
   so the browser can call the existing authed `/v1/*` read API. This is a crude stand-in, not
   an auth model — operator: *"we aren't going to get auth right in the design phase … this
   version will never make it to production."* Real auth (a service mesh / infra layer) is a
   later concern. No `--auth-mode`, no cookies, no new plane flags were built.

## Facts verified against the 037 code (these shaped the build)

- **`host:path` route is safe on the direct plane.** The router compiles `:id` → `([^/]+)` and
  matches the raw still-encoded `req.url`; Node does not normalize `%2F`; the handler
  `decodeURIComponent`s. Confirmed live — the detail view deep-links a slash-bearing id.
- **Instance states:** `connection ∈ {attached, disconnected}`, `liveness ∈ {live, stale,
  gone}`. The UI surfaces only these (no invented `idle`).
- **`/v1/instances` GET default** keeps `attached OR live OR stale`, drops `gone`;
  `?include=all` returns all. The stream is UNFILTERED (delivers all, including `gone`).
- **`phaseDurations` is completed-only** — a phase entered-but-not-left is absent, and
  `CurrentBearing` is `{phase, item}` with no entered-at. So the detail's phase bars show
  completed phases only; the current phase has no growing bar (no interpolation).
- The plane binds `0.0.0.0` (Node `listen(port)` with no host). Irrelevant to this validation
  build (injected token, local use); it is a reason real auth belongs to infra later, not here.

## Architecture / serving model

The dashboard ships **inside the plane**. `plane serve` mounts three UNAUTHENTICATED static
routes alongside `/v1/*`:

- `GET /` → the dashboard HTML (the server injects one plane token into an inert-JSON config
  block, plus `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`).
- `GET /dashboard/app.js`, `GET /dashboard/styles.css` → static assets served verbatim.

The three patterns ARE the allowlist: an unknown `/dashboard/*` matches no route and the plane
404s (never falls through to `/v1/*` or the HTML shell). No bundler, no `.runtime-cache`, no
CORS, no second deployable. The client is vanilla/untyped (the cost of zero-build); the server
side is strict TS.

## The two views (master-detail)

### Fleet grid (home)
Rows from the live instance state. Each row: connection/liveness dot (server states only),
`host:path`, `currentBearing` (`phase · item`, or `—`), `lastActivity` + relative time, session
counts. Sortable by liveness then recency.

- **Default view:** the active fleet (`attached OR live OR stale`), filtered client-side.
- **"Show all known instances" toggle:** reveals `gone` rows (client-side filter over the
  state already received).

### Instance detail (drill-down)
`GET /v1/instances/:id` (URL-encoded `host:path`), reached by hash routing:

- connection + liveness cards, last-heartbeat / last-activity / first-seen relative times,
  session started/ended counts.
- phase-duration bars from `phaseDurations` (completed phases only); the current phase shows
  as the bearing, no growing bar.
- a newest-first activity stream from the detail response's bounded `recentActivity`.

Visual language is functional-first; a proper `/frontend-design` pass is a later option if this
becomes a real product surface.

## Live-update model

The client makes a `fetch()` to `GET /v1/instances/stream` with the injected `Bearer` token
and reads the response body as a stream (`ReadableStream` reader) — `EventSource` can't send an
`Authorization` header, so a small inline SSE reader parses the `event: instance-delta` /
`data:` frames (and ignores `:keepalive` comments). Deltas are `instance-upserted` (full state)
or `instance-removed`; they apply by `id`. An initial `GET /v1/instances?include=all` paints
the grid fast before the stream takes over.

- **Reconnect:** on stream error the client retries with bounded exponential backoff + jitter;
  after repeated failures the status pill shows a **degraded** state while it keeps retrying.
  Status pill: connecting / live / degraded.
- **Relative-time refresh:** a low-frequency timer re-formats server timestamps ("46s ago")
  without new events; it never re-derives connection/liveness (those stay server-derived).

## Module structure

```
src/dashboard/
  assets/
    index.html   # HTML shell; `__DASHBOARD_CONFIG__` placeholder for the inert-JSON bootstrap
    app.js       # vanilla client: grid + detail + SSE reader + hash router
    styles.css
  assets.ts      # exact-match asset names → content-type; reads files relative to the module
  serve.ts       # builds the three unauthenticated routes; injects one plane token into the page
```

`src/plane/runtime.ts` appends `buildDashboardRoutes(options.acceptedTokens)` to the plane's
extra routes (unauthenticated — no `withAuth`). Nothing in shipped 036/037 auth or routing was
changed.

## Verification

Verified live in a browser (Playwright) against a plane seeded with three instances:

- grid renders live/stale states by default; **"show all"** reveals the gone instance;
- the stream connects (status → **live**) and rows update;
- drilling into a slash-bearing `host:path` deep-links correctly and shows phase bars
  (completed `specifying`; open `implementing` correctly absent) + a 5-event activity stream.

`tsc --noEmit` clean; the 135 plane/instance tests still pass (the added routes didn't disturb
036/037). No CI test was added (the `no-test-infra-in-CI` rule); the live browser check is the
acceptance evidence for a validation build.

## Deferred (if this becomes a real product surface)

- Real auth (service-mesh / infra layer) instead of the injected-token stand-in.
- Runs facet (`/v1/instances/:id/runs`, `/v1/runs/*`) and command issuance.
- Packaging test against the installed artifact; a `/frontend-design` visual pass; a formal
  server-route test; session-retain of a row that transitions to `gone` while watched;
  responsive/dual-viewport polish.
