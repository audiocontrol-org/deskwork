---
description: "Task list for instance-observability implementation"
---

# Tasks: Instance Observability

**Input**: `spec.md`, `plan.md`, `research.md` (D1–D9), `data-model.md`, `contracts/`, `quickstart.md` in `specs/037-instance-observability/`

**Tests**: REQUIRED and RED-first (Constitution Principle I — Test-First is NON-NEGOTIABLE). For every plan-time contract, producer, and projection behavior, the failing test task precedes its implementation task.

**Organization**: A shared Foundational phase (identity, envelope, catalog, snapshot-threading, runtime split) precedes three independently-demonstrable user-story slices (US1 instances+last-activity, US2 sessions, US3 bearing/phase-durations). Scope is **observability only** — no control/command tasks; TASK-461 (sidecar run-frame routing) is out of scope.

**Format**: `[ID] [P?] [Story] [tier:LABEL] Description with file path` — tiers: `fast`=haiku, `balanced`=sonnet, `powerful`=opus (this installation's `tier_map`).

**Paths**: repo-relative to `plugins/stack-control/`. Tests under `tests/instance/` (new) and `tests/fleet/` (extending 036), run by `vitest`.

---

## Phase 1: Setup

- [x] T001 [tier:fast] Create the new source module stubs (empty, typed, exported) so later tasks land in files under the size cap: `src/machine-state/instance-id.ts`, `src/machine-state/current-session.ts`, `src/plane/instance-registry.ts`, `src/plane/http/instance-api.ts`, `src/fleet/instance/types.ts`, and `src/fleet/liveness-constants.ts` (or extend the nearest existing constants seam). Add a `tests/instance/` dir.

---

## Phase 2: Foundational (BLOCKING — precedes all user stories)

**The shared spine: identity, constants, the extended envelope, the catalog, the snapshot-threading seam, the current-session store, and the required `runtime.ts` split. No user story can proceed until these land.**

### Plan-time constants (D1)

- [x] T002 [P] [tier:fast] RED: `tests/instance/constants.test.ts` — assert the five plan-time contracts and derived boundaries: heartbeat `45_000`, liveness window `90_000` (live↔stale at 90 s), reconciliation grace `600_000` (stale↔gone at 10 min), `recentActivity` cap `N=50` (eviction at N+1), and that historical retention has no separate eviction clock (follows the log).
- [x] T003 [tier:balanced] Implement the constants + the `deriveLiveness(lastSignalAgeMs)` boundary helper in `src/fleet/liveness-constants.ts`, reusing 036's `DEFAULT_LIVENESS_INTERVAL_MS`. Make T002 green.

### Instance Identity — host:path (D8)

- [x] T004 [P] [tier:fast] RED: `tests/instance/instance-id.test.ts` — `deriveInstanceId(root)` returns `host:realpath`; stable across calls; distinct hosts/paths distinct; never reads/writes a git-tracked file.
- [x] T005 [tier:balanced] Implement `deriveInstanceId` in `src/machine-state/instance-id.ts` (`hostname()` + `realpathSync.native`). Make T004 green.

### Extended envelope — host/path/sessionId (D3)

- [x] T006 [P] [tier:fast] RED: `tests/fleet/envelope-instance-fields.test.ts` — **`constructEnvelope` derives `host`/`path` internally from `installationRoot` so EVERY constructed envelope carries identity even with minimal caller input (FR-011 by construction, analyze M2)**; `sessionId` is caller-supplied and nullable; `validateEnvelope` fail-louds on wrong types; `sessionId:null` accepted; schemaVersion bumped.
- [x] T007 [tier:powerful] Add `host`,`path`,`sessionId` to `EventEnvelope` (`src/fleet/types.ts`); add ONLY `sessionId` to `EnvelopeInput` (`src/fleet/event.ts`) and pass `installationRoot` to `constructEnvelope`, which **derives `host:path` via `deriveInstanceId` itself** (not caller-supplied — FR-011 holds by construction); add `require*` validation in `validateEnvelope`; bump `schemaVersion`. Touches the emit hot path — keep additive, no behavior change to existing fields. Depends on T005 (deriver). Make T006 green + full suite green.

### Classification catalog — 3 new durable types (D2)

- [x] T008 [P] [tier:fast] RED: `tests/fleet/classification-new-types.test.ts` — `classifyEvent('session.started'|'session.ended'|'phase.entered')` returns `durable`; unknown types still fail loud.
- [x] T009 [tier:fast] Add `session.started`,`session.ended`,`phase.entered` to the `EventType` union (`src/fleet/types.ts`) and one `EVENT_CLASSIFICATIONS` entry each = `durable` (`src/fleet/classification.ts`). Keep `aggregated` name. Make T008 green.

### Snapshot-threading seam (D5 — the sharpest seam)

- [x] T010 [P] [tier:powerful] RED: `tests/fleet/snapshot-threading.test.ts` — an event with a snapshot ingested through `toClassifiedEvent` retains its `snapshot` on the `ClassifiedEvent`; the event log persists it; a rehydrate replays it. Pin the `≤ MAX_EVENT_SNAPSHOT_BYTES` bound is unchanged.
- [x] T011 [tier:powerful] Add `snapshot` to `ClassifiedEvent` (`src/plane/registry.ts` type + `src/plane/http/ingest.ts` `toClassifiedEvent`), and ensure `src/plane/event-log.ts` persists+replays it. Minimal scope (TASK-457 fix for observability payloads). Make T010 green + full suite green.

### Current-session store (D9)

- [x] T012 [P] [tier:fast] RED: `tests/instance/current-session.test.ts` — `mint()` writes `{sessionId,startedAt}` to the machine-local durable dir; `read()` returns it; `clear()` removes it; a second `mint()` over an existing record returns the old id for supersede handling; absent → `read()` is null; never in a git path.
- [x] T013 [tier:balanced] Implement `src/machine-state/current-session.ts` (mint/read/clear) in `MachineStateLocation.durableDir`, mirroring `identity.ts`. Make T012 green.

### Required refactor — split runtime.ts BEFORE wiring (D9)

- [x] T014 [tier:powerful] RED/guard: `tests/instance/runtime-size.test.ts` (or a size-cap assertion) — assert `src/plane/runtime.ts` and every new/edited plane file is `≤ 500` lines. Fails now (runtime.ts is 523).
- [x] T015 [tier:powerful] Split `src/plane/runtime.ts` (523 → under cap): extract the handler map / SSE handler wiring into a sibling module (e.g. `src/plane/runtime-handlers.ts`), no behavior change. Full suite green + T014 green. **This precedes all instance-registry wiring into runtime.ts.**

**Checkpoint**: envelope carries identity, catalog knows the new types, snapshots survive ingest+rehydrate, the session store exists, runtime.ts is under cap. User stories can now proceed.

---

## Phase 3: User Story 1 — Instances appear from real activity (Priority: P1) 🎯 MVP

**Goal**: `GET /v1/instances` shows every real instance (host:path) with connection/liveness and last-activity, sourced by stamping + no longer discarding `invocation.completed`. **Independent test**: run a real verb → the instance appears with its last verb + time.

- [x] T016 [P] [US1] [tier:balanced] RED: `tests/instance/registry-instances.test.ts` — `buildInstanceRegistry` folds `invocation.completed` (+`session.heartbeat`) into one `InstanceState` per host:path: existence, `lastActivityAt`/`lastActivity`, `connection`, `liveness`; no-regress + effectively-once by sequence/eventId; two hosts → two instances.
- [x] T017 [P] [US1] [tier:fast] RED: `tests/instance/instance-state-shape.test.ts` — `toInstanceState` projects the FR-016 field set (no `waiting` field, FR-017).
- [x] T018 [US1] [tier:balanced] Implement `buildInstanceRegistry` + accumulator + `toInstanceState` in `src/plane/instance-registry.ts` (parallels `registry.ts` trio). Make T016/T017 green.
- [x] T019 [P] [US1] [tier:powerful] Ensure `src/telemetry/invocation-telemetry.ts` passes `installationRoot` to `constructEnvelope` (host/path derive there per T007) and reads `sessionId` from the `current-session` record (null-safe) to pass on `EnvelopeInput`; keep fail-open (no new failure/latency on the invocation path). RED first: `tests/instance/emit-stamps-identity.test.ts` (asserts host/path present + sessionId threaded).
- [x] T020 [US1] [tier:balanced] Stop discarding `invocation.completed` plane-side: fold it into the instance registry (retain in the in-memory event stream that feeds `buildInstanceRegistry`). RED first: `tests/instance/invocation-retained.test.ts`.
- [x] T021 [P] [US1] [tier:fast] RED: `tests/instance/api-instances-snapshot.test.ts` — `instanceSnapshot` returns `{instances:[...]}` each once; `?include=all` includes disconnected/gone; `instanceDetail` returns full state + `recentActivity`; unknown id → 404 `{found:false}`.
- [x] T022 [US1] [tier:balanced] Implement `instanceSnapshot` + `instanceDetail` in `src/plane/http/instance-api.ts`; add `GET /v1/instances` + `GET /v1/instances/:id` to `ROUTE_TABLE`/`PlaneRouteHandlers` (`src/plane/http/server.ts`), each `withAuth`-wrapped. Make T021 green.
- [x] T023 [US1] [tier:balanced] Wire the instance registry + rehydrate-from-log into `src/plane/runtime.ts` (post-split), reusing the `rehydrateIngestState` boot path. RED first: `tests/instance/instance-rehydrate.test.ts` (instances survive a plane restart).
- [x] T024 [P] [US1] [tier:fast] RED: `tests/instance/live-zero-durable-reads.test.ts` — serving `GET /v1/instances` performs 0 durable-store reads (FR-023/SC-007). Implement/confirm in T022/T023.

**Checkpoint US1**: real verbs populate `GET /v1/instances`; independently demonstrable.

---

## Phase 4: User Story 2 — Sessions and their history (Priority: P2)

**Goal**: session lifecycle (`/stack-control:session-start`..`session-end`) is observable — counts, current open session, first session, supersede, and counts survive a restart. **Independent test**: real session-start/verbs/session-end → detail shows the session lifecycle; counts survive a plane bounce.

- [x] T025 [P] [US2] [tier:balanced] RED: `tests/instance/session-verbs.test.ts` — `session-start` mints the current-session record + emits `session.started`; `session-end` emits `session.ended` + clears it; both fail-open (never block); a second `session-start` supersedes (emits `session.ended{reason:'abandoned'}` for the old id, FR-009a).
- [x] T026 [US2] [tier:balanced] Implement the emit+record logic in the `session-start` / `session-end` CLI verbs (`src/subcommands/…`), reusing the emit path; supersede handling. Make T025 green.
- [x] T027 [P] [US2] [tier:balanced] RED: `tests/instance/registry-sessions.test.ts` — folding `session.*` yields `currentSession`, `sessionsStarted`/`sessionsEnded`, `firstSessionAt`; an unclosed session shows "open since X" (FR-009); attribution: invocations during the session carry its `sessionId`.
- [x] T028 [US2] [tier:balanced] Extend `buildInstanceRegistry` to fold `session.*` into those fields. Make T027 green.
- [x] T029 [P] [US2] [tier:fast] RED: `tests/instance/session-counts-rehydrate.test.ts` — `sessionsStarted/Ended`/`firstSessionAt` unchanged across a plane restart (SC-006). Confirm via the rehydrate path.

**Checkpoint US2**: session history is real and durable across restarts.

---

## Phase 5: User Story 3 — Current bearing & phase-duration timeline (Priority: P3)

**Goal**: `currentBearing` and cumulative `phaseDurations` (design/spec/execution/governance) from real workflow phase transitions. **Independent test**: drive a real phase transition → bearing updates; re-enter a phase → its duration accrues; unobserved phase → absent.

- [x] T030 [P] [US3] [tier:powerful] RED: `tests/instance/phase-emit.test.ts` — a committed `applyTransition` emits `phase.entered{phase,from,item}` (fail-open); a dry-run emits nothing.
- [x] T031 [US3] [tier:powerful] Implement the fail-open `phase.entered` side emission after the committed `applyTransition` in `src/subcommands/workflow-advance.ts` (thread a `Clock`; NO compass resolution — `currentBearing` derives from `{phase,item}`, L2). Do NOT add it to `EFFECT_VERBS`. Make T030 green.
- [x] T032 [P] [US3] [tier:balanced] RED: `tests/instance/registry-bearing-durations.test.ts` — folding `phase.entered`: `currentBearing` = latest and **persists through `session.ended`** (FR-016c); `phaseDurations` accrue **cumulatively across re-entries** (FR-018); an unobserved phase is **absent, never 0** (SC-009).
- [x] T033 [US3] [tier:balanced] Extend `buildInstanceRegistry` to fold `phase.entered` into `currentBearing` + cumulative `phaseDurations`. Make T032 green.
- [x] T034 [P] [US3] [tier:powerful] RED: `tests/instance/phase-payload-e2e.test.ts` — a real `phase.entered` ingested end-to-end appears in `currentBearing` AND survives a rehydrate (exercises the D5 snapshot-threading through the full path).

**Checkpoint US3**: the full design→spec→execution→governance timeline is observable.

---

## Phase 6: Polish & Cross-Cutting

- [x] T035 [P] [tier:fast] RED: `tests/instance/route-ordering.test.ts` — `/v1/instances/stream` precedes `/v1/instances/:id` in `ROUTE_TABLE` (D7); a request to `/stream` routes to the stream handler, not `instanceDetail`.
- [x] T036 [tier:balanced] Implement `instanceStream` (SSE deltas) + `computeInstanceDeltas` (reuse the existing `instance-upserted`/`instance-removed` vocabulary in `api.ts`) in `src/plane/http/instance-api.ts`; add `GET /v1/instances/stream` route (ordered before `:id`). Mirror `fleetStreamHandler`. Make T035 green.
- [x] T037 [P] [tier:balanced] Implement `instanceRuns` + `GET /v1/instances/:id/runs` (filter the run registry by owning instance); confirm `/v1/fleet` still serves the cross-instance run view. RED first: `tests/instance/api-instance-runs.test.ts`.
- [x] T038 [P] [tier:powerful] RED: `tests/instance/auth-host-path.test.ts` — a token authorized for one `host:path` is refused when claiming another (token→host:path check alongside the existing UUID `refuseInstallationMismatch`). Implement in `src/plane/http/…`/`runtime-http.ts`. Keep `installationId` storage/auth roles unchanged (D8).
- [x] T039 [P] [tier:fast] RED: `tests/instance/read-only-surface.test.ts` — every `/v1/instances*` route is GET; no state-changing operation exists (FR-024).
- [x] T040 [P] [tier:fast] RED: `tests/instance/emit-fail-open.test.ts` — with the sidecar/plane unreachable, a stamped emit does not slow/block/fail the invocation, the session verb, or the phase advance (SC-005).
- [x] T041 [tier:powerful] **FR-027 real-producer dogfood (first-class acceptance, NOT the suite):** author `scripts/dogfood-instance-observability.sh` (or extend the 036 dogfood harness) driving the `quickstart.md` scenarios end-to-end with REAL producers — real `/stack-control:session-start`, real `stackctl` verbs, a real phase transition, then `GET /v1/instances` shows a real instance with real state (including a real plane-restart rehydrate check). Capture the evidence. Synthetic `/v1/ingest` injection is INSUFFICIENT for acceptance.
- [x] T042 [P] [tier:fast] Verify the size cap (`≤ 500` lines) across every new/edited file (T014 guard passes) and `tsc --noEmit` clean, no `any`/`as`/`@ts-ignore` (Principle VI).
- [x] T043 [tier:fast] Full suite green: `npm test`. The suite is the floor; T041's dogfood is the proof.

---

## Dependencies & execution order

- **Phase 2 (Foundational) blocks everything.** Within it: T007 (envelope) and T011 (snapshot-threading) and T015 (runtime split) are the load-bearing gates; T014/T015 (split) MUST precede any runtime.ts wiring (T023, T036).
- **US1 (Phase 3)** is the MVP and depends only on Foundational. **US2 (Phase 4)** and **US3 (Phase 5)** depend on Foundational + US1's registry (they extend `buildInstanceRegistry`), and are otherwise independent of each other.
- **Phase 6** depends on the relevant story (stream/runs on US1; auth cross-cutting; dogfood on all).
- RED task always precedes its GREEN implementation task.

## Parallel opportunities

- Foundational RED tests T002/T004/T006/T008/T010/T012 are all `[P]` (distinct files) — author them together, then implement T003/T005/T007/T009/T011/T013.
- Within US1: T016/T017/T021/T024 REDs are `[P]`.
- Phase 6 T035/T037/T038/T039/T040/T042 REDs are largely `[P]`.

## MVP scope

**User Story 1 (Phase 2 + Phase 3)** — real instances appear in `GET /v1/instances` with last-activity. Independently demonstrable and the foundation US2/US3 enrich.

---

## Phase 7: FR-027 dogfood defects — the sidecar strips instance identity (producer-path fix)

**Discovered by T041 (the real-producer dogfood).** The green vitest suite is the floor, not the proof: every instance test POSTs synthetic events to `/v1/ingest` or feeds hand-built events to `buildInstanceRegistry`, **bypassing the sidecar**. Driven end-to-end through the real producer→sidecar→plane path, the sidecar's daemon frame-ingest (`daemon.ts` `ingestFrame`) extracts only 5 envelope fields and the pipeline (`pipeline.ts` `receive`) re-mints from `walDir` — so every 037 identity field is lost: instances key on `host:<spool>`, `currentSession`/`currentBearing`/`phaseDurations` never populate, and an ordinary verb creates no instance. Same failure class as 036, one layer down. Fix RED-first, driving the REAL sidecar path (never a `/v1/ingest` POST); do NOT destabilize 036's run pipeline (eventId/installationSequence/invocationSequence stay sidecar-authoritative).

- [x] T044 [P] [tier:powerful] RED: extend `tests/fleet/sidecar-daemon.test.ts` (the real daemon+UDS+client+plane harness) — a `TelemetryEvent` with a non-null `sessionId`, a distinct `host`/`path`, and a bare 037 snapshot (`{phase,from,item}` / `{sessionId,startedAt}`), pushed through the real frame→daemon→`receive()`→uplink→plane path, arrives at the plane with `host`/`path`/`sessionId` **and the bare snapshot** PRESERVED (not re-derived from `walDir`, not `null`, not `EMPTY_SNAPSHOT`). Align the fixture's `schemaVersion` to 2.
- [x] T045 [tier:powerful] Preserve identity through the sidecar re-mint: widen `RawInvocationEvent` (`pipeline.ts`) with `host`/`path`/`sessionId` + a bare-snapshot carrier; thread `env.host`/`env.path`/`env.sessionId` + `frame.event.snapshot` in `daemon.ts` `ingestFrame`; in `pipeline.ts` `receive`, carry the incoming `host`/`path`/`sessionId` onto the re-minted envelope (drop the `walDir` re-derive + the `sessionId:null` hardcode) while keeping `eventId`/`installationSequence`/`invocationSequence` sidecar-authoritative; give safe structured 037 status snapshots a pass-through survival path through the deny-by-default redaction (`redact.ts`), keeping redaction before the WAL append (FR-048). Make T044 green + full suite + tsc.
- [x] T046 [tier:powerful] RED+fix D-B: a short-verb `invocation.completed` must reach the sidecar (currently dropped by the C4 `short-verb` capacity-0 buffer when a fast CLI exits before the local-socket connect completes) so an ordinary verb creates an instance (dogfood Scenario 1). RED drives a real short verb against a real sidecar and asserts the instance appears; fix the CLI→sidecar delivery for the dispatcher's `invocation.completed` emit without regressing the 036 fail-open/no-exit-delay contract.
- [x] T047 [tier:powerful] Re-run `scripts/dogfood-instance-observability.sh` end-to-end — Scenarios 1–4 all PASS with REAL producers (instance keyed on `host:realpath(install)`, `currentSession`/`currentBearing`/`phaseDurations` populated, ordinary verb creates an instance). Capture the passing evidence. This is the FR-027 acceptance the green suite cannot be.
- [x] T048 [tier:powerful] D-E (dogfood re-run Scenario 3): a real `workflow advance`'s `phase.entered` never reaches the instance (`currentBearing` null, `phase.entered` absent from `recentActivity`), because `emitPhaseEntered` fires a separate long-run emit client with NO delivery-wait and the `workflow advance` CLI exits before that client connects+drains — the D-B class, on the phase-emit path (T044 already proved the sidecar preserves the snapshot when it arrives, so this is delivery, not stripping). Give `emitPhaseEntered` the same bounded deliver-or-budget wait `invocation-telemetry.ts` uses (T046) — bounded/fail-open, never hangs a phase advance when the sidecar is down — threading the await through `emitAdvance`. Apply the same bounded-delivery pattern to `session-events.ts` if it shares the latent fragility (consistency across the three CLI-verb emit helpers). RED-first: a real `workflow advance` against a real sidecar → `currentBearing` populates.

---

## Phase 8: dogfood findings — obvious defects the green suite endorsed

**Found by hands-on dogfooding (operator: "dogfood first, that will uncover the obvious"), before the govern pass.** Examining the real instance JSON an operator sees, not just assertion fields.

- [x] T049 [tier:powerful] `lastActivityAt`/`lastActivity` (+ `firstSeenAt`, `lastHeartbeatAt`) FROZEN at the first event. The instance's headline "what is it doing, and when" field was stale — real evidence: `lastActivityAt` stuck at the first event while `recentActivity[0]` was 14s newer. Root cause: `instance-accumulator.ts` keyed no-regress on `envelope.invocationSequence`, which is PER-INVOCATION (session/phase events set it 0; each invocation restarts its count) — not monotonic across an instance's life. The T016 RED test PINNED this wrong key, so the green suite endorsed it. Fixed RED-first: key on `installationSequence` (instance-monotonic, durable across restarts); corrected T016 to genuinely discriminate the two keys. Dogfood confirms `lastActivityAt == recentActivity[0]` in every snapshot.
- [x] T050 [tier:balanced] `lastHeartbeatAt` never populates — the dogfood runs no long-lived `session.heartbeat` producer, so the liveness axis has no heartbeat input (it currently falls back to activity recency). VERIFY whether a real heartbeat producer is wired end-to-end (sidecar/session loop → `session.heartbeat` → instance fold) over a >45s window; if no producer emits it to the instance registry, that is a gap to close (or the `liveness` derivation should be documented as activity-recency-based). Fold logic is already correct (keyed on `installationSequence`); the question is the producer.
- [ ] T051 [tier:balanced] Unexercised axes: the runs facet returns `{"runs":[]}` (the dogfood never drives a real `execute`/`govern`, so no run exists) and `liveness`/`connection` are always `live`/`attached` (the dogfood is faster than the 90s/10m windows). Extend the dogfood (or a longer-running variant) to drive a real run and to observe a `live`→`stale`→`gone` transition, so those axes are actually dogfooded. Also confirm `connection` reflects real uplink presence vs. the current liveness-approximation (D1 says they are distinct axes).
