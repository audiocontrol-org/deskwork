---
description: "Task list — Fleet Dashboard (specs/038-fleet-dashboard)"
---

# Tasks: Fleet Dashboard

**Input**: Design documents from `specs/038-fleet-dashboard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test-First is NON-NEGOTIABLE here (Constitution I) — every implementation task is preceded by its RED test task.

## Format: `[ID] [P?] [Story] [tier:LABEL] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task).
- **[Story]**: US1/US2/US3/US4 (setup/foundational/polish carry no story label).
- **[tier:LABEL]** (this installation's `tier_map`): `fast`→haiku, `balanced`→sonnet, `powerful`→opus. Heuristic: mechanical/RED-only/doc → `fast`; standard impl → `balanced`; cross-cutting/architectural/high-blast-radius → `powerful`.

**Source homes**: dashboard under `plugins/stack-control/fleet-dashboard/`; plane-side change bounded to `plugins/stack-control/src/plane/{http/auth.ts,runtime.ts}`. NOT `packages/`.

**Scope boundary**: this feature builds the BFF + the plane read-credential class + the browser-facing **contract boundary**. The browser UI's framework/visual implementation is DEFERRED to a pre-implementation `/frontend-design` pass (FR-030) and is a downstream effort — no task here picks a UI framework or builds the visual client.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 [tier:fast] Create the dashboard subtree `plugins/stack-control/fleet-dashboard/{src/server,src/client,tests}` and wire it into stack-control's `tsconfig`/`vitest` (shared tooling; no new npm workspace, nothing added to the deskwork root `workspaces`).
- [x] T002 [P] [tier:fast] Add a documented start command for the dashboard server (loopback default) — a `tsx` entrypoint under `plugins/stack-control/fleet-dashboard/src/server/` plus a note in the package README stub.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: server config + the credential boundary both stories depend on.

- [x] T003 [tier:fast] RED test `plugins/stack-control/fleet-dashboard/tests/server/config.test.ts`: config reads `FLEET_PLANE_URL` + `FLEET_PLANE_READ_TOKEN`; bind is loopback by default; a non-loopback bind requires an explicit opt-in; missing required config fails loud (no silent default, Constitution V).
- [x] T004 [tier:balanced] Implement `plugins/stack-control/fleet-dashboard/src/server/config.ts` to satisfy T003.

---

## Phase 3: User Story 1 — Read access uses a dedicated credential class (Priority: P1) 🎯 MVP-enabling

**Goal**: the plane accepts a read credential that is a distinct class from telemetry tokens; the coupling of read routes to the telemetry registry is removed.
**Independent test**: the four-cell truth table + fail-closed + revocation independence (contracts/plane-read-credential.md, quickstart V1) — API-level, no UI.

- [x] T005 [tier:fast] RED test `plugins/stack-control/src/plane/__tests__/read-credential-class.test.ts`: the four-cell truth table — reader-on-read → 200; reader-on-ingest → 401; telemetry-on-read → 401; telemetry-on-ingest → 200.
- [x] T006 [tier:fast] RED test (same file or sibling): no read credential configured → every consumer read route 401 (fail-closed, FR-012); revoke one reader → that reader 401, a second reader still 200, telemetry unaffected (FR-010).
- [x] T007 [tier:powerful] Implement the reader-credential verification path in `plugins/stack-control/src/plane/http/auth.ts` — a reader credential set/verifier distinct from the telemetry `TokenRegistry` (research R3), storage-agnostic behind an injected interface; independent revocation.
- [x] T008 [tier:powerful] Rewire the consumer read routes in `plugins/stack-control/src/plane/runtime.ts` behind a `withConsumerAuth` (reader) guard, leaving ingest/sidecar/liveness on the telemetry registry — this is the coupling fix and is high-blast-radius; verify no read route still verifies against the telemetry registry.
- [x] T009 [tier:balanced] Wire read-credential configuration + the plane's existing live-reload path (`refreshBeforeAuth`, research R2), installation-anchored per the installation-anchor invariant.

**Checkpoint**: US1 independently testable (quickstart V1 passes) with no dashboard present.

---

## Phase 4: User Story 2 — See live fleet state in a browser (Priority: P1) 🎯 MVP

**Goal**: the BFF serves an instance-rooted live view; the browser talks only to the dashboard origin; the read credential stays server-side.
**Independent test**: quickstart V2 + V3 (live table, deltas, reveal, disconnect/reconnect, same-origin, no credential leak).

- [x] T010 [tier:fast] RED test `plugins/stack-control/fleet-dashboard/tests/server/plane-client.test.ts`: the plane client attaches the read credential ONLY to allowlisted `/v1/*` reads and never exposes it; non-allowlisted upstream paths are not proxied (contracts/dashboard-bff-api.md).
- [x] T011 [tier:balanced] Implement `plugins/stack-control/fleet-dashboard/src/server/plane-client.ts` — the only caller of `/v1/*`, holding the credential (uses `GET /v1/instances`, `?include=all`, and the run/instance detail endpoints).
- [x] T012 [tier:fast] RED test `plugins/stack-control/fleet-dashboard/tests/server/stream-relay.test.ts`: one upstream `/v1/instances/stream` subscription fanned out; each browser gets snapshot-then-deltas; a simulated upstream drop→reconnect produces a re-snapshot (research R1, FR-016).
- [x] T013 [tier:balanced] Implement `plugins/stack-control/fleet-dashboard/src/server/stream-relay.ts` — single upstream SSE subscription → same-origin SSE fan-out.
- [x] T014 [tier:fast] RED test `plugins/stack-control/fleet-dashboard/tests/server/routes.test.ts`: `/api/instances`, `/api/stream` serve same-origin; no `/api/*` response contains `FLEET_PLANE_READ_TOKEN`; with the plane unreachable, `/api/*` returns an upstream-unavailable state (not a crash) and recovers. Also assert the no-in-app-auth invariant (FR-022/FR-023) mechanically: the server exposes no login/session/auth surface — `/api/*` responses set no auth/session `Set-Cookie` and carry no `WWW-Authenticate` challenge, and no auth/login route is mounted — so the security posture is pinned by a test, not only the README note (T025).
- [x] T015 [tier:balanced] Implement `plugins/stack-control/fleet-dashboard/src/server/routes.ts` + the `node:http` server (loopback bind) mounting `/api/*`, `/api/stream`, and static `/` (assets placeholder until the client is built).
- [x] T016 [tier:fast] RED+impl for default membership (FR-014a): `/api/instances` returns connected/recent by default and gone/disconnected only under `?include=all`; assert in `routes.test.ts`.
- [x] T017 [P] [tier:fast] Write the browser-facing **contract-boundary doc** `plugins/stack-control/fleet-dashboard/src/client/CONTRACT.md` (what the BFF serves for the table + live stream); note that UI implementation is gated on `/frontend-design` (FR-030) — no framework chosen here.

**Checkpoint**: US1 + US2 = MVP — an external, credentialed, live fleet view (quickstart V1–V3).

---

## Phase 5: User Story 3 — Drill into an instance and its runs (Priority: P2)

**Goal**: per-instance drawer data (state + recentActivity + runs) and run history/timings, deep-linkable, live under an open drawer.
**Independent test**: quickstart V4.

- [x] T018 [tier:fast] RED test `plugins/stack-control/fleet-dashboard/tests/server/drill-in.test.ts`: `/api/instances/:id`, `/api/instances/:id/runs`, `/api/runs/:id`, `/history`, `/timings` proxy correctly and same-origin; upstream-unavailable handled.
- [x] T019 [tier:balanced] Implement the drill-in BFF routes (extend `routes.ts` or add `src/server/drill-in-routes.ts` to respect the 300–500 line file cap) for instance detail, instance runs, and run detail/history/timings.
- [x] T020 [P] [tier:fast] Extend `src/client/CONTRACT.md` with the drawer surfaces: deep-linkable open state (encoded in the URL), and live-under-open-drawer behavior (upsert updates in place; removal marks gone, no abrupt close). Still `/frontend-design`-gated; no framework.

**Checkpoint**: US3 independently testable (quickstart V4) at the BFF/data layer.

---

## Phase 6: User Story 4 — Retire the in-process prototype (Priority: P3) 🔒 gated

**Goal**: remove the rejected in-process dashboard once the standalone is proven.
**Gate (FR-026)**: do NOT start this phase until the standalone dashboard passes quickstart V1–V4 against a **released** plane.

- [~] T021 [tier:fast] RED test `plugins/stack-control/src/plane/__tests__/dashboard-routes-removed.test.ts`: after removal, plane `GET /` and `GET /dashboard/*` return the standard 404 (FR-028).
- [~] T022 [tier:balanced] Remove `plugins/stack-control/src/dashboard/` (`serve.ts`, `assets.ts`, `assets/`) and unmount its routes from the plane wiring — same branch, no release with both dashboards (FR-027). Gated on the acceptance precondition above.
- [~] T023 [P] [tier:fast] Update references to the removed in-process build (roadmap `design:feature/fleet-dashboard` note, backlog TASK-476/TASK-477 resolution, any docs) to point at the standalone.

**Checkpoint**: exactly one dashboard architecture; quickstart V5 passes.

---

## Phase 7: Polish & Cross-Cutting

- [~] T024 [P] [tier:fast] Run quickstart V1–V5 against a live plane; record falsifiable evidence (URLs, measured responses) per the UI-verification discipline.
- [x] T025 [tier:fast] Dashboard README under `plugins/stack-control/fleet-dashboard/`: start command, `FLEET_PLANE_URL`/`FLEET_PLANE_READ_TOKEN` config, loopback-default + zero-trust deployment note (browser-facing access delegated to a mesh; no in-app human auth).
- [~] T026 [tier:powerful] `/frontend-design` gate: before any browser UI implementation, run `/frontend-design` for the dashboard surfaces (table, drawer, reveal, disconnected/stale states) driven by `src/client/CONTRACT.md`. Client visual implementation is a downstream effort after this pass — explicitly out of this feature's scope.

---

## Execution status (038 execute run, 2026-07-25)

Completed in-session and committed (`[x]`): T001–T020, T025 — setup, config, US1 read-credential class + coupling fix, US2 BFF (plane-client, stream-relay, routes+server, membership) + contract doc, US3 drill-in + drawer contract, README. Full test suite green; whole-feature governance runs over this diff.

Deferred with the `[~]` marker (excluded from the `tasks-complete` gate — audit-before-acceptance), each for a concrete blocker a coding agent cannot clear in this session:

- **T021, T022, T023 (US4 cutover)** — hard-gated by FR-026: the in-process build may be removed only after the standalone passes acceptance against a **released** plane. No released plane exists mid-execute; this is the spec's own release sequencing, not a scope cut. Do these on the post-release cutover.
- **T024** — live-plane quickstart evidence (incl. V5 cutover) requires the released plane above.
- **T026** — the `/frontend-design` gate is operator-in-the-loop (mockup generation + operator selection) and gates the downstream browser-client build (a separate effort); it cannot be autonomously "completed" by a dispatch.

## Dependencies & order

- **Setup (P1–T002)** → everything.
- **Foundational (T003–T004)** → US2/US3 (the BFF needs config).
- **US1 (T005–T009)** is independent of the BFF and can proceed in parallel with Setup/Foundational; it is the plane-side enabler that US2/US3 authenticate against in end-to-end runs.
- **US2 (T010–T017)** depends on Foundational; end-to-end validation depends on US1 (a configured reader on the plane).
- **US3 (T018–T020)** depends on US2's plane-client + server scaffolding.
- **US4 (T021–T023)** gated on US2+US3 passing acceptance against a released plane.
- **Polish (T024–T026)**: T026 (`/frontend-design`) gates any later client build; T024–T025 after the BFF stories land.

## Parallel opportunities

- US1 (plane-side) ∥ Setup/Foundational (dashboard-side) — different trees.
- Within a story, RED test tasks marked [P] where they touch different files; the credential-class RED tests (T005/T006) can be authored in parallel with the dashboard config test (T003).
- Contract-boundary docs (T017, T020, [P]) parallel to server impl.

## MVP scope

**US1 + US2** (T001–T017): an external, credentialed, live instance-rooted fleet view — the minimum that delivers the feature's headline value and fixes the root defect. US3 (drill-in) and US4 (cutover) are incremental.

## Format validation

All tasks carry a checkbox, sequential ID, tier tag, story label (in story phases), and an exact file path. Tests precede their implementations (Constitution I).
