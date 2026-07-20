# Fleet Dashboard — Design Record

- **Feature:** `design:feature/fleet-dashboard`
- **Date:** 2026-07-19
- **Status:** design (pre-spec) — revised twice after third-party review + code verification
- **Depends on:** `design:feature/fleet-control-plane` (036), `design:feature/instance-observability` (037) — both shipped to `main`.

## Problem / purpose

036 (fleet control plane) and 037 (instance observability) built a full sidecar → plane
telemetry pipeline and a per-instance projection, consumed today only as raw JSON + SSE over
`/v1/*`. There is no human-facing surface. The immediate need: open a screen and watch
instances appear, heartbeat, change lifecycle phase, and go stale/gone in real time —
validating the pipeline end to end.

Scoped as a **real product surface**, not a throwaway harness. Validating 036/037 is its first
job; it is built to last.

## Settled decisions (operator, 2026-07-19)

1. **Nature:** real product surface — full feature lifecycle, its own branch/worktree.
2. **Headline view:** fleet mission-control + drill-down (master-detail).
3. **Serve + render:** embedded in the plane, **zero-build** (static HTML + vanilla JS/CSS, no
   bundler), same origin as the API.
4. **v1 scope:** instances-only, read-only. Runs and command issuance are later phases.
5. **Auth is delegated to infrastructure.** The dashboard implements NO browser authentication
   and owns NO credentials. Operator rationale: *"We will almost certainly get security
   concerns wrong; better to assume authentication is handled outside our purview."* The plane
   participates in that delegation through an explicit serving mode (§ Auth / serving mode),
   NOT by making its API unconditionally public.

## Review resolution (two review rounds, verified against 037 code)

- **Bind address:** `plane serve` calls `server.listen(port, …)` with no host → Node binds
  `0.0.0.0`. This drove the explicit serving-mode contract below (a "documented assumption" of
  localhost does not by itself create a perimeter).
- **`host:path` route — VERIFIED SAFE (direct plane).** Router compiles `:id` → `([^/]+)`,
  matches the raw still-encoded `req.url`; Node does not normalize `%2F`; handler
  `decodeURIComponent`s. Shipped T037 fetches an encoded-slash id and passes. Opaque handle is
  a fronted-plane forward option, not a v1 blocker.
- **Instance states — CORRECTED to the real contract:** `connection ∈ {attached,
  disconnected}`, `liveness ∈ {live, stale, gone}`. `idle` was invented and is removed.
- **`/v1/instances` GET default filter — CONFIRMED:** keeps `attached OR live OR stale`, drops
  `gone`; `?include=all` returns all. (But the **stream** is unfiltered — see below.)
- **Stream emits gone transitions — VERIFIED:** the SSE stream folds the FULL registry
  (`buildInstanceRegistry(...).instances()`, unfiltered) and diffs it, so a `→ gone` transition
  is delivered as an `instance-upserted` delta with full state. The registry is append-only
  over the event log, so `instance-removed` effectively never fires. The dashboard's "retain +
  dim gone rows" is therefore natural, not a special case.
- **Merge revision — VERIFIED not needed for v1:** InstanceState deliberately does NOT surface
  the internal no-regress `*Sequence` marks. It doesn't have to: the server never regresses an
  instance's state, deltas are ordered on a single stream, and every (re)connect re-delivers
  full state (the server resets its per-connection `previous` to `[]`). The client applies
  upserts in arrival order — see Live-update.
- **`phaseDurations` — VERIFIED completed-only:** a phase entered-but-not-left is ABSENT (never
  `0`); `CurrentBearing` is `{phase, item}` with NO entered-at timestamp. So there is no
  server-provided basis for a growing current-phase bar; the UI does not interpolate.
- Accepted: static-serving hardening, packaging-as-product, expanded browser tests, narrowed
  module interface, connected/reconnecting/degraded stream states, hash-routing navigation,
  client-timer relative time.

## Architecture / serving model

The dashboard ships **inside the plane**. `plane serve` gains three read-only routes above the
`/v1/*` rows in `ROUTE_TABLE`:

- `GET /` → the dashboard HTML **template** (rendered by the server).
- `GET /dashboard/app.js`, `GET /dashboard/styles.css` → static assets served **verbatim** from
  an explicit allowlist.

No bundler, no `.runtime-cache`, no CORS, no second deployable. The client makes plain
same-origin requests with no credential handling (§ Auth). **Trade-off accepted:** vanilla,
untyped, unbundled client (the cost of zero-build); the server side is full strict TS; we keep
the client small. A client build (esbuild) is a future option, out of scope for v1.

## Auth / serving mode (SETTLED — flags below touch 036's `plane serve`)

Authn/authz is delegated to infrastructure (decision #5). To make that delegation *safe*
rather than a naked public API, the plane gains an explicit mode:

```
plane serve --auth-mode=external [--bind <addr>]
```

Under `--auth-mode=external`:

- the dashboard static routes AND the browser-facing instance **read** routes (`/v1/instances*`
  GET) require **no** plane bearer — the deployment's authenticating layer (mesh / ingress /
  proxy / mTLS) owns access control;
- the **machine-to-machine** routes (sidecar ingest, and future command/mutation routes) retain
  their existing plane-native bearer credentials — unchanged from 036/037;
- the mode carries a **listener-exposure contract**: the plane listener MUST be unreachable
  except through the authenticating layer — either bound to a loopback/proxy-only address, or
  the deployment guarantees non-bypass. **Direct all-interface exposure in external mode is
  unsupported.**
- `--bind <addr>` sets the listen host (default today is all-interfaces via `listen(port)`).
  For **local dogfood/validation** run `--auth-mode=external --bind 127.0.0.1` — a real
  boundary (only reachable on the machine), not an all-interface listener with an open API.

The default mode (no `--auth-mode`) is unchanged — the existing bearer-everywhere behavior, so
036/037 in-place behavior is untouched unless the operator opts into external mode.

> **Operator confirmation wanted on THIS item:** it introduces `--auth-mode` / `--bind` to
> `plane serve` and conditionally relaxes read-route auth — a small, deliberate change to shipped
> 036 serve behavior. It is the concrete, safe form of decision #5; flagging it because it is the
> one item that reaches back into a shipped feature.

Static-serving hygiene the spec requires regardless of mode:
`Cache-Control: no-store` on the HTML; `X-Content-Type-Options: nosniff`; a restrictive CSP;
assets served ONLY from an exact-match allowlist (unknown `/dashboard/*` → 404, never falling
through to API routing or the HTML shell); any server→page bootstrap value serialized as inert
JSON, never substituted into script text.

## The two views (master-detail)

### Fleet grid (home)
The grid sources its state from the **stream** (which delivers ALL instances, including gone),
and applies the active/all view filter **client-side**:

- **Default view:** the active fleet (`attached OR live OR stale`) — filtered client-side.
- **"Show all known instances" toggle:** reveals `gone`/historical rows (client-side filter
  over already-received stream state; label finalized at mockup phase).
- **Gone rows never vanish mid-watch:** because the stream keeps delivering them as upserts and
  the registry never removes an instance, a row that transitions to `gone` while observed stays
  rendered (dimmed) for the session — the transition is the signal. Enabling "show all" makes
  the full set authoritative.

Each row: connection/liveness indicator (server states only), `host:path`, `currentBearing`
(`phase · item`, or `—`), `lastActivity` label + relative time, session counts. Sortable; live.

### Instance detail (drill-down)
`GET /v1/instances/:id` (URL-encoded `host:path`):

- connection + liveness (server-defined only) + a `lastActivity` relative time. "Quiet but
  live" is a visual treatment of `live` + old `lastActivityAt`, not a new state.
- **phase-duration bars from `phaseDurations` — completed phases only, static between events.**
  The current open phase is shown via `currentBearing` (`current: phase · item`) with **no
  growing bar** (no server-surfaced entered-at → no interpolation).
- session started/ended counts; first-seen / first-session timestamps.
- a live newest-first activity stream — the API's bounded `recentActivity`
  (`RECENT_ACTIVITY_CAP = 50`).

All read-only. Visual language → `/frontend-design` mockups the operator picks from, per
`.claude/rules/design-standards.md`.

## Live-update model (stream-authoritative)

With no client credential, the client uses **native `EventSource`** on
`GET /v1/instances/stream` — no headers, no hand-rolled SSE parser. The model:

1. Create **exactly one** `EventSource`; cancel it on navigation / page unload.
2. On connect (and every browser auto-reconnect `open`), the server's first tick re-delivers
   **full current state** as `instance-upserted` deltas (server resets per-connection
   `previous` to `[]`) — so the stream **self-resyncs** on reconnect; no separate snapshot fetch
   or revision cursor is required.
3. Apply `instance-upserted` in arrival order (server never regresses an instance); an
   `instance-removed` (rare — append-only registry) drops the row.
4. `GET /v1/instances` is used only as an OPTIONAL fast first-paint before the first stream
   tick; the stream is authoritative thereafter.

**Stream health states — connected / reconnecting / degraded.** `EventSource` auto-reconnects
and does not expose HTTP status/body to JS, so the client does NOT try to diagnose *why* a
stream failed. It shows a visible **degraded** banner ("Live updates unavailable — data may be
stale") after repeated failures while **continuing** automatic reconnection at the browser's
cadence; last-known data stays visible; a manual retry is offered. The client does not stop
reconnecting (a transient proxy/plane restart should self-heal).

Client-side **relative-time refresh:** a low-frequency timer re-formats server-provided
timestamps against the current clock (so "12s ago" stays honest without new events).
Connection and liveness values remain **exclusively** server-derived — the timer only
re-formats, never re-derives state.

## Navigation

Detail views are **deep-linkable and reload-safe** via **hash routing**
(`/#/instances/<url-encoded host:path>`) — no server catch-all/shell fallback route needed
(the hash never reaches the server), which keeps the zero-build serving model intact. `/` with
no hash is the grid.

## Module structure (isolation)

```
src/dashboard/
  assets/
    index.html          # HTML template (server-rendered; inert-JSON bootstrap only)
    app.js              # vanilla client (grid + detail + EventSource + hash router)
    styles.css
  render.ts             # renders the HTML template
  assets.ts             # exact-match allowlist: pattern -> { file, contentType }
```

- `src/plane/http/server.ts` — three new `GET` rows in `ROUTE_TABLE`, above `/v1/*`.
- The dashboard handler receives a **narrow** interface — `{ apiBase }` — NOT `acceptedTokens`.
  No `auth.ts`: auth is out of scope; the serving-mode gate lives in the plane's existing route
  middleware, not the dashboard module.
- Unknown `/dashboard/*` → 404 (never fall through to API or HTML shell).
- Each file under the 500-line cap; split `app.js` by concern (grid / detail / stream / router)
  if it approaches the cap.

## Packaging (Packaging IS UX)

Zero **client**-build ≠ zero packaging. `tsc` does not copy `src/dashboard/assets` into `dist`.
The spec must specify how the assets reach the installed package/binary and **test the
packaged/installed artifact**, not only a source checkout — a dashboard asset 404 in a real
install is a top-priority blocker (`.claude/rules/agent-discipline.md`, "Packaging IS UX").

## Testing

- **Server (real `node:http` + `fetch`, mirroring `tests/instance/*`):** `GET /` → 200
  `text/html` with `Cache-Control: no-store`; assets served with correct `content-type` from
  the allowlist; unknown `/dashboard/*` → 404 (no fall-through); `/v1/*` behavior unchanged in
  default mode; FR-024 read-only invariant holds (every new route is `GET`).
- **Serving mode:** in `--auth-mode=external`, read/dashboard routes serve without a bearer AND
  the supported configuration is proven to require a non-bypassable listener (e.g.
  `--bind 127.0.0.1` reachable only locally); machine ingest/command routes still require their
  bearer.
- **Stream contract (not just UI):** a `→ gone` transition is delivered on the stream as a
  full-state upsert (verify the server semantics directly).
- **Packaged artifact:** the installed/distributed plane serves every dashboard asset.
- **Client — local Playwright smoke (NOT CI; `no-test-infra-in-CI`):** boots `plane serve`,
  runs `scripts/dogfood-instance-observability.sh`, opens the dashboard, and asserts:
  - the grid shows instances and a real **field transition** is observed live (liveness /
    bearing / current session / last-activity) — not merely "an event landed".
  - an instance transitioning to `disconnected`/`gone` does NOT vanish unexpectedly.
  - the detail route works for IDs with slashes, colons, spaces, Unicode.
  - a **reload / direct deep-link** into instance detail restores that view (hash routing).
  - stream disconnect/reconnect produces no duplicate rows or regressed state (full re-send on
    reconnect is idempotent).
  - a persistent stream failure yields a visible **degraded** banner (not a status diagnosis)
    while reconnection continues; last-known data stays visible.
  - dual-viewport only if the mockups commit to responsive breakpoints
    (`.claude/rules/ui-verification.md`).

## Deferred to later phases (captured, not dropped)

- **Runs facet:** `/v1/instances/:id/runs`, `/v1/runs/:id` (+history/timings), fleet runs list.
- **Command issuance:** `POST /v1/runs/:id/commands`, `POST /v1/fleet/commands` + confirm flows.
- **Opaque instance handle** (URL-safe routing key distinct from `host:path`) — for a
  fronted/proxied plane where `%2F` normalization is out of our control. Not needed for the
  direct plane (verified).
- **Client build step (esbuild)** — only if the UI outgrows vanilla.

## Open questions for the spec

1. Final wording of the "show all known instances" toggle (mockup phase).
2. Exact packaging mechanism for `src/dashboard/assets` into the installed artifact.

(The prior draft's larger open questions — auth trust mode, merge revision, stream gone
semantics, phase-duration semantics, navigation model, relative-time responsibility — are now
SETTLED above, most by code verification.)
