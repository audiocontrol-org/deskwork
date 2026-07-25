# Phase 1 Data Model: Fleet Dashboard

The dashboard is read-only and stateless; it **projects** the plane's existing shapes, it does not own new persistent entities. The one genuinely new modeled thing is the plane-side **read credential class**. Entities below are the shapes the BFF consumes and the browser renders (all sourced from existing plane endpoints — no new plane projection).

## Consumed entities (existing plane shapes — reused, not redefined)

### FleetInstance
- **Source**: `GET /v1/instances`, `GET /v1/instances/:id` (`InstanceState`).
- **Identity**: `id` = `host:path` (unique per instance).
- **Fields (as consumed)**: `id`; `connection` (`attached` | …); `liveness` (`live` | `stale` | `gone` | …); `recentActivity` (recent events); plus whatever `InstanceState` carries. The dashboard treats these as read-only.
- **Default membership rule (FR-014a)**: the home table shows instances that are connected OR live/stale by default; `gone`/disconnected are shown only when the operator reveals them (mirrors the plane's `instanceSnapshot` default vs `?include=all`).

### Run
- **Source**: `GET /v1/instances/:id/runs` (owned-runs facet, `FleetEntry[]`), `GET /v1/runs/:id`, `GET /v1/runs/:id/history`, `GET /v1/runs/:id/timings`.
- **Identity**: `runId` (unique).
- **Ownership**: a run is owned by the instance whose events carry that run's `host:path`.
- **Fields (as consumed)**: `runId`; phase/status; history records; phase timings. Read-only.
- **Note**: there is **no** instance-level history/timings endpoint — an instance's "history" is `recentActivity` + its owned runs.

### FleetDelta
- **Source**: `GET /v1/instances/stream` (SSE).
- **Kinds (consumed)**: `instance-upserted` (carries full `InstanceState`), `instance-removed` (carries `id`).
- **Use**: applied to the in-memory instance map to keep the table current without full re-push.

## New modeled entity

### ReadCredential (plane-side, new credential class)
- **What it represents**: an opaque, configured credential of the **consumer/read** class — distinct from a telemetry token — that authorizes read access to the consumer read routes.
- **Fields**: the opaque credential value; (optionally) an identifier/label for the reader. Independently revocable.
- **Class invariant (FR-007..009)**:
  - A `ReadCredential` MUST be **accepted** only on consumer read routes.
  - A `ReadCredential` MUST be **refused** on ingest / sidecar / liveness routes.
  - A telemetry token MUST be **refused** on consumer read routes.
- **Lifecycle (FR-011, static-minimal)**: supplied via configuration/environment; effective at startup and via the plane's existing live-reload path; independently revocable (revoking one reader does not affect others or telemetry credentials). No mint/list/revoke verbs in this feature.
- **Relationship to existing types**: parallels the telemetry-token/installation binding but is a **separate verification path** (research R3); the two credential sets never share a verification result.

## Dashboard-server transient state (not persisted)

### FleetView (in-memory, per dashboard-server process)
- The current instance map (id → `InstanceState`), seeded by a snapshot and updated by applying `FleetDelta`s.
- Connection status to the upstream stream (connected / disconnected) — drives the browser's live/stale/disconnected indicator (FR-016).
- No durability: on restart the server re-snapshots.
