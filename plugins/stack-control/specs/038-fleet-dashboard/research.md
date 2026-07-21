# Phase 0 Research: Fleet Dashboard

Resolves the open questions carried from the design record into plan-level decisions. Each: Decision / Rationale / Alternatives considered.

## R1 — BFF ↔ plane live-stream relay shape

- **Decision**: The dashboard server holds **one upstream SSE subscription** to `GET /v1/instances/stream` (authenticated with the read credential) and **fans out** to all connected browser clients over a same-origin SSE endpoint. Each new browser first gets a fresh snapshot (`GET /v1/instances`), then joins the fan-out.
- **Rationale**: Small fleet + few dashboard viewers; one upstream stream is cheaper on the plane than one upstream subscription per browser tab, and it keeps the read credential's usage minimal and server-side. Snapshot-then-deltas matches the plane's own contract (C2) and gives each browser a correct initial state.
- **Alternatives considered**: One upstream stream **per browser connection** (simplest to reason about, but multiplies plane load and credential usage by viewer count — rejected for a shared ops window). A polling fallback (rejected — the plane already offers deltas; polling is strictly worse and violates the delta-not-full-push contract).

## R2 — Credential config format + reload path

- **Decision**: The plane accepts read credentials as **configured, installation-anchored** values (environment-backed secret material and/or the plane's existing config surface), consumed at startup and via the plane's **existing live-reload path** (the same mechanism that already picks up enrollment/revocation changes — `refreshBeforeAuth` in `runtime.ts`). No new reload machinery. The dashboard reads its own copy from `FLEET_PLANE_READ_TOKEN` (+ `FLEET_PLANE_URL`).
- **Rationale**: Static-minimal (FR-011) — reuse the reload seam the plane already has rather than inventing one; keeps the change bounded and consistent with how telemetry credentials already refresh.
- **Alternatives considered**: A dedicated mint/list/revoke CLI + persisted store like telemetry tokens (richer lifecycle, but out of scope for this feature per FR-011 — a later managed-credential system can replace the *source* without changing the credential class). Restart-only reload (rejected — the plane already supports live reload; restart-only would be a regression in operability).

## R3 — Read-credential-class implementation (storage-agnostic invariant)

- **Decision**: Introduce a **separate reader-credential verification path** on the plane, distinct from the telemetry `TokenRegistry`. The consumer read routes (`fleetSnapshot`, `fleetStream`, `runDetail`, `runHistory`, `runTimings`, and the instance read routes) are re-wired behind a **reader guard** that verifies against the reader credential set; ingest/sidecar/liveness routes stay on the telemetry registry. The two never share a verification result.
- **Rationale**: The load-bearing property is the **behavioral invariant** (FR-007..009): a reader credential is refused on ingest routes and a telemetry credential is refused on read routes. A distinct verification path per route-class is the clearest way to make that invariant structural (and testable) without a `kind`-tagged shared registry whose single generic result is exactly how a reader could leak onto an ingest route.
- **Alternatives considered**: A unified registry with a `kind` field + per-route required-kind check (less code, but re-entangles the two identities in one verification surface — rejected; it is the design record's rejected Axis-5 alternative). Reusing the telemetry registry for reads (the status quo and the root defect — rejected).

## R4 — Browser-facing access control (zero trust)

- **Decision**: The dashboard implements **no** human authentication. Browser-facing access control is delegated to deployment infrastructure (service mesh / identity-aware proxy) enforcing per-connection identity + authorization. The dashboard server binds **loopback by default**; a non-loopback bind requires an explicit opt-in flag/config and is documented as requiring a fronting mesh.
- **Rationale**: Operator posture (design decision 13): build as little novel security code as possible; delegate to a mature mesh; zero trust, not perimeter. The loopback-default bind is a fail-closed default so the server is never accidentally exposed as an unauthenticated listener.
- **Alternatives considered**: Any in-app auth (login/OAuth/OIDC/session) — rejected per the posture. Binding to all interfaces by default — rejected (fail-open).

## R5 — Dashboard source home

- **Decision**: A new subtree **`plugins/stack-control/fleet-dashboard/`**, inside the stack-control tree, sharing stack-control's `tsx` + `vitest` tooling. Nothing added to the deskwork root `workspaces` array.
- **Rationale**: **All stack-control source must stay under `plugins/stack-control/` because stack-control will be moved out of the deskwork repository into its own dedicated repository** (operator, 2026-07-21). Placing the dashboard in the deskwork-owned `packages/` would strand it at spin-out. The load-bearing property is out-of-*process* (own process, own credential, HTTP-only coupling), not out-of-*package*.
- **Alternatives considered**: `packages/fleet-dashboard` as a root workspace package (stranded at spin-out — rejected). A `plugins/fleet-dashboard` entry (the `plugins/*` glob is for Claude Code plugins; an app there is semantically wrong, and it would also not travel with stack-control — rejected). A separate repository now (deferred per the design record; the spin-out is a whole-stack-control move, not a per-app one).

## R6 — Browser UI framework/build

- **Decision**: **Deferred** to a pre-implementation `/frontend-design` pass (FR-030). Not resolved in this plan.
- **Rationale**: The spec fixes surface scope and nonvisual interaction contracts; the visual/stack is a separate design decision that precedes UI implementation. Deferring here is faithful to FR-030, not a scope cut.
- **Alternatives considered**: Pinning a framework now (premature — pre-empts the `/frontend-design` pass).

## Deferred / out of scope (recorded, not resolved here)

- Multi-plane targeting (single-plane default; would live in the BFF later).
- Package distribution shape (with the plugin vs standalone artifact; container image).
- Removal task-sequencing specifics (the cutover *rule* is fixed; ordering is a tasks.md detail).
