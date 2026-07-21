# Implementation Plan: Fleet Dashboard

**Branch**: `feature/fleet-control-plane` (program long-lived branch; spec dir `specs/038-fleet-dashboard` is authoritative) | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/038-fleet-dashboard/spec.md`; approved design record `docs/superpowers/specs/2026-07-21-fleet-dashboard-design.md`.

## Summary

Build a standalone, out-of-process fleet dashboard: a thin backend-for-frontend (BFF) server plus a browser UI. The BFF holds one configured plane **read credential** and is the only party that calls the plane's `/v1/*` read API; the browser talks only to the dashboard's own origin. The home surface is an instance-rooted live table (connected/recent by default, with an explicit reveal for gone/disconnected), updating in place off the existing instance delta stream; a per-instance drawer drills into state, recent activity, runs, and (via a run) run history/timings. The plane gains a read-credential **class** distinct from telemetry tokens, so read access is no longer coupled to sidecar identity. The rejected in-process build (`src/dashboard/`) is removed once the standalone passes acceptance against a released plane. Visual/stack for the browser UI is deferred to a pre-implementation `/frontend-design` pass (FR-030).

## Technical Context

**Language/Version**: TypeScript on Node ≥20 (repo standard), run via `tsx`.

**Primary Dependencies**: Server side — Node built-ins where possible: `node:http` server (mirrors the plane's `src/plane/http/server.ts`), Node `fetch` for upstream `/v1/*` reads, and an upstream SSE consumer for `/v1/instances/stream`. No web framework. Browser side — **DEFERRED to `/frontend-design`** (FR-030); the plan does not pin a UI framework.

**Storage**: Dashboard — none (stateless read-through; holds only the in-memory current snapshot to diff/apply deltas). Plane — the read credential(s) are configured state anchored inside the installation (Constitution: installation-anchor invariant); no new durable store beyond what the credential-class implementation needs.

**Testing**: `vitest` (repo standard), Test-First (Constitution I). API-boundary tests for the credential-class invariant; BFF contract tests against a fixture/stub plane; an end-to-end acceptance path against a released plane for cutover (FR-026).

**Target Platform**: Node process serving HTTP, bound to loopback by default; runnable on a host separate from the plane.

**Project Type**: Web service (BFF) + browser client (client stack deferred). Read-only.

**Performance Goals**: Live instance state change reflected in the table within a few seconds (SC-003); no numeric SLA specified (avoid false precision). Delta-driven updates, never full re-push (reuses the plane's existing bounded delta contract).

**Constraints**: Loopback-default bind; a non-loopback bind is explicit and mesh-fronted (FR-024). The plane read credential never reaches browser code (FR-003). No new plane read projection for the scoped surface (FR-017). Files 300–500 lines max; no `any`/`as`/`@ts-ignore` (Constitution VI).

**Scale/Scope**: Small fleet — a handful to dozens of instances (the live dogfood is ~2 hosts). No table virtualization/pagination required for this scope; if the fleet later grows large, that is a separate concern.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Test-First (NON-NEGOTIABLE)**: PASS — every code change (credential-class guard, BFF read/stream relay, table/drawer behavior contracts) lands RED-first. The credential-class invariant (reader rejected on ingest; telemetry rejected on read) is a natural RED test.
- **II. Integration-First, No Speculative Building**: PASS — the read-credential abstraction is derived from **two concrete instances** (the existing telemetry token + the new reader), not one imagined provider. No scope cuts invented; the spec captured everything and scoping was operator-driven.
- **III. Branch on Capabilities, Never Provider Identity**: PASS — mesh delegation is capability-level (any mesh / identity-aware proxy); no branch on a specific proxy's identity. No provider-identity branching anywhere.
- **IV. Division of Labor**: N/A — no provider artifact is read or written; the dashboard is a pure API consumer.
- **V. No Fallbacks, No Mock Data Outside Tests**: PASS — the read guard fails **closed** (no anonymous read, no fallback to accepting a telemetry token; FR-012). Missing config raises a descriptive refusal, not a silent default.
- **VI. Strict Typing & Composition**: PASS — composition + DI over interfaces; strict typing; file-size cap. The credential-class port is an interface, injected.
- **VII. Commit & Push Early and Often**: PASS — one logical change per commit, pushed; no AI attribution.
- **VIII. Faithful Tool Adoption**: PASS — authored through the full Spec Kit chain in order.
- **IX. Execution-Backend Pluggability**: N/A — not an execution-engine feature.
- **Installation-anchor invariant**: PASS — the plane's read-credential configuration is anchored inside the enclosing installation (same discipline as telemetry state); no state written outside the installation tree.

**No violations.** Complexity Tracking below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/038-fleet-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── dashboard-bff-api.md      # browser <-> dashboard-server contract
│   └── plane-read-credential.md  # plane read-credential-class contract
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository)

Two touch-points — a **new** dashboard package (out-of-process consumer) and a **bounded** plane-side change:

```text
packages/fleet-dashboard/                # NEW workspace package (@deskwork/fleet-dashboard)
├── src/
│   ├── server/                          # the BFF: node:http server, loopback-default bind
│   │   ├── config.ts                    # FLEET_PLANE_URL / FLEET_PLANE_READ_TOKEN + bind opts
│   │   ├── plane-client.ts              # the ONLY caller of /v1/* (holds the read credential)
│   │   ├── stream-relay.ts              # upstream /v1/instances/stream -> same-origin SSE
│   │   └── routes.ts                    # same-origin browser-facing routes (no plane bearer)
│   └── client/                          # browser UI — STACK DEFERRED to /frontend-design (FR-030)
└── tests/                               # vitest: config, plane-client, stream-relay, routes

plugins/stack-control/src/plane/         # BOUNDED plane-side change
├── http/auth.ts                         # + read-credential class (distinct from TokenRegistry)
└── runtime.ts                           # consumer read routes guarded by the READER class,
                                         #   not the telemetry registry (the coupling to fix)

plugins/stack-control/src/dashboard/     # REMOVED at cutover (FR-026..028), after standalone
                                         #   passes acceptance against a released plane
```

**Structure Decision**: The dashboard is a new top-level workspace package `packages/fleet-dashboard` (added to the root `workspaces` array, alongside `packages/{core,cli,studio}`), so it is genuinely out-of-process and separate from the plane's plugin tree — embodying "first-class external consumer." The plane-side credential-class change is bounded to `plugins/stack-control/src/plane/{http/auth.ts,runtime.ts}`. This resolves the design record's "app home = monorepo package"; the exact package path is a plan-level pick the operator can redirect. The browser client stack lives under `src/client/` but its framework/build is intentionally unset here (FR-030).

## Complexity Tracking

> No Constitution Check violations — nothing to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
