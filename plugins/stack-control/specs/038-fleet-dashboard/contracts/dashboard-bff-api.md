# Contract: Dashboard BFF ↔ browser

The browser talks **only** to the dashboard server's own origin. The dashboard server holds the plane read credential and is the only party that calls `/v1/*`. The plane credential is **never** delivered to the browser.

## Browser-facing routes (same-origin)

- `GET /` → the dashboard UI (static assets; UI stack deferred to `/frontend-design`).
- `GET /api/instances` → current instance snapshot (proxied/adapted from plane `GET /v1/instances`; `?include=all` reveals gone/disconnected per FR-014a).
- `GET /api/instances/:id` → instance detail (from plane `GET /v1/instances/:id`).
- `GET /api/instances/:id/runs` → instance's runs (from plane `GET /v1/instances/:id/runs`).
- `GET /api/runs/:id`, `/api/runs/:id/history`, `/api/runs/:id/timings` → run detail/history/timings (from the plane's run endpoints).
- `GET /api/stream` → **same-origin SSE**: instance deltas fanned out from the single upstream `GET /v1/instances/stream` subscription (research R1). Native browser `EventSource` connects here; no bearer needed browser-side.

## Invariants (MUST)

1. No browser-facing response, script, or config ever contains the plane read credential (FR-003).
2. The browser makes **no** request to the plane origin — every data path is same-origin to the dashboard (SC-006).
3. The dashboard attaches the read credential **only** to its allowlisted upstream `/v1/*` requests (FR-025). Non-allowlisted upstream paths are not proxied.
4. The dashboard server binds **loopback by default**; a non-loopback bind is explicit and documented as requiring a fronting mesh/identity-aware proxy (FR-024).
5. The dashboard implements no human auth / session / cookie / IdP logic (FR-022); browser-facing access control is the deployment infra's responsibility (FR-023).

## Live-update behavior (FR-015, FR-016, FR-021)

- On connect to `/api/stream`, the browser first fetches `/api/instances` (snapshot), then applies deltas from the stream.
- On upstream disconnect, the dashboard surfaces a disconnected/stale signal to connected browsers; on reconnect it re-snapshots upstream and resumes fan-out (browsers re-sync).
- Deltas continue to apply under an open drawer; a drawer whose instance is upserted updates in place, and one whose instance is removed reflects "gone" rather than closing abruptly.

## Configuration (FR-005)

- `FLEET_PLANE_URL` — the plane base URL.
- `FLEET_PLANE_READ_TOKEN` — the read credential (server-side only).
- Bind address/port — loopback default; explicit opt-in for non-loopback.

## Test obligations (RED-first)

- `/api/*` responses never contain `FLEET_PLANE_READ_TOKEN`.
- With the plane unreachable, `/api/*` returns an upstream-unavailable state (not a crash) and recovers when the plane returns.
- `/api/stream` emits a snapshot-consistent delta sequence; a simulated upstream drop→reconnect produces a re-snapshot.
- Default bind is loopback; non-loopback requires the explicit opt-in.
