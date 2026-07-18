# Contract: Instance Query API (read-only)

The plane's instance-facing HTTP surface. **Read-only** (FR-024) — no state-changing operation. Mirrors 036's fleet routes (`src/plane/http/server.ts` `ROUTE_TABLE`; handlers parallel `api.ts`, new `instance-api.ts`). Every route is individually bearer-authed (per-route `withAuth`, `runtime.ts:223`). Field shapes are defined in [data-model.md](../data-model.md) (`InstanceState`).

## Routes

| Method | Path | Handler | Returns |
|---|---|---|---|
| GET | `/v1/instances` | `instanceSnapshot` | `{ instances: InstanceState[] }` |
| GET | `/v1/instances/:id` | `instanceDetail` | `InstanceState` + `recentActivity` |
| GET | `/v1/instances/:id/runs` | `instanceRuns` | `{ runs: FleetEntry[] }` (the instance's execute/govern runs — the 036 run view, filtered) |
| GET | `/v1/instances/stream` | `instanceStream` | SSE stream of deltas |

**Route-ordering contract (RED test):** `/v1/instances/stream` MUST appear **before** `/v1/instances/:id` in `ROUTE_TABLE` — first-path-match dispatch (`server.ts:298`) and the `[^/]+` param regex would otherwise route `stream` to `instanceDetail`.

## `GET /v1/instances`

- **Query param `include`**: default (absent) → only `connection: attached` OR `liveness ∈ {live, stale}` instances (the "connected/recent" view). `?include=all` → also `disconnected`/`gone` instances still retained in the log.
- **Response**: `{ instances: InstanceState[] }`, each exactly once, keyed by `id` (`host:path`). Order: stable (first-seen), like the fleet snapshot.
- **Zero durable reads** (FR-023/SC-007): served from the in-memory instance registry only.
- **Auth**: missing/invalid bearer → `401` (reuse 036 auth). A token may read; identity is not a secret.

## `GET /v1/instances/:id`

- `:id` is the URL-encoded `host:path`.
- **Response**: the full `InstanceState` including `recentActivity` (≤ `N`, newest-first).
- **Unknown id** → `404` `{ found: false, id }` (no fabrication).

## `GET /v1/instances/:id/runs`

- **Response**: `{ runs: FleetEntry[] }` — the run registry filtered to the runs owned by this instance. `FleetEntry` is 036's existing shape (unchanged). `/v1/fleet` still serves the cross-instance run view.

## `GET /v1/instances/stream` (SSE)

- Mirrors `fleetStreamHandler` (`runtime.ts:254-290`): flush headers → emit an initial snapshot as deltas from `last = []` → guarded 15 s keepalive tick → recompute deltas on registry change → `res.once('close')` clears the timer.
- **Delta vocabulary** reuses the existing `computeFleetDeltas` terms already present in `api.ts:156`: `instance-upserted` `{ instance: InstanceState }` and `instance-removed` `{ id }`. Deltas only — never a full re-push per event.

## Cross-cutting

- **No route mutates** — the whole surface is `GET`. Any future command surface is the separate control feature.
- Response bodies are JSON; error bodies name the reason (fail-loud, never a silent empty 200).
