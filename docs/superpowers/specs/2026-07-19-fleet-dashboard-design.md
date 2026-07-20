# Fleet Dashboard — Design Record

- **Feature:** `design:feature/fleet-dashboard`
- **Date:** 2026-07-19
- **Status:** design (pre-spec) — revised after third-party review + code verification
- **Depends on:** `design:feature/fleet-control-plane` (036), `design:feature/instance-observability` (037) — both shipped to `main`.

## Problem / purpose

036 (fleet control plane) and 037 (instance observability) built a full sidecar → plane
telemetry pipeline and a per-instance projection, but everything is consumed today as raw
JSON + SSE over `/v1/*`. There is no human-facing surface. The immediate need is a way to
**validate what we built** — open a screen and watch instances appear, heartbeat, change
lifecycle phase, and go stale/gone in real time, confirming the pipeline is genuinely live and
correct end to end.

Scoped as a **real product surface**, not a throwaway harness: the fleet dashboard
stack-control ships to adopters. Validating 036/037 is its first job; it is built to last.

## Settled decisions (operator, 2026-07-19)

1. **Nature:** real product surface — full feature lifecycle (roadmap item → setup →
   `/frontend-design` mockups → spec → execute), its own branch/worktree.
2. **Headline view:** fleet mission-control + drill-down (master-detail). Home is a live grid
   of instances; click a row to drill into that instance's detail.
3. **Serve + render:** embedded in the plane, **zero-build**. `plane serve` serves a
   self-contained dashboard (static HTML + vanilla JS/CSS, no bundler) at the same origin as
   the API. Travels with the plane; adopters get it for free.
4. **v1 scope:** instances-only, read-only. Grid + instance detail. Runs and command issuance
   are later phases.
5. **Auth is OUT OF SCOPE — delegated to infrastructure.** The dashboard and plane implement
   NO browser authentication. Authn/authz is assumed to be handled by the deployment
   infrastructure (service mesh / ingress / sidecar proxy / mTLS). The dashboard client
   manages **no** credentials — no injected token, no cookie, no paste. Operator rationale:
   *"We will almost certainly get security concerns wrong; better to assume authentication is
   handled outside our purview."* (This supersedes the earlier server-injected-token idea,
   which code verification showed was unsound — see Review resolution.)

## Review resolution (third-party review, 2026-07-19)

A third-party review was verified against the 037 code before revising. Findings:

- **Bind address:** `src/subcommands/plane.ts` calls `server.listen(port, …)` with no host —
  Node binds `0.0.0.0` (all interfaces), NOT loopback. This falsified the original design's
  "localhost-only" justification for injecting a token and drove decision #5 above.
- **`host:path` as a path segment — VERIFIED SAFE for the direct plane.** The router compiles
  `:id` → `([^/]+)` and matches the raw, still-encoded `req.url`; Node does not normalize
  `%2F`, and the handler `decodeURIComponent`s. The shipped T037 test fetches
  `encodeURIComponent('host-a:/tmp/proj-a')` and passes. The proxy/tunnel mangling concern is
  real only for a *fronted* plane → captured as a forward option (opaque handle), not a v1
  blocker.
- **Instance state names — CORRECTED.** The real contract is `connection ∈ {attached,
  disconnected}` and `liveness ∈ {live, stale, gone}`. The earlier draft invented `idle`; it
  is removed. The dashboard surfaces only these server-defined states.
- **`/v1/instances` default filter — CONFIRMED.** The default keeps only `attached OR live OR
  stale` (it drops `gone`); `?include=all` returns everything. The grid design accounts for
  this (see Fleet grid).
- **`recentActivity` bound:** `RECENT_ACTIVITY_CAP = 50` is a plane-side contract constant, so
  the client renders the bounded list the API returns rather than assuming an arbitrary cap.
- Accepted in full: SSE-consumption rigor, static-serving security hardening, packaged-asset
  inclusion, expanded acceptance tests, and the narrowed module interface (below).

## Architecture / serving model

The dashboard ships **inside the plane**. `plane serve` gains three read-only static routes
alongside `/v1/*`, ordered ABOVE the `/v1/*` rows in `ROUTE_TABLE`:

- `GET /` → the dashboard HTML shell (an HTML **template** rendered by the server).
- `GET /dashboard/app.js`, `GET /dashboard/styles.css` → static JS/CSS served **verbatim**.

No bundler, no `.runtime-cache`, no separate deploy. One process serves the API and the UI at
one origin — no CORS, no second deployable. Because auth is delegated to infra (#5), the
dashboard makes plain same-origin requests with **no** credential handling of its own.

**Trade-off accepted:** the client JS is vanilla (untyped, unbundled) by design — the cost of
zero-build. The **server** side (routes, template render, asset serving) is full strict TS. We
keep the client small so that is acceptable. A client build (esbuild) is a future option, out
of scope for v1.

## The two views (master-detail)

### Fleet grid (home)
Rows from `GET /v1/instances`. Because the default drops `gone` instances, the grid:

- **Defaults to the active fleet** (`attached OR live OR stale`).
- Offers an explicit **include-disconnected** toggle → `?include=all` (surfaces `gone`).
- **Never lets a currently-displayed instance vanish mid-watch:** an instance that transitions
  to `disconnected`/`gone` while visible stays rendered (visually dimmed), because that
  transition is itself the observability signal the operator is watching for. (The default
  filter governs the *initial* set; live transitions do not silently drop rows.)

Each row: connection/liveness indicator (server states only), `host:path`, `currentBearing`
(phase + item, or `—`), `lastActivity` label + relative time, session counts. Sortable; the
whole grid updates live.

### Instance detail (drill-down)
Click a row → `GET /v1/instances/:id` (URL-encoded `host:path`):

- connection + liveness (server-defined: `attached/disconnected`, `live/stale/gone`) plus a
  `lastActivity` relative time. No invented states; "quiet but live" is a visual treatment of
  `live` + old `lastActivityAt`, not a new state.
- phase-duration bars from `phaseDurations` (cumulative ms per phase).
- session started/ended counts; first-seen / first-session timestamps.
- a live, newest-first activity stream — the API's bounded `recentActivity`
  (`RECENT_ACTIVITY_CAP = 50`).

All read-only. The **visual language** (layout, color, indicators, grid-vs-card) is produced as
`/frontend-design` mockups the operator picks from before implementation, per
`.claude/rules/design-standards.md`.

## Live-update model

With no client credential (#5), the client uses **native `EventSource`** against
`GET /v1/instances/stream` — no `Authorization` header needed, and no hand-rolled SSE parser.
Initial paint is `GET /v1/instances`; the stream keeps it live. The client:

- keeps **exactly one** active stream; cancels it on navigation / page unload.
- re-fetches the snapshot on each (re)subscribe to resync (`EventSource` auto-reconnects).
- **never lets an older snapshot/delta overwrite newer data** — render ordering respects the
  monotone sequence/`wallClock` the projection already carries (no regressions).
- surfaces a clear **error state** (not an infinite spinner) if the stream fails permanently or
  the server responds with a non-stream body.

Open question for the spec: whether an instance-level SSE delta is sufficient to update the
*selected* instance's activity stream, or the detail view must re-fetch `/v1/instances/:id` on
change. Resolve in the spec.

## Auth / security posture

Authn/authz is **out of scope**, delegated to infrastructure (#5). The dashboard performs no
credential management and assumes the caller is already authenticated by the perimeter.

**Open question the spec must reconcile:** the shipped 037 read routes currently require the
plane's bearer token, but the dashboard sends none. Under the "auth is external" stance the two
candidate resolutions are (a) the read/dashboard surface (`/v1/instances*` GET + the static
routes) is served **perimeter-trusted** — no plane-imposed browser auth — while the
machine-to-machine sidecar ingest/command paths keep their bearer; or (b) the infra layer
**injects** whatever credential the plane requires and the dashboard stays oblivious. This also
determines how **local validation** works with no mesh present. Recommendation: (a) for the
read surface, since it keeps the browser credential-free and makes local validation trivial;
the spec settles it with operator input. Either way, the dashboard code itself builds no auth.

Static-serving hygiene the spec still requires (independent of auth):

- `Cache-Control: no-store` on the HTML template; `X-Content-Type-Options: nosniff`.
- a restrictive Content-Security-Policy for the served page.
- assets served from an **explicit allowlist** (name → file + content-type map) — never an
  arbitrary filesystem path (no traversal).
- any server→page bootstrap value serialized as inert JSON
  (`<script type="application/json">`), not substituted into executable script text.

## Module structure (isolation)

```
src/dashboard/
  assets/
    index.html          # HTML template (rendered by the server)
    app.js              # vanilla client (grid + detail + EventSource)
    styles.css
  render.ts             # renders the HTML template (safe bootstrap serialization)
  assets.ts             # explicit asset allowlist: name -> { file, contentType }
```

- `src/plane/http/server.ts` — three new `GET` rows in `ROUTE_TABLE`, above `/v1/*`.
- The dashboard handler receives a **narrow** interface — `{ apiBase }` — NOT the plane's
  `acceptedTokens`. The UI-serving module knows nothing about plane credentials.
- No `auth.ts`: auth is out of scope.
- Each file under the 500-line cap; split `app.js` by concern (grid / detail / stream) if it
  approaches the cap.

## Packaging (Packaging IS UX)

Zero **client**-build does not mean zero packaging. `tsc` does not copy `src/dashboard/assets`
into `dist`. The spec must specify how the static assets reach the installed package/binary and
**test the packaged/installed artifact**, not only a source checkout — a dashboard asset 404 in
a real install is a top-priority blocker per `.claude/rules/agent-discipline.md` ("Packaging IS
UX").

## Testing

- **Server (TS, real `node:http` + `fetch`, mirroring `tests/instance/*`):** `GET /` → 200
  `text/html`; assets served with correct `content-type` from the allowlist; asset requests
  cannot traverse outside the allowlist; `/v1/*` behavior unchanged; the FR-024 read-only
  invariant still holds (every new route is `GET`); the HTML carries `Cache-Control: no-store`.
- **Packaged artifact:** the installed/distributed plane serves every dashboard asset (not just
  a source checkout).
- **Client — local Playwright smoke (NOT CI; the `no-test-infra-in-CI` rule):** boots
  `plane serve`, runs `scripts/dogfood-instance-observability.sh`, opens the dashboard, and
  asserts:
  - the grid shows instances and a real **field transition** is observed live (liveness,
    bearing, current session, or last-activity changes) — not merely "an event landed".
  - an instance transitioning to `disconnected`/`gone` **does not vanish** unexpectedly.
  - the detail route works for IDs containing slashes, colons, spaces, and Unicode.
  - stream disconnect/reconnect produces no duplicate rows or regressed state.
  - a snapshot arriving near a delta cannot overwrite newer data.
  - a permanent stream/auth failure yields an intelligible error state, not an infinite loop.
  - Dual-viewport only if the mockups commit to responsive breakpoints
    (`.claude/rules/ui-verification.md`).

## Deferred to later phases (captured, not dropped)

- **Runs facet:** `GET /v1/instances/:id/runs`, `GET /v1/runs/:id` (+history/timings), fleet
  runs list.
- **Command issuance:** `POST /v1/runs/:id/commands`, `POST /v1/fleet/commands` + confirm flows.
- **Opaque instance handle** in the API response (URL-safe routing key distinct from the
  human-readable `host:path`) — for a fronted/proxied plane where `%2F` normalization is out of
  our control. Not needed for the direct plane (verified).
- **Client build step (esbuild)** — only if the UI outgrows vanilla.

## Open questions for the spec

1. Read-route auth reconciliation under the "auth is external" stance (perimeter-trust reads
   vs. infra-injected credential) — and how local validation works with no mesh (see Auth).
2. Whether SSE deltas update the selected instance's activity stream or the detail view
   re-fetches on change.
3. Packaging mechanism for `src/dashboard/assets` into the installed artifact.
4. Relative-time / liveness thresholds are reused from 037's derivation — the UI never invents
   thresholds.
