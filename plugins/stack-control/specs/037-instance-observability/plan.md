# Implementation Plan: Instance Observability

**Branch**: `feature/fleet-control-plane` (numbered spec dir) | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification at `specs/037-instance-observability/spec.md` and the approved design record `docs/superpowers/specs/2026-07-18-instance-observability-design.md`.

## Summary

Reframe the fleet control plane from run-centric (036) to **instance-centric**: the observable unit is the instance (`host:path` — a sidecar/worktree). Scope is **observability only** — telemetry collection, a per-instance registry (a materialized projection over the authoritative durable event log), and a **read-only** query API (`GET /v1/instances{,/:id,/:id/runs,/stream}`). Control is an explicit out-of-scope follow-on.

**Technical approach:** build entirely on 036's existing, tested transport (sidecar election, spool WAL, uplink, HTTP plane, fail-open emission, event classification seam, bearer auth). The new work is: (1) the **producers** 036 never wired — `phase.entered` from the workflow transition-engine, `session.started`/`session.ended` from the session skills, and stamping every event with `host:path` + the current session id while the plane stops discarding `invocation.completed`; (2) an **instance-registry projection** paralleling the run registry, rehydrated from the durable event log; (3) the **query API** over it. Runs reframe as a facet of an instance. Every plan-time contract (the deferred numbers + the `host:path`↔`installationId` seam) is pinned by a RED test before implementation (Constitution Principle I).

## Technical Context

**Language/Version**: TypeScript (strict), run via `tsx`; Node ≥20 (22.19.0 actual). No `any`/`as`/`@ts-ignore` (Principle VI).

**Primary Dependencies**: In-tree stack-control (`src/`), reusing 036's `src/plane/`, `src/sidecar/`, `src/fleet/`, `src/machine-state/`, `src/telemetry/`, `src/workflow/`. No new runtime dependency.

**Storage**: The existing durable event log (the plane's authoritative record) + the machine-local durable store (`locate.ts` durableDir) for the new `current-session` record. No new database; the instance registry is in-memory, rehydrated from the durable log.

**Testing**: `vitest` (`npm test`), RED-first. Plus the real-producer dogfood (FR-027) as primary evidence.

**Target Platform**: Local developer machines (macOS/Linux) running the sidecar; the plane is an HTTP service reachable at `STACKCTL_CP_URL`.

**Project Type**: Single project — a CLI (`stackctl`) + a local HTTP plane service, extended in place.

**Performance Goals**: Emission MUST NOT measurably tax any `stackctl` invocation (SC-005, the 036 fail-open contract). Live instance-state queries MUST perform **zero durable-store reads** (FR-023/SC-007).

**Constraints**: Fail-open (observation strictly subordinate to the tool observed); zero durable reads for live state; instance identity never in the git tree (SC-004); files under 300–500 lines (Principle VI — split new units accordingly).

**Scale/Scope**: A single-operator fleet of a handful of instances (worktrees) across a few hosts; the registry folds a bounded event stream. Not a multi-tenant service (deferred).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Test-First (NON-NEGOTIABLE)** — PASS by construction: every plan-time contract (liveness window, reconciliation grace, heartbeat interval, `recentActivity` cap N, retention) and every producer/projection behavior is pinned by a RED test authored before its implementation. The feature's acceptance additionally requires a real-producer end-to-end dogfood (FR-027), not just a green suite.
- **II. Integration-First, No Speculative Building** — PASS: builds on 036's real, tested transport; the query API has a real consumer from day one (the dogfood); no speculative abstraction. Capture-over-scope honored (the spec carries the full open-questions list; the only scope cut — control — is the operator's).
- **III. Branch on Capabilities, Never Provider Identity** — PASS: producers and API are vendor-neutral; no branch on backend identity.
- **IV. Division of Labor** — PASS: producers (emit) are distinct from the projection (fold) which is distinct from the API (serve); each is an isolatable unit with a defined interface.
- **V. No Fallbacks, No Mock Data Outside Tests** — PASS: absent data (unobserved phase durations, no open session) is reported as explicitly absent, never fabricated (FR-018); emission failures are swallowed fail-open by design (the observation-subordinate contract), not masked with mock data.
- **VI. Strict Typing & Composition** — PASS: no `any`/`as`/`@ts-ignore`; new units are composed, files kept under the size cap (see Structure).
- **VII. Commit & Push Early and Often** — PASS: per-task commit+push in the execute loop.
- **VIII. Faithful Tool Adoption** — PASS: authored through the full spec-kit chain via the stack-control front door.
- **IX. Execution-Backend Pluggability** — N/A to this feature (no execution-backend choice); no violation.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/037-instance-observability/
├── plan.md              # This file
├── research.md          # Phase 0 — plan-time contracts + seam decisions, grounded in 036 source
├── data-model.md        # Phase 1 — Instance, Session, InstanceState, new event types, current-session record
├── quickstart.md        # Phase 1 — the real-producer dogfood loop (FR-027) as the verification path
├── contracts/           # Phase 1 — the query API shapes + the new event/envelope shapes
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root: `plugins/stack-control/`)

Extends 036's existing tree; new units are additive and small (final module split confirmed in research.md against the size cap):

```text
src/
├── fleet/
│   ├── classification.ts      # EXTEND: add session.started/ended + phase.entered to the catalog (reuse the seam; keep "aggregated")
│   ├── event.ts               # EXTEND: envelope carries host:path + sessionId
│   └── instance/              # NEW: instance identity (host:path deriver), InstanceState types
├── plane/
│   ├── instance-registry.ts   # NEW: fold events -> InstanceState per instance (parallels registry.ts); rehydrate from the durable log
│   ├── http/
│   │   ├── instances-api.ts    # NEW: instances snapshot / per-instance / runs-facet / deltas (parallels api.ts)
│   │   ├── server.ts           # EXTEND: add the /v1/instances* routes to the table
│   │   └── stream.ts           # EXTEND/REUSE: SSE deltas for /v1/instances/stream
│   └── runtime.ts             # EXTEND: construct + wire the instance registry; rehydrate on start
├── machine-state/
│   ├── locate.ts              # host:path derivation source (host + realpath); current-session record path
│   ├── current-session.ts     # NEW: machine-local current-session record (mint/read/clear) beside identity/token
│   └── ...                    # installationId re-key seam per research.md
├── telemetry/
│   └── invocation-telemetry.ts # EXTEND: stamp host:path + current session id; stop discarding plane-side
├── workflow/
│   └── phase-emit.ts          # NEW: the transition-engine hook that emits phase.entered (single seam)
└── sidecar/
    └── daemon.ts              # EXTEND: route the register-run/session frames it currently drops (TASK-461)

tests/  (or src/__tests__/)    # RED-first: one failing test per plan-time contract + producer + projection behavior
```

**Structure Decision**: Single-project, in-tree extension of 036. New behavior lands in small new modules (`instance-registry.ts`, `instances-api.ts`, `current-session.ts`, `phase-emit.ts`, `fleet/instance/`) rather than swelling existing files past the size cap; existing files are extended only at their seams (catalog, route table, envelope, runtime wiring, daemon routing). The exact split is confirmed in research.md item 5 against current line counts.

## Complexity Tracking

No Constitution violations — none required.
