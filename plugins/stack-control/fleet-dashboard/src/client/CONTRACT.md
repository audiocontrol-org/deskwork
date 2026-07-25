# Dashboard BFF API Contract (Browser-Facing)

**Audience**: Browser client implementation (T017–T020). This document describes what the dashboard BFF serves on the same origin — the data contract that the browser consumes.

**Source of Truth**: [`plugins/stack-control/specs/038-fleet-dashboard/contracts/dashboard-bff-api.md`](../../specs/038-fleet-dashboard/contracts/dashboard-bff-api.md) (authoritative BFF<–>browser boundary).

**Scope**: Phase 4 (US2 — Live Fleet Table) endpoints and behavior. Phase 5 (US3 — Drill-in Drawer) extends with detail/runs endpoints.

## Same-Origin Principle (FR-003)

The browser MUST talk ONLY to the dashboard server's own origin. The plane read credential is held server-side only and is NEVER delivered to, or observable by, browser code. Every data request is same-origin; there is no cross-origin call to the plane.

## Read Endpoints — Instance Snapshot

### `GET /api/instances` — Current fleet snapshot

**What it returns**: An array of current `FleetInstance` objects. The home table's primary data source.

**Query parameters**:
- `?include=all` (optional) — by default, returns only connected/live/stale instances; with `?include=all`, also includes gone/disconnected instances (marked as such per FR-014a).

**Response shape** (each instance in the array):
```
{
  "id": "host:path",                    // unique identity (host:path format)
  "connection": "attached" | …,         // connection state
  "liveness": "live" | "stale" | "gone",// liveness (see below)
  "recentActivity": [/* ...events... */], // array of recent events (see below)
  // ... additional InstanceState fields from the plane
}
```

**Connection values** (plane values passed through):
- `"attached"` — instance is actively connected to the plane.
- Other values carry plane-defined meanings; the client treats unknown values as a valid state and renders them.

**Liveness values** (plane values passed through):
- `"live"` — instance is connected and reporting recent activity.
- `"stale"` — instance is connected but activity is old (threshold defined by plane).
- `"gone"` — instance has disconnected and has not re-connected within a timeout.
- Other values: treat as valid but render with appropriate fallback label.

**recentActivity field**:
- An array of event objects representing the instance's recent history (exact event shape is plane-defined; the client renders each event's type/timestamp and defers deep event inspection to drill-in).
- May be empty if the instance is newly enrolled.

**Default-membership rule (FR-014a)**:
- Without `?include=all`, the snapshot returns **only** instances where `connection === "attached"` OR `liveness === "live"` OR `liveness === "stale"`.
- Gone/disconnected instances are **excluded by default** — they appear only when the client explicitly requests `?include=all`.
- This filtering happens server-side; the client does not re-filter the snapshot.

**Error handling**:
- If the plane is unreachable or the read credential is invalid, the server responds with an appropriate HTTP error (e.g., 503 for upstream unavailable, 401/403 for credential issues). The client surfaces this state to the user (see "Connection Resilience" below).

---

## Live-Update Stream — Same-Origin Server-Sent Events

### `GET /api/stream` — Real-time fleet delta stream

**What it is**: A Server-Sent Events (SSE) stream from the dashboard server, relaying fleet deltas from the upstream plane stream. Native browser `EventSource` API connects here; no bearer token is needed browser-side.

**Connection workflow**:
1. Browser opens the stream: `new EventSource('/api/stream')`
2. Browser fetches `/api/instances` snapshot (with appropriate `?include=all` query if the user has revealed gone/disconnected instances)
3. Browser applies incoming delta events to the in-memory instance map
4. On stream drop, browser stops applying deltas and surfaces a disconnected indicator (see "Connection Resilience")
5. On stream resume, browser re-fetches `/api/instances` snapshot (to sync any instances that changed while disconnected) and resumes applying deltas

**Delta event types**:

#### `event: instance-upserted`
Sent when an instance is created or updated on the plane.

```
event: instance-upserted
data: {
  "id": "host:path",
  "connection": "attached" | …,
  "liveness": "live" | "stale" | "gone",
  "recentActivity": [/* ... */],
  // ... full InstanceState from plane
}
```

**Client behavior**:
- Upsert the instance into the in-memory map (create if absent, update if present).
- If the instance is displayed in the current table view, update the row in place (no full-table reload).
- If the instance was previously hidden due to default-membership filtering and the upsert changes it to "shown" (e.g., a gone instance reconnects to "live"), update visibility as needed.
- If an instance drawer is open for this instance, apply the update to the drawer's display in place (do not close the drawer).

#### `event: instance-removed`
Sent when an instance is removed (or marked as gone and falls out of default visibility).

```
event: instance-removed
data: {
  "id": "host:path"
}
```

**Client behavior**:
- Remove the instance from the in-memory map.
- If the instance is displayed in the current table, remove the row in place.
- If an instance drawer is open for the removed instance, the drawer MUST reflect this state rather than showing stale data or closing abruptly. Options include:
  - Display a "This instance is no longer available" message while keeping the drawer open (allowing the operator to review state before closing).
  - Automatically close the drawer with a brief notification.
  - Keep the last-known state but mark it as stale/archived.
  The exact UX is deferred to `/frontend-design` (FR-030); the contract requires that the operator is not surprised (no silent stale data, no jarring auto-close without notice).

**Delta consistency**:
- Deltas are applied in order as they arrive.
- A sequence of deltas is snapshot-consistent: if a client applies all deltas from stream start, it converges to the plane's current state.
- The stream is **not** a changelog of every transient state (e.g., if an instance transitions `live` → `stale` → `live` in rapid succession, the stream may emit only one `instance-upserted` delta with the final state). The client treats each delta as the authoritative current state, not as a transition event.

---

## Connection Resilience (FR-016)

### Stream disconnect and reconnect

**On disconnect**:
- The browser detects that the SSE stream has closed (via `EventSource.onerror`).
- The dashboard immediately stops relaying new deltas.
- The browser surfaces a **disconnected/stale indicator** to the user (exact visual rendering deferred to `/frontend-design`; the contract requires that the user is aware the live view is no longer live).

**On reconnect**:
- The browser reopens the SSE stream (`new EventSource('/api/stream')`).
- The browser re-fetches `/api/instances` snapshot (respecting any `?include=all` parameter from before the disconnect).
- The browser applies the snapshot to its in-memory map, overwriting any stale state accumulated during the outage.
- The browser resumes applying incoming deltas from the stream.
- The disconnected indicator is cleared and the user sees a live view again.

**No operator action required**: Reconnection is automatic; the browser does not ask the user to "refresh" or "retry."

**Edge case — instance changed while disconnected**:
- If an instance was updated on the plane during the outage, the re-snapshot picks up the current state.
- If an instance was removed during the outage, the re-snapshot reflects its absence; any drawer open for that instance updates per "instance-removed" behavior above.
- If an instance drawer is open during the outage, applying the re-snapshot may update the drawer's displayed state.

---

## Drill-In Endpoints (Phase 5, US3)

These endpoints are scoped to Phase 5 and are listed for completeness:

### `GET /api/instances/:id` — Instance detail

**What it returns**: Full `InstanceState` for a single instance (instance detail drawer source).

### `GET /api/instances/:id/runs` — Instance's runs

**What it returns**: Array of runs owned by the instance (drill-in surface).

### `GET /api/runs/:id`, `GET /api/runs/:id/history`, `GET /api/runs/:id/timings`

**What they return**: Run detail, history records, and phase timings (deep drill into a single run).

**Note**: There is **no** instance-level history/timings endpoint. An instance's "history" is its `recentActivity` field + its owned runs; the dashboard does not aggregate an instance-level timeline beyond those two surfaces.

---

## Default-Membership Rule (FR-014a) — Detailed Behavior

The default-membership rule applies to `/api/instances` and to delta filtering:

**Snapshot (`GET /api/instances`)**:
- Default (no `?include=all`): returns instances where `(connection === "attached" OR liveness === "live" OR liveness === "stale")`.
- With `?include=all`: returns all instances, including gone/disconnected.

**Deltas (instance-upserted)**:
- If an instance upserts into the shown set (e.g., a new instance with `connection="attached"` enrolls), a delta is emitted so the client displays it.
- If an instance upserts but remains in the hidden set (e.g., a gone instance becomes stale but not "live"), a delta **may or may not** be emitted — server behavior is implementation-dependent. The client MUST re-snapshot to sync if the user toggles the reveal control; it MUST NOT rely on deltas to be exhaustive for instances outside the current view.

**Reveal control** (client-side):
- The browser provides an explicit toggle/filter that switches between default view and `?include=all` view.
- When toggled, the browser re-fetches `/api/instances` with the appropriate query parameter and re-renders the table.
- Instances newly visible are rendered in a distinct visual state (e.g., dimmed or labeled "disconnected" / "gone") per the design spec.

---

## Response Format & Headers

**Content-Type**:
- `/api/instances`: `application/json`
- `/api/stream`: `text/event-stream` (SSE)

**CORS**:
- Not applicable; all requests are same-origin.

**Status codes**:
- `200` — success.
- `400` — malformed request (e.g., invalid query parameter).
- `401` / `403` — credential invalid or access denied (server configuration issue; see FR-005).
- `503` — upstream plane unreachable or temporarily unavailable; server returns this while waiting for recovery. The client MAY display a transient "Plane unavailable" indicator and retry (implementation detail).

---

## Security Invariants (FR-003, FR-025)

1. **Credential is never in the response**: No browser-facing response, HTML, JavaScript, or config ever contains the plane read token. The token is held and used server-side only.
2. **No cross-origin calls**: Browser makes no request to the plane origin or any non-same-origin host.
3. **Same-origin flow**: All data arrives from `https://dashboard-host:port/api/*`, matching the browser's own origin.
4. **Loopback default**: The dashboard server binds to loopback (127.0.0.1) by default, preventing untrusted clients from reaching it directly. Non-loopback binds require explicit opt-in and deployment infrastructure (service mesh / identity-aware proxy) providing per-connection identity and authorization (FR-024, FR-023).

---

## UI Implementation Deferred (FR-030)

This contract fixes the **data boundary and behavioral semantics** that the browser consumes. The visual and interaction design — framework choice, layout, styling, drag-drop, drill-in affordances, etc. — is **out of scope for this contract** and MUST be settled by a `/frontend-design` pass before implementation. The design pass will produce mockups and a design spec; implementation will follow from that spec in a separate task.

---

## Testing Obligations (Contract Verification)

- **Snapshot consistency**: with the plane holding N instances matching the default-membership rule, `/api/instances` returns exactly those N instances; `/api/instances?include=all` returns all instances including gone/disconnected.
- **Delta sequence**: starting from a known snapshot, applying all deltas in sequence converges to the plane's current state.
- **Upstream drop/reconnect**: when the plane becomes unreachable, the server stops relaying deltas; on recovery, the server re-fetches and resumes. Browsers observing this event see the disconnected indicator and auto-reconnect.
- **Credential isolation**: no test response contains the plane read token; the token never appears in browser-visible state.
- **Live update latency**: an instance state change on the plane is reflected in connected browsers' streams within a few seconds (exact SLA is implementation-dependent; this contract requires it is fast enough for situational awareness).

