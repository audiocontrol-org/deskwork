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

All new source lives **under `plugins/stack-control/`** so it travels with stack-control's planned spin-out into its own repository (see Structure Decision). Two touch-points — a **new** dashboard subtree (out-of-process consumer) and a **bounded** change to the existing plane:

```text
plugins/stack-control/fleet-dashboard/   # NEW out-of-process dashboard (under stack-control)
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

**Structure Decision**: The dashboard is a new subtree **`plugins/stack-control/fleet-dashboard/`**, out-of-*process* from the plane but inside the stack-control tree. Rationale (operator, 2026-07-21): **all stack-control source stays under `plugins/stack-control/` because stack-control will be moved out of the deskwork repository into its own dedicated repository** — placing the dashboard in the deskwork-owned `packages/` would strand it at spin-out. This is the "out-of-process" property that matters (own process, own credential, HTTP-only coupling to `/v1/*`), not "out-of-package"; it refines the design record's "monorepo workspace package" home to "a subtree under stack-control." It shares stack-control's tooling (`tsx` + `vitest`); nothing is added to the deskwork root `workspaces` array. The plane-side credential-class change is bounded to `plugins/stack-control/src/plane/{http/auth.ts,runtime.ts}`. The browser client stack under `fleet-dashboard/src/client/` is intentionally unset here (FR-030).

## Complexity Tracking

> No Constitution Check violations — nothing to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
