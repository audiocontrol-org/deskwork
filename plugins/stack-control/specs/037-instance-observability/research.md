# Phase 0 Research: Instance Observability

Grounded in feature 036's real source (`src/`). Each decision cites the code it builds on. Every plan-time contract is stated so a RED test can pin it before implementation (Constitution Principle I).

## D1 — Plan-time timing/size contracts (the numbers clarify deferred)

**Grounding (036, from source):** the sidecar→plane liveness heartbeat is `DEFAULT_LIVENESS_INTERVAL_MS = 45_000` (`src/sidecar/daemon.ts:190`). SSE keepalive is `15_000` (`stream.ts:100`); the sidecar read-idle watchdog is `45_000` = 3× keepalive (`sse-client.ts:166`). A reconciliation/liveness **window does not exist as a pinned value** — `createReconciliationWindow({windowMs})` (`lifecycle.ts:88`) and `createIdleExit` (`DEFAULT_IDLE_EXIT_MS = 600_000`, `lifecycle.ts:138`) are **test-only, wired into no production caller**. `MAX_EVENT_SNAPSHOT_BYTES = 32*1024` (`event.ts:50`). The spool has no numeric cap constant (caller-supplied) but a fixed drop order live-only < aggregated < durable (`spool/drain.ts:293`).

**Decisions (pinned by RED tests):**

- **Heartbeat interval** — reuse 036's `45_000` ms. Rationale: it is the existing single source; the instance liveness axis reads the same signal, so introducing a second cadence would be incoherent. No new constant.
- **Liveness window (`live` → `stale`)** — `90_000` ms (2× heartbeat). An instance is `live` while a signal has arrived within the last 90 s (i.e. it has not missed ~2 consecutive beats). Rationale: one missed beat is normal jitter; two is a real silence.
- **Reconciliation grace (`stale` → `gone`)** — an instance becomes `gone` after `600_000` ms of silence (10 min), aligned with 036's `DEFAULT_IDLE_EXIT_MS`. Rationale: a sidecar idle-exits at ~10 min, at which point its uplink drops; pinning `gone` to the same horizon makes "presumed gone" coincide with "the daemon that fed it is expected to be down," rather than inventing an unrelated number. `stale` is the band between 90 s and 10 min.
- **`recentActivity` cap `N`** — `50` events, newest-first, in-memory. Rationale: a bounded convenience view (FR-016b), not history; 50 covers a session's recent shape without unbounded growth. A RED test asserts eviction at N+1.
- **Historical/`gone` instance retention** — **no separate eviction policy.** A `gone` instance remains queryable under `?include=all` for as long as the **durable event log** retains its events (retention follows the log, which already governs durability). Rationale: adding a second retention clock is speculative (Principle II); the log is the single retention authority. If the log prunes an instance's events entirely, the instance ages out of `?include=all` naturally.

All five are pinned in `plan-time-constants.ts` (or the nearest existing constants seam) with a RED test asserting each value + the derived state boundaries, mirroring 036's constants-pinned-by-tests pattern.

## D2 — Extending the event classification catalog

**Grounding:** `EVENT_CLASSIFICATIONS: ReadonlyMap<EventType, EventClassification>` (`classification.ts:104-116`); `EventType`/`EventClassification` (`'live-only'|'aggregated'|'durable'`) in `types.ts`; `classifyEvent` **fails loud on unknown types** (`classification.ts:141-154`). `validateEnvelope` checks the `classification` field against the 3-value union, not `type` against the catalog — so new types do not break envelope validation.

**Decision:** add the three new event types as **`durable`** (they are the historical record that lifetime counters and the phase timeline rehydrate from — FR-013):
- `session.started` → `durable`
- `session.ended` → `durable`
- `phase.entered` → `durable`

Edit surface is exactly two points (the seam holds — nothing else decides a class): (a) add each name to the `EventType` union in `types.ts` (compiler-enforced — a type with no catalog entry cannot compile), and (b) add one Map entry each at `classification.ts:104-116`. **Keep the name `aggregated`** (reused shipped vocabulary; the third-party review's rename was declined — see spec). `invocation.completed` stays `aggregated`; the plane simply stops discarding it (D5/D6, Agent B).

## D3 — Extending the event envelope (`host:path` + session id)

**Grounding:** `EnvelopeInput` (`event.ts:59-68`) and `EventEnvelope` (`types.ts:73`) carry `installationId`, `invocationId`, `runId`, sequences, `schemaVersion`, `type`, `classification` — but **no `host`, `path`, or `sessionId`.** `constructEnvelope` (`event.ts:82-100`) is the single construction site; `installationId` is minted by `mintOrReadInstallationId(root)` (UUIDv4, `identity.ts:147`), and the emit site already has `installationRoot` in scope (`invocation-telemetry.ts:78`). `callerKind` is hardcoded `'short-verb'` (`invocation-telemetry.ts:87`).

**Decision:** add three fields to `EnvelopeInput` + `EventEnvelope`: `host`, `path` (the Instance Identity components), and `sessionId: string | null` (null when no session is open — the same shape as `runId`). Populate them in `constructEnvelope` (the one site), derive `host:path` via the new deriver (D-identity, Agent B), and read `sessionId` from the machine-local `current-session` record (D-session, Agent B). Add matching `require*` lines in `validateEnvelope` (`event.ts:206-234`). `schemaVersion` increments (additive fields; old events read `sessionId: null`). `bumpSchema` handled per 036's existing schema-version discipline. Do **not** change `callerKind` handling in this feature except where a producer is genuinely a long-run (out of scope here — observability, not the run producer).

## D4 — The `phase.entered` emit seam (one point)

**Grounding:** phase transitions fire at `applyTransition(...)` (`transition-engine.ts:115`); the **only production caller** is `emitAdvance` in `src/subcommands/workflow-advance.ts:113` (dry-run returns earlier at line 111). At that site `t.to` (a `PhaseId` from `DEFAULT_PHASES` — `designing/specifying/implementing/governing` among them), `t.from`, and `r.item.identifier` are in scope, and `outcome.committed` confirms the landing. No clock is threaded there; the compass lives in `compass.ts`/`compass-resolve.ts`. `EFFECT_VERBS` is a fixed governed palette.

**Decision:** emit `phase.entered` as a **fail-open side emission at the subcommand level** — immediately after the committed `applyTransition` in `emitAdvance` (guarded on `apply === true`), carrying `{phase: t.to, from: t.from, item: r.item.identifier, timestamp}` plus the resolved bearing snapshot. This is the single instrumentation seam for the whole design→spec→execute→govern timeline (FR-012). **Do NOT add telemetry to `EFFECT_VERBS`** — the phase emit is a side effect of advancing, not a governed effect; keeping it at the subcommand preserves the transition-engine's narrow Effect/Transition/git-only contract (Principle IV, division of labor). Thread a `Clock` (as the telemetry path does) and resolve the bearing via the existing compass resolver. The emit is wrapped fail-open so a telemetry failure never fails a real phase advance.

## D5 — Snapshot/payload threading (the sharpest seam — minimal TASK-457 fix)

**Grounding:** `TelemetryEvent = {envelope, snapshot}` (`event.ts:108`), but `toClassifiedEvent` (`ingest.ts:250-257`) copies only `{envelope, classification, type}` — **the snapshot reaches neither the registry nor the durable log** (`ClassifiedEvent`, `registry.ts:77-81`; the log stores `ClassifiedEvent`, `event-log.ts`). So any field carried on the snapshot is lost. `phase.entered` must convey `{phase, item, bearing}` and `session.started` a small session payload — event-specific data, not generic identity.

**Decision:** split the two concerns by where the data belongs:
- **Identity fields (`host`, `path`, `sessionId`) go on the `EventEnvelope`** (D3) — generic, per-event identity, and the envelope already survives the boundary. This is why D3 puts them there rather than on the snapshot.
- **Event-specific payload (`phase.entered`'s `{phase, item, bearing}`) is threaded through the `ClassifiedEvent` + event-log boundary** by carrying the already-validated, already-bounded (`≤ MAX_EVENT_SNAPSHOT_BYTES`) `snapshot` on `ClassifiedEvent` — the minimal resolution of TASK-457, **scoped to what observability needs** (phase/session payloads), not a broad rework. `toClassifiedEvent` copies the snapshot; the event log persists it; `buildInstanceRegistry` folds it. RED test: a `phase.entered` ingested end-to-end yields `{phase,item}` in the instance's `currentBearing`, and survives a rehydrate. This also un-blocks the run-detail facets 036 lost (TASK-457) as a side benefit, but the feature only requires the observability payloads.

## D6 — Instance registry projection + rehydrate

**Grounding:** the run fold trio is `newRunAccumulator`/`applyRunEvent`/`toEntry` driven by `buildRegistry(events)` (`registry.ts:260-388`), no-regress by `invocationSequence`, eventId-deduped; rehydrated via `rehydrateIngestState` (`ingest.ts:219`) wired at `runtime.ts:187-190` off `eventLog.replayed`.

**Decision:** a **new `src/plane/instance-registry.ts`** with `buildInstanceRegistry(events): InstanceState[]`, keyed on `host:path`, paralleling the run trio: fold `session.started/ended`, `phase.entered`, `invocation.completed`, `session.heartbeat` into a per-instance accumulator. No-regress and effectively-once reuse the same sequence discipline (`registry.ts` is the reference). Rehydrates from the **same in-memory `events` array** the run registry replays (`runtime.ts:187`) — no new durable log. Accumulator rules implement the settled behaviors: `currentBearing` = latest `phase.entered` payload, **persisted** through `session.ended` (FR-016c); `phaseDurations` accrue **cumulatively** across re-entries (FR-018); `sessionsStarted/Ended` are counts; `connection`/`liveness` derive from uplink + last-signal recency per D1. Kept a new file (not appended to `registry.ts`, which is 388 lines).

## D7 — Query API + routes

**Grounding:** `ROUTE_TABLE` (`server.ts:105-115`) + `PlaneRouteHandlers` (`server.ts:70-89`); projections in `api.ts` (`fleetSnapshot`, `perRunDetail`, `computeFleetDeltas` — which **already uses `instance-upserted`/`instance-removed` delta vocabulary**, `api.ts:156`); history was split to `history-api.ts` to stay under cap; SSE model is `fleetStreamHandler` (`runtime.ts:254-290`); auth is **per-route** (each handler `withAuth`-wrapped in `guardedConsumer`, `runtime.ts:223-236`).

**Decision:** a **new `src/plane/http/instance-api.ts`** (mirroring the `history-api.ts` split) with `instanceSnapshot` / `instanceDetail` / `instanceRuns` / `computeInstanceDeltas` (reusing the existing `instance-upserted`/`removed` delta vocabulary). Add four rows to `ROUTE_TABLE` + four handler keys: `GET /v1/instances`, `/v1/instances/:id`, `/v1/instances/:id/runs`, `/v1/instances/stream`. **Route-ordering contract (RED test):** the literal `/v1/instances/stream` MUST precede `/v1/instances/:id` in `ROUTE_TABLE` (first-path-match dispatch, `server.ts:298`; the `[^/]+` param would otherwise swallow `stream`). Each new handler is individually `withAuth`-wrapped. The `runs` facet filters the run registry by owning instance; `/v1/fleet` stays as the cross-instance run view. SSE mirrors `fleetStreamHandler`.

## D8 — Identity + auth seam (add `host:path`; do NOT re-key)

**Grounding:** no `host:path` exists today; `installationId` (UUIDv4) is consumed at ~15 sites — emit, sidecar, registry, storage keys `runs/{installationId}/...` (archive writers + `history-api.ts`), the token map/auth (`auth.ts`, `refuseInstallationMismatch` in `runtime-http.ts:177`), per-run detail, serve seed.

**Decision (Agent B's recommendation, adopted):** **keep `installationId` internal; add `host:path` as the instance key; map between them.** Concretely: a **new `src/machine-state/instance-id.ts`** derives `host:path` (`hostname()` + `realpathSync.native(installationRoot)`); `host` + `path` are added to `EventEnvelope`/`constructEnvelope` (D3) and stamped at the two emit sites; `buildInstanceRegistry` keys on them; a **token→`host:path` authorization check** is added alongside the existing UUID `refuseInstallationMismatch`. **Leave unchanged:** the `runs/{installationId}/...` storage layout, `installationIdForRun`, `createTokenRegistry`'s UUID role, and every archive writer. A full re-key of the ~15 sites is **rejected as out of proportion to an observability-only feature** — and unnecessary, since (per the spec) the token, not the identity, is the secret; `host:path` is a legible label the token is authorized to use.

## D9 — Producers' emit locations, and the `runtime.ts` split

- **`current-session` record:** a **new `src/machine-state/current-session.ts`** (mint/read/clear) living in `MachineStateLocation.durableDir` (`locate.ts:73,181`) beside `installation-id`/token — mirrors `identity.ts`.
- **`session.started`/`session.ended`:** the session skills are **thin CLI wrappers** that "add no behavior the CLI lacks," so the mint/clear + emit lands in the **`session-start`/`session-end` CLI verbs**, fail-open (per `session-skills-never-block.md`), reusing the emit path (`invocation-telemetry.ts:124`). `session-start` mints the record + emits `session.started`; `session-end` emits `session.ended` + clears it.
- **Session-id threading:** every `invocation.completed` reads the `current-session` record and stamps `sessionId` on its **envelope** (D3/D5) so it reaches the registry.
- **`phase.entered`:** the subcommand seam in `workflow-advance.ts` (D4).
- **TASK-461 (sidecar `register-run`/`end-invocation` routing) is OUT OF SCOPE** for 037 — Agent B confirms that fan-in is a **control** concern; observability is served by `invocation.completed` + `session.*` + `phase.entered`. Noted so a later control feature owns it.
- **`src/plane/runtime.ts` is already 523 lines — over the 500 cap.** Adding the instance-registry wiring + four handlers would worsen it, so the plan **splits `runtime.ts`** (extract the handler map / SSE handlers into a sibling module) as part of this feature — a required refactor, not optional. Other near-cap files (`registry.ts` 388, `api.ts` 396, `emit.ts` 500, `daemon.ts` 453) are **not** extended; new behavior lands in the new files named in D6/D7/D8/D9.

## Summary of new/changed units (feeds the module split)

- **New:** `machine-state/instance-id.ts` (host:path deriver), `machine-state/current-session.ts`, `plane/instance-registry.ts`, `plane/http/instance-api.ts`, a `plane-time-constants` seam (D1), and a `workflow`/subcommand phase-emit hook (D4).
- **Extended at seams only:** `fleet/types.ts` + `fleet/classification.ts` (catalog, D2), `fleet/event.ts` (envelope fields + validation, D3), `plane/http/ingest.ts` (thread snapshot, D5), `plane/http/server.ts` (4 routes, D7), `machine-state`/auth (token→host:path, D8), `telemetry/invocation-telemetry.ts` (stamp host:path + sessionId, D3/D9), `subcommands/workflow-advance.ts` (phase.entered emit, D4), `subcommands/session-start`+`session-end` verbs (D9).
- **Refactored for the cap:** `plane/runtime.ts` (split; then wire the instance registry + rehydrate + 4 handlers).
