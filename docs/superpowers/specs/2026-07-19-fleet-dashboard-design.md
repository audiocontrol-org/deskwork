# Fleet Dashboard — Design Record

- **Feature:** `design:feature/fleet-dashboard`
- **Date:** 2026-07-19
- **Status:** design (pre-spec)
- **Depends on:** `design:feature/fleet-control-plane` (036), `design:feature/instance-observability` (037) — both shipped to `main`.

## Problem / purpose

036 (fleet control plane) and 037 (instance observability) built a full sidecar → plane
telemetry pipeline and a per-instance projection, but everything is consumed today as raw
JSON + SSE over `/v1/*`. There is no human-facing surface. The immediate need is a way to
**validate what we built** — to open a screen and watch instances appear, heartbeat, change
lifecycle phase, and go idle/stale in real time, confirming the pipeline is genuinely live
and correct end to end.

This is scoped as a **real product surface**, not a throwaway harness: the fleet dashboard
stack-control ships to adopters. Validating 036/037 is its first job; it is built to last.

## Settled decisions (operator, 2026-07-19)

1. **Nature:** real product surface — full feature lifecycle (roadmap item → setup →
   `/frontend-design` mockups → spec → execute), its own branch/worktree.
2. **Headline view:** fleet mission-control + drill-down (master-detail). Home is a live grid
   of all instances; click a row to drill into that instance's detail.
3. **Serve + render:** embedded in the plane, **zero-build**. `plane serve` serves a
   self-contained dashboard (static HTML + vanilla JS/CSS, no bundler) at the same origin as
   the API. Travels with the plane; adopters get it for free.
4. **v1 scope:** instances-only, read-only. Grid + instance detail. Runs and command
   issuance are later phases.
5. **Browser auth:** server-injected token — the plane inlines one of its accepted tokens
   into the served page; the client uses it as the Bearer for `/v1/*`. Justified by the
   localhost (`127.0.0.1`) bind. Revisit if the plane is ever exposed remotely.

## Architecture / serving model

The dashboard ships **inside the plane**. `plane serve --port N --token T` gains three
read-only static routes alongside the existing `/v1/*` API, ordered ABOVE the `/v1/*` rows in
`ROUTE_TABLE`:

- `GET /` → the dashboard HTML shell (unauthenticated static; token injected).
- `GET /dashboard/app.js` → the client script.
- `GET /dashboard/styles.css` → the client styles.

No bundler, no `.runtime-cache`, no separate deploy. The client is authored as plain static
files under `src/dashboard/assets/` and served as-is. One process serves the API and the UI at
one origin — no CORS, no second deployable.

**Trade-off accepted:** the client JS is vanilla (untyped, unbundled) by design — the cost of
zero-build. The **server** side (routes, token injection, asset serving) is full strict TS. We
keep the client small so that is acceptable. Graduating to a client build (esbuild) is a
future option if the UI outgrows vanilla; it is explicitly out of scope for v1.

## The two views (master-detail)

### Fleet grid (home)
One row per instance from `GET /v1/instances`:

- connection/liveness indicator (from `connection` + `liveness`)
- `host:path` (the instance `id`)
- `currentBearing` — lifecycle phase + item (or `—` when none)
- `lastActivity` label + relative time (from `lastActivity` / `lastActivityAt`)
- session counts (`sessionsStarted` / `sessionsEnded`)

Sortable. The whole grid updates live (see live-update model). This is the "watch the fleet
light up" screen.

### Instance detail (drill-down)
Click a row → `GET /v1/instances/:id` (URL-encoded `host:path`):

- heartbeat pulse — live / idle / stale derived from `lastHeartbeatAt` + `liveness`
- phase-duration bars — from `phaseDurations` (cumulative ms per phase)
- session started/ended counts, first-seen / first-session timestamps
- a live, newest-first activity stream from `recentActivity` (≤50 events)

All read-only.

The **visual language** (exact layout, color, grid-vs-card treatment, the indicator glyphs) is
deliberately NOT pinned in this design. It is produced as `/frontend-design` mockups the
operator picks from before implementation, per `.claude/rules/design-standards.md` and the
`/frontend-design`-first discipline.

## Live-update model

The client paints initially with a plain `GET /v1/instances`, then subscribes to the existing
`GET /v1/instances/stream` (SSE) and re-renders on each event. To keep the Bearer token in a
**header** rather than the URL, the client consumes the stream via `fetch()` + a streaming
`ReadableStream` reader — NOT `EventSource`, which cannot set request headers. On stream drop,
the client reconnects with a short bounded backoff and re-fetches the snapshot to resync.

Open question for the spec: confirm `/v1/instances/stream` is consumable as a fetch-streamed
body with a Bearer header (it should be — same auth as the snapshot route). If any part of the
stream contract only supports header auth via `EventSource`-style query token, the spec records
the resolution; the design's intent is "token stays in a header."

## Auth (server-injected token)

`GET /` returns unauthenticated static HTML. The plane inlines one of its accepted tokens
(`acceptedTokens`) into the page via a placeholder swap in `index.html` (e.g. a
`window.__PLANE_TOKEN__` bootstrap value). The client uses that token as the Bearer for every
`/v1/*` request, including the streamed one.

This is justified by the localhost bind: the page is only reachable by someone already on the
machine, the same trust boundary that already holds the token. The spec records this as a
**localhost-scoped** decision to revisit (operator-paste or same-origin session cookie) if the
plane is ever bound to a non-loopback interface.

## Module structure (isolation)

- `src/dashboard/assets/{index.html, app.js, styles.css}` — the served client (static).
- `src/dashboard/serve.ts` — pure handlers: serve-html-with-token-injection, serve-asset by
  name + content-type. No plane internals leak in; input is (asset name, accepted token),
  output is an HTTP response shape.
- `src/plane/http/server.ts` — three new `GET` rows in `ROUTE_TABLE`, above `/v1/*`.
- Each file under the 500-line cap. If `app.js` approaches the cap, split by concern
  (grid render, detail render, stream client) into sibling static files, each served.

## Testing

- **Server (TS):** real `node:http` plane + real `fetch`, mirroring the existing
  `tests/instance/*` route tests. Assert: `GET /` → 200 `text/html` with the token placeholder
  resolved to a real token; `GET /dashboard/app.js` + `styles.css` served with correct
  `content-type`; `/v1/*` behavior unchanged; the FR-024 read-only-surface invariant still
  holds (every new route is `GET`).
- **Client:** a **local** Playwright smoke (NOT CI — the `no-test-infra-in-CI` rule). Boots
  `plane serve`, runs the existing `scripts/dogfood-instance-observability.sh` to populate
  telemetry, opens the dashboard, and asserts the grid shows instances AND updates live when a
  fresh event lands — real-browser verification per `.claude/rules/ui-verification.md`. Dual
  viewport only if the mockups commit to responsive breakpoints.

## Deferred to later phases (captured, not dropped)

- **Runs facet:** `GET /v1/instances/:id/runs`, `GET /v1/runs/:id` (+history/timings), a fleet
  runs list.
- **Command issuance:** the `POST /v1/runs/:id/commands` and `POST /v1/fleet/commands`
  endpoints, with confirm flows and mutation UI.
- **Remote-exposure auth hardening:** operator-paste token or same-origin session cookie, if
  the plane ever binds a non-loopback interface.
- **Client build step (esbuild):** only if the UI outgrows vanilla.

## Open questions for the spec

1. Stream consumption contract (header-auth via fetch streaming) — confirm and record.
2. Token selection when `acceptedTokens` has more than one entry — which token is injected
   (first? a dedicated dashboard token?) and how that is documented for the operator.
3. Where `plane serve` binds today (`127.0.0.1` assumed) — confirm and make the auth
   justification explicit in the spec.
4. Relative-time and liveness thresholds surfaced in the UI vs. derived server-side — reuse
   037's `liveness` derivation; the UI does not re-invent thresholds.
