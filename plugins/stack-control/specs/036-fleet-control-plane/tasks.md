# Tasks: Fleet Control Plane

**Feature**: `specs/036-fleet-control-plane` | **Branch**: `feature/fleet-control-plane` | **Date**: 2026-07-16
**Input**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/) · [quickstart.md](./quickstart.md) · [checklists/correctness.md](./checklists/correctness.md)

## Format: `[ID] [P?] [Story] [tier:LABEL] Description`

- **[P]** — parallelizable (different files, no dependency on an incomplete task).
- **[US n]** — the user story this serves. Setup / Foundational / Polish carry no story label.
- **[tier:LABEL]** (035 model-tier annotation) — `fast` → haiku, `balanced` → sonnet, `powerful` → opus, per this installation's `tier_map`. Resolved at `resolve-tiers` time. Heuristic: mechanical / RED-test-only / doc-only → `fast`; standard implementation → `balanced`; cross-cutting, architectural, ambiguous, or high-blast-radius → `powerful`.

## ⚠️ Two deliberate deviations from the template

**1. This is ONE delivery — there is no MVP slice.** The template marks User Story 1 `🎯 MVP` and describes stories as "delivered as an MVP increment." **That framing does not apply here** and is deliberately omitted. Per the project's no-partial-delivery rule and the design record's explicit ruling — it adopted the reviews' four-phase proposal as *task ordering within a single feature delivery* and **rejected it as four separately-shipped features** ("partial implementations get abandoned and later work coral-reefs around the stump") — the phases below are **ordering, not shippable increments**. No phase boundary is a ship point. Checkpoints mark *integration*, not release.

**2. Tests are mandatory, not optional.** The template says tests are optional unless requested. Constitution **Principle I is NON-NEGOTIABLE**: write a failing test, watch it fail for the expected reason, then write minimal code to pass. Every RED task below precedes its implementation and **must be seen failing first**. A test written after implementation passes immediately and proves nothing.

## Conventions

- Installation root: `plugins/stack-control/`. All paths below are relative to it.
- **No `any` / `as` / `@ts-ignore`** (Principle VI). Composition + DI with interface types.
- **Files 300–500 lines** — the module decomposition exists to respect this cap.
- **Real fixtures, not mocks**: real in-process `node:http` servers on ephemeral ports; real sockets, processes, files. *A mock cannot be cruel* — it will not stall without EOF or die mid-frame, which are the failures that matter.
- **Not vitest fake timers** — a verified open bug means they do not fake `performance.now()`, the clock PT-013 depends on. Inject `Clock` instead.

---

## Phase 1: Setup

- [x] T001 [tier:fast] Add `eventsource-parser` and `uuidv7` to `package.json` dependencies. **`uuidv7` is not a preference**: `crypto.randomUUIDv7()` exists only in Node 26.1.0+, this repo declares `"node": ">=20"` and runs 22.19.0 where it is `undefined` (research.md § Identifier generation).
- [x] T002 [P] [tier:fast] Create the domain directory skeleton per plan.md § Structure: `src/{fleet,machine-state,telemetry,sidecar,plane,storage}/` and `tests/fleet/`.
- [x] T003 [P] [tier:fast] Add `STACKCTL_CP_URL` and plane settings to the installation config type in `src/config/types.ts`.

---

## Phase 2: Foundational (blocking — no user story starts before this completes)

### DI seams — load-bearing for every test below

- [x] T004 [P] [tier:balanced] RED: `tests/fleet/clock.test.ts` — pin the injectable `Clock` interface (wall + monotonic reads separated).
- [x] T005 [tier:balanced] Implement `Clock` in `src/fleet/clock.ts`. Wall and monotonic are **distinct operations**; `performance.now()` values are meaningless across processes/hosts (PT-013).
- [x] T006 [P] [tier:balanced] Implement `ProcessProbe` (PID + start-time liveness) in `src/fleet/process-probe.ts`. **Start-time is what defeats PID reuse** (PT-002).
- [x] T007 [P] [tier:balanced] Implement the `SseTransport` interface in `src/sidecar/uplink/transport.ts` so 45s-timeout tests run in microseconds.
- [x] T008 [P] [tier:balanced] Implement the vendor-free object-store port in `src/storage/port.ts`. **Vendor identity confines to the adapter** so Principle III is structurally satisfied, not merely intended.

### Test harness — must exist before any test can be honest

- [x] T009 [tier:powerful] **Machine-local store redirect harness** in `tests/fleet/_machine-state-harness.ts`. **Every test MUST redirect the store to a temp dir.** Non-negotiable: without it a test run mints identity into a real developer's `$HOME` and CI pollutes the agent (plan.md § Complexity Tracking). High blast radius — every later test depends on it.
- [x] T010 [P] [tier:balanced] Real in-process SSE/HTTP server fixture in `tests/fleet/_server-fixture.ts`. **Must be able to be cruel**: stall without EOF, drop mid-frame, emit comment-only frames, return non-200 and wrong `Content-Type`.
- [x] T011 [P] [tier:balanced] Real socket/process fixture in `tests/fleet/_ipc-fixture.ts` — spawn, `SIGKILL`, stale socket files, PID reuse simulation.

### Shared domain — pure, no I/O

- [x] T012 [P] [tier:fast] RED: `tests/fleet/types.test.ts` — identity shapes; `installationId` v4, `eventId`/`invocationId`/`runId` v7 (data-model § Identity).
- [x] T013 [tier:balanced] Implement identity + envelope types in `src/fleet/types.ts`.
- [x] T014 [P] [tier:fast] RED: `tests/fleet/event.test.ts` — envelope construction/validation; the bounded snapshot; **histories are never carried per-event** (FR-045).
- [x] T015 [tier:balanced] Implement envelope construction + validation in `src/fleet/event.ts`.
- [x] T016 [P] [tier:fast] **RED: `eventId` is identity, never an ordering key** — `tests/fleet/event-ordering.test.ts` asserts no ordering path consumes `eventId`. v7's time-ordering *invites* this bug (research.md § Identifier generation).
- [x] T017 [P] [tier:fast] RED: `tests/fleet/status.test.ts` — the three axes are independently readable and **never collapsible** into one authoritative status (FR-029/030).
- [x] T018 [tier:balanced] Implement the three status axes in `src/fleet/status.ts`. `abnormally-disconnected` is a **distinct condition, not an executionStatus value**.
- [x] T019 [P] [tier:fast] RED: `tests/fleet/sequence.test.ts` — two sequences; `installationSequence` **rejected** for domain ordering (FR-041); high-water mark; gap classification lost / in-flight / never-sent (R-04).
- [x] T020 [tier:powerful] Implement sequencing + gap classification in `src/fleet/sequence.ts`. **Gap classification never reads the object store** — classification makes the durable set sparse by design, so absence-of-object ≠ absence-of-event (R-04). Cross-cutting.
- [x] T021 [P] [tier:fast] RED: `tests/fleet/redact.test.ts` — deny-by-default policy; absolute paths, usernames, home segments, hostnames redacted; commit messages and error content length-capped (PT-008).
- [x] T022 [tier:balanced] Implement redaction in `src/fleet/redact.ts`.
- [x] T135 [P] [tier:fast] **RED: event classification — `tests/fleet/classification.test.ts`** (FR-015/016). Every event classifies as **live-only** (never durably stored — heartbeats belong here), **aggregated**, or **durable** (its own immutable object). Assert **classification, not emission, decides cost**: a high-frequency short-verb stream mints **zero** durable objects. *(Added by /speckit-analyze finding C1 — this requirement had no task. Note the word collision that hid it: T019/T020 are **gap** classification, an unrelated concept.)*
- [x] T136 [tier:powerful] **Implement event classification in `src/fleet/classification.ts`** (FR-015/016). The **seam must exist from the start** so adding rollup machinery later changes no contract — rollup itself is not built until volume justifies it. Without this, "every invocation telemeters" silently becomes "every event becomes a cloud object", and an operator with shell completions or an automation loop mints objects at a rate nobody asked for. Consumed by the sidecar pipeline (T086). Cross-cutting: it governs the whole storage economy.
- [x] T137 [P] [tier:fast] **RED: metadata is never identity — `tests/fleet/metadata-not-identity.test.ts`** (FR-036). `hostname`, `platform`, runtime versions, `repositoryRemote`, `workspacePath` are metadata attached to the installation; assert no identity or lookup path consumes them, and that grouping by `repositoryRemote` never confers identity. *(Added by /speckit-analyze finding C4.)*

### Machine-local state (the declared installation-anchor exception)

- [x] T023 [P] [tier:fast] RED: `tests/fleet/machine-state-locate.test.ts` — durable vs ephemeral split; `sha256(realpath.native(root))[0:16]` keying; **UDS path length stays within 103 bytes (macOS) / 107 (Linux)** (PT-001).
- [x] T024 [tier:powerful] Implement store location in `src/machine-state/locate.ts`. Durable (`XDG_STATE_HOME` / Application Support / `%LOCALAPPDATA%`) vs ephemeral (`XDG_RUNTIME_DIR` / `$TMPDIR` / named pipe). **Never under the installation root** — the path-length constraint forces this. Architectural.
- [x] T025 [P] [tier:fast] RED: `tests/fleet/identity-mint.test.ts` — mint once; **a copied/cloned tree re-mints**; two hosts at identical checkout paths **never collide** (FR-031/032/033, SC-014).
- [x] T026 [tier:balanced] Implement mint/read in `src/machine-state/identity.ts`.
- [x] T027 [P] [tier:fast] RED: `tests/fleet/highwater.test.ts` — `installationSequence` **survives restart**, never resets; unrestorable ⇒ **fail loud** (R-02, FR-039).
- [x] T028 [tier:balanced] Implement the high-water mark in `src/machine-state/highwater.ts`.
- [x] T029 [P] [tier:fast] RED: `tests/fleet/reattach.test.ts` — `mv` of an installation re-mints; `reattach` restores identity deliberately (research.md § Open items).
- [x] T030 [tier:balanced] Implement the `reattach` escape hatch in `src/machine-state/identity.ts`.

**Checkpoint** — foundation integrated. *Not a ship point.*

---

## Phase 3: User Story 1 — Emit telemetry without ever taxing the CLI (P1)

**Goal**: the constraint that dominates every other. If emission can tax the CLI, the feature is a net harm regardless of what is built on top.
**Independent test**: measure invocation wall-clock across the full state matrix — plane reachable / unreachable / hanging, sidecar absent / restarting / version-skewed — and confirm no degradation and no failure in any cell.

### RED first

- [x] T031 [P] [US1] [tier:fast] RED: `tests/fleet/fail-open.test.ts` — no sidecar ⇒ **unchanged output, exit code, and wall-clock** vs telemetry-disabled baseline (SC-001/002).
- [x] T032 [P] [US1] [tier:balanced] **RED: plane hanging ⇒ CLI completes at normal speed** — `tests/fleet/fail-open-hang.test.ts`. *This is the test that catches an accidental `await` on the WAN.* There is no timeout to bound because there is no network in the interactive path.
- [x] T033 [P] [US1] [tier:fast] RED: `tests/fleet/local-protocol.test.ts` — frame shapes; version handshake; **mismatch never fails the invocation** (FR-010).
- [x] T034 [P] [US1] [tier:fast] **RED: the bearer token NEVER appears in any frame on the local socket** — `tests/fleet/token-not-on-socket.test.ts` (contracts/local-socket-protocol C2).
- [x] T035 [P] [US1] [tier:balanced] RED: `tests/fleet/spawn-race.test.ts` — N concurrent invocations find no sidecar ⇒ **exactly one** sidecar; all invocations unaffected.
- [x] T036 [P] [US1] [tier:balanced] RED: `tests/fleet/stale-lock.test.ts` — stale socket file recovered; **a recycled PID is not mistaken for a live sidecar**.
- [x] T037 [P] [US1] [tier:fast] RED: `tests/fleet/buffer-asymmetry.test.ts` — short verb gets **no** buffer and drops; long run's bounded buffer covers the restart gap (FR-007).

### Implementation

- [x] T038 [US1] [tier:balanced] Implement the local wire protocol + version handshake in `src/telemetry/protocol.ts`.
- [x] T039 [US1] [tier:powerful] Implement the fail-open emit client in `src/telemetry/emit.ts`. **Connect must fail instantly and never block.** Highest-risk file in the feature: every stackctl invocation runs it.
- [x] T040 [P] [US1] [tier:balanced] Implement the bounded in-memory buffer (long runs only) in `src/telemetry/buffer.ts`.
- [x] T041 [US1] [tier:powerful] Implement the socket/pipe listener + **bind-wins election** in `src/sidecar/server.ts`. `EADDRINUSE` ⇒ someone else won ⇒ exit silently. Atomic at the OS level, which is what makes the election authoritative.
- [x] T042 [US1] [tier:balanced] Implement detached spawn in `src/sidecar/spawn.ts`: `detached` + `stdio:'ignore'` + `unref()` + **`windowsHide: true`**. **`windowsHide` is mandatory, not cosmetic** — a detached Windows child otherwise gets a console window that cannot be disabled; every canonical snippet omits it because none are about daemons.
- [x] T043 [US1] [tier:balanced] Implement stale-socket recovery in `src/sidecar/server.ts` using `ProcessProbe` (PID + start-time), then unlink and re-bind.
- [x] T044 [US1] [tier:fast] Wire telemetry emission into the CLI dispatcher in `src/cli.ts` — **every invocation emits** (FR-012), and none may block.
- [x] T138 [US1] [tier:balanced] **Support running the sidecar under external supervision** (FR-009) — a supervised long-lived process (launchd/systemd) as an alternative to auto-spawn, **without changing the local socket contract**. Auto-spawn exists because a forgotten daemon is a silent gap that erodes trust in the fleet view; supervision exists for operators who want a predictable lifecycle. Both must reach the same contract. *(Added by /speckit-analyze finding C2 — this requirement had no task.)*

**Checkpoint** — US1 integrated. *Not a ship point.*

---

## Phase 4: User Story 2 — Aggregate the whole fleet into one live, queryable view (P2)

**Goal**: the feature's headline value — every commandable run across every host in one live view, exposed over the plane's API.
**Independent test**: register commandable runs across multiple installations/hosts; drive the API exactly as a dashboard would; each run appears exactly once and progress arrives as deltas.

### RED first

- [x] T045 [P] [US2] [tier:fast] RED: `tests/fleet/registry.test.ts` — one entry per commandable run; **short verbs are never fleet entries** while their timings stay retrievable (FR-013/014).
- [x] T046 [P] [US2] [tier:fast] RED: `tests/fleet/api-snapshot.test.ts` — one request returns **every** commandable run across installations, **exactly once**, no per-host request (SC-003).
- [x] T047 [P] [US2] [tier:balanced] RED: `tests/fleet/api-deltas.test.ts` — progress arrives as a **delta**; **no full registry push per telemetry event** (FR-081).
- [x] T048 [P] [US2] [tier:fast] RED: `tests/fleet/api-axes.test.ts` — the three axes are separately readable over the API; no collapsed authoritative status.
- [x] T049 [P] [US2] [tier:fast] RED: `tests/fleet/artifact-refs.test.ts` — refs are **never** `file://` and never absolute host paths (PT-009).

### Implementation

- [x] T050 [US2] [tier:powerful] Implement the live registry in `src/plane/registry.ts`. **Derived, not authoritative** — the sidecars are (PT-007). Architectural.
- [x] T051 [US2] [tier:balanced] Implement the `node:http` server + router in `src/plane/http/server.ts`. No framework — this repo has zero network dependencies today.
- [x] T052 [US2] [tier:balanced] Implement telemetry ingest in `src/plane/http/ingest.ts` — dedupe by `eventId`, no-regress from an older sequence, late events stored durably.
- [x] T053 [US2] [tier:balanced] Implement snapshot + delta endpoints in `src/plane/http/api.ts` per contracts/plane-client-api § Route shape.
- [x] T054 [US2] [tier:balanced] Implement per-run detail (overview / artifacts / execution / governance / timings / reconciliation) in `src/plane/http/api.ts`.
- [x] T055 [P] [US2] [tier:fast] Implement structured errors in `src/fleet/types.ts` — `{code, message, task, timestamp, recoverable}`; details fetched on demand, **never carried in the fleet payload** (FR-046).

**Checkpoint** — US2 integrated. *Not a ship point.*

---

## Phase 5: User Story 3 — Act on a run and always know what happened (P3)

**Goal**: the operator can always tell what happened to a command they issued. "Sent" is never reported as "applied."
**Independent test**: issue each command type against runs in each reachable/unreachable state; the state machine is observable end-to-end and never reports a state stronger than what occurred.

### RED first

- [x] T056 [P] [US3] [tier:fast] RED: `tests/fleet/command-machine.test.ts` — accepted → delivered → received → applied, with rejected/failed/expired/superseded terminal (FR-050).
- [x] T057 [P] [US3] [tier:balanced] **RED: `accepted` survives plane restart** — `tests/fleet/command-durable-accept.test.ts`. The plane records durably *before* answering `accepted`; a `cancel` accepted a second before restart must not vanish (FR-056).
- [x] T058 [P] [US3] [tier:balanced] **RED: `cancel` during a network blip is applied on reconnect** — `tests/fleet/command-blip.test.ts`. The one destructive command; a silent no-op here is the worst failure in the design (SC-007).
- [x] T059 [P] [US3] [tier:fast] RED: `tests/fleet/command-expiry.test.ts` — expiry is a **visible terminal state**, not a vanishing (FR-055).
- [x] T060 [P] [US3] [tier:fast] **RED: a delivered-but-unapplied command never looks complete** — `tests/fleet/command-vs-cursor.test.ts`. Stream replay position is **not** command status (FR-058).
- [x] T061 [P] [US3] [tier:fast] RED: `tests/fleet/supersession.test.ts` — `resume` supersedes un-applied `pause`; two `cancel`s **deduplicate**; newer `config-push` supersedes older. **Per-command, never generic** (FR-057).
- [x] T062 [P] [US3] [tier:fast] RED: `tests/fleet/command-idempotence.test.ts` — re-delivery of an applied command is harmless (FR-054).
- [x] T063 [P] [US3] [tier:fast] RED: `tests/fleet/fanout.test.ts` — response reports targets/accepted/unavailable; **never presented as atomic** (FR-062).
- [x] T064 [P] [US3] [tier:fast] RED: `tests/fleet/pause-cooperative.test.ts` — requested-vs-applied observable (FR-059).
- [x] T065 [P] [US3] [tier:fast] RED: `tests/fleet/reconcile-lifecycle.test.ts` — own received/started/completed/failed; results linked by `commandId`; a single ack does **not** represent it (FR-061).
- [x] T066 [P] [US3] [tier:balanced] RED: `tests/fleet/config-push.test.ts` — schema version, validation, allowed-key set, apply-timing, persistence, **compare-and-set prevents lost updates** (FR-060).

### Implementation

- [x] T067 [US3] [tier:powerful] Implement the command state machine in `src/fleet/command.ts`. Cross-cutting — the operator-promise surface.
- [x] T068 [P] [US3] [tier:balanced] Implement per-command supersession rules in `src/fleet/supersession.ts`.
- [x] T069 [US3] [tier:powerful] Implement the durable command store in `src/plane/commands/store.ts` — **durable BEFORE `accepted` is returned**; authoritative across restart.
- [x] T070 [US3] [tier:balanced] Implement buffer / replay / expiry / fan-out in `src/plane/commands/dispatch.ts`.
- [x] T071 [US3] [tier:balanced] Implement command endpoints in `src/plane/http/api.ts` (issue, status by `commandId`, fleet-wide).
- [x] T072 [US3] [tier:balanced] Implement cooperative `cancel` at task boundaries in `src/execute/` — **ends the run, not the invocation**; no forced child termination (that is the future `terminate` verb); does **not** time out — stays visibly `cancelling` (PT-011).
- [x] T073 [US3] [tier:balanced] Implement `config-push` application with compare-and-set in `src/plane/commands/dispatch.ts`.

**Checkpoint** — US3 integrated. *Not a ship point.*

---

## Phase 6: User Story 4 — Trust what the fleet says, including about failure (P4)

**Goal**: discharge the design's primary named risk — a fleet view that lies is worse than no fleet view.
**Independent test**: induce each ambiguous condition and confirm the surfaced state matches what is actually known, with no overclaim.

### RED first

- [x] T074 [P] [US4] [tier:balanced] RED: `tests/fleet/liveness-closure.test.ts` — `kill -9` ⇒ `abnormally-disconnected` **within milliseconds**, reason **unknown**, never `crashed`; no TTL/poll contributes latency (SC-004).
- [x] T075 [P] [US4] [tier:powerful] **RED: sidecar restart with N healthy runs ⇒ 0 false deaths** — `tests/fleet/sidecar-restart-no-false-death.test.ts`. Every socket closes at once while nothing died; a sidecar concluding "all my runs crashed" would be maximally wrong at the worst moment. *The single most important honesty test in the feature.*
- [x] T076 [P] [US4] [tier:balanced] RED: `tests/fleet/reconciliation-window.test.ts` — re-announcement inside the window ⇒ alive; miss ⇒ presumed gone **only then**.
- [x] T077 [P] [US4] [tier:fast] RED: `tests/fleet/uncommandable.test.ts` — connection lost while executing ⇒ **temporarily uncommandable**, never healthy (FR-006).
- [x] T078 [P] [US4] [tier:fast] **RED: store health always names the hop** — `tests/fleet/store-health.test.ts`. Uplink vs archive surfaced independently; "degraded" must answer *which* (FR-074).
- [x] T079 [P] [US4] [tier:balanced] RED: `tests/fleet/dedupe-reorder.test.ts` — duplicate + reordered delivery ⇒ correct state; registry **never walks backward** (SC-015).
- [x] T080 [P] [US4] [tier:balanced] **RED: `SIGKILL` mid-spool loses no records** — `tests/fleet/wal-crash.test.ts`. *The original "must not exit holding an un-flushed spool" phrasing could not pass this by construction — `SIGKILL` runs no code* (R-03).
- [x] T081 [P] [US4] [tier:fast] RED: `tests/fleet/delivery-semantics.test.ts` — at-least-once / idempotent / effectively-once documented and pinned; **never exactly-once** (FR-043).
- [x] T139 [P] [US4] [tier:balanced] **RED: ingestion stays correct with the dedupe set ABSENT** — `tests/fleet/dedupe-is-optional.test.ts` (FR-042a). Disable dedupe entirely, replay duplicates, assert the registry is still correct — because FR-042's no-regress rule plus deterministic object naming (FR-063) and byte-identity (FR-049) carry correctness on their own. *(Added by /speckit-analyze finding C3: FR-042a asserts dedupe is an optimization, but T052 implements it and T079 tests it PRESENT — nothing tested the claim itself. Pinning it stops the next engineer agonizing over the dedupe window's TTL as though correctness depended on it.)*

### Implementation

- [x] T082 [US4] [tier:powerful] Implement liveness interpretation in `src/sidecar/liveness.ts`. **Closure proves disconnection, not death.** The design's primary risk lives here.
- [x] T083 [US4] [tier:balanced] Implement the reconciliation window in `src/sidecar/lifecycle.ts` — must comfortably exceed sidecar restart + reconnect (PT-010).
- [x] T084 [US4] [tier:powerful] Implement the **crash-safe WAL spool** in `src/sidecar/spool/wal.ts` — records durable before acknowledgement; replay on restart (R-03).
- [x] T085 [US4] [tier:balanced] Implement drain / bounded backoff / **drop policy naming what is discarded first** in `src/sidecar/spool/drain.ts` (FR-017).
- [x] T086 [US4] [tier:balanced] Implement the sidecar pipeline in `src/sidecar/pipeline.ts` in **exactly** this order: receive → validate → normalize+redact → assign `eventId`+sequence → **spool** → transmit. **Redaction precedes spooling** or raw data persists on disk (FR-048); this also yields byte-identity (FR-049), which is what makes replay sound.
- [x] T087 [P] [US4] [tier:balanced] Implement two-hop health in `src/plane/health.ts` (FR-074).
- [x] T088 [US4] [tier:balanced] Implement idle-exit (~10 min) in `src/sidecar/lifecycle.ts` — **safe by construction** given the WAL; graceful shutdown is a latency optimization, not a correctness guarantee (PT-003).

**Checkpoint** — US4 integrated. *Not a ship point.*

---

## Phase 7: User Story 5 — Serve history without amplifying the capped store (P5)

**Goal**: history is the durable payoff; read economics are the constraint. Any read path that amplifies capped transactions is a defect.
**Independent test**: drive repeated and varied historical reads; capped-store transactions stay flat rather than scaling with client traffic.

> **Do not re-derive the read-cap premise from a vendor pricing page.** B2 Class B reads **are** aggressively capped (operator ground truth, production experience). The public pricing page reads "Cost: Free" and has already produced this exact false positive from two independent agents. See research.md § *Do NOT re-derive*.

### RED first

- [x] T089 [P] [US5] [tier:fast] **RED: object key is `{invocationSequence zero-padded}.json` with `eventId` INSIDE** — `tests/fleet/object-key.test.ts`. Asserts sequence probing is constructible **and** that keys sort lexicographically (`2` before `10`). *Two independent defects, found by two agents with different lenses* (R-01).
- [x] T090 [P] [US5] [tier:fast] RED: `tests/fleet/live-no-cloud-read.test.ts` — live views ⇒ **0** durable-store reads (SC-009).
- [x] T091 [P] [US5] [tier:balanced] RED: `tests/fleet/read-amplification.test.ts` — repeated/varied history reads ⇒ capped-store transactions **flat** as client traffic scales (SC-008).
- [x] T092 [P] [US5] [tier:fast] **RED: no route accepts a query shape that shards the cache key** — `tests/fleet/cache-key-cardinality.test.ts`. Path-only keys make an uncanned query **unrepresentable**, not merely discouraged (FR-069).
- [x] T093 [P] [US5] [tier:balanced] RED: `tests/fleet/late-event.test.ts` — late event after finalization ⇒ **new object**, new derived revision, **0 published objects mutated** (SC-010, FR-066).
- [x] T094 [P] [US5] [tier:fast] **RED: 404s on the probe path are not cached** — `tests/fleet/probe-404.test.ts`. A cached "doesn't exist" stalls the plane when the event lands a second later. *The one deliberate no-cache carve-out in an otherwise cache-forever design* (PT-005).
- [x] T095 [P] [US5] [tier:balanced] RED: `tests/fleet/manifest-reconcile.test.ts` — a **lost manifest write is a lie of omission**; the listing backstop is the only thing that catches it (R-04, PT-004).

### Implementation

- [x] T096 [US5] [tier:balanced] Implement the B2 adapter in `src/storage/b2.ts` behind `storage/port.ts`.
- [x] T097 [US5] [tier:powerful] Implement the archive writer in `src/plane/archive/writer.ts` — immutable per-event objects, zero-padded key, manifests written **strictly after** event PUTs ack (ordering is the contract).
- [x] T098 [US5] [tier:powerful] Implement derived artifacts in `src/plane/archive/derived.ts` — **revision-in-the-key, never purge**. Purge is eventually consistent, so there is a real window where stale IS served; a new revision is a new URL, so staleness is unrepresentable (PT-005).
- [x] T099 [US5] [tier:balanced] Implement the CDN reader in `src/storage/cdn-reader.ts` — canned low-cardinality reads, sequence probing, `Cache-Control: public, max-age=31536000, immutable`, **404 bypass**.
- [x] T100 [US5] [tier:balanced] Implement the reconciliation backstop in `src/plane/archive/reconcile.ts` — listing **demoted, not deleted**; off the hot path. Do not let a future reader remove it.
- [x] T101 [US5] [tier:balanced] Implement history + timings endpoints in `src/plane/http/api.ts` — design/spec/execution/governance durations (FR-085).
- [x] T102 [US5] [tier:fast] Document the required Cloudflare configuration in `specs/036-fleet-control-plane/quickstart.md`: `.json` cache-eligibility rule, **Transform Rule (a security control — without it the hostname is an open proxy to every other bucket on the origin)**, Full (strict) TLS, Smart Tiered Cache.

**Checkpoint** — US5 integrated. *Not a ship point.*

---

## Phase 8: User Story 6 — Operate the fleet safely across a hostile network (P6)

**Goal**: the plane is network-exposed by construction; hosts are behind NAT.
**Independent test**: connections refused without valid credentials/TLS; no CLI process holds credentials; connectivity established from behind NAT with no inbound reachability.

### RED first

- [x] T103 [P] [US6] [tier:fast] RED: `tests/fleet/sse-parse.test.ts` — framing incl. **chunk-boundary splits**; `id:`/`data:`/`event:`/`retry:`; comment frames.
- [x] T104 [P] [US6] [tier:balanced] **RED: keepalive comment frames re-arm the read-idle watchdog** — `tests/fleet/sse-keepalive.test.ts`. *The likeliest implementation bug in the feature; it fails silently as a mystery disconnect every ~45s.*
- [x] T105 [P] [US6] [tier:fast] RED: `tests/fleet/sse-last-event-id.test.ts` — `Last-Event-ID` is sent as a **request header**, not a query param; the buffer **persists across events that omit `id:`**.
- [x] T106 [P] [US6] [tier:fast] RED: `tests/fleet/sse-terminal.test.ts` — non-200 / wrong `Content-Type` / 401 / 403 ⇒ **terminal, no retry loop** (an invalid token will not fix itself).
- [x] T107 [P] [US6] [tier:balanced] RED: `tests/fleet/backoff.test.ts` — full jitter; server `retry:` **reseeds** base; cap 30s; reset after 60s healthy.
- [x] T108 [P] [US6] [tier:powerful] **RED: telemetry POSTs are NOT head-of-line blocked by the SSE stream** — `tests/fleet/no-head-of-line.test.ts`. **Must pass before the transport topology is fixed.** The head-of-line reasoning is *inference, not verified* (research.md § Transport topology).
- [x] T109 [P] [US6] [tier:fast] RED: `tests/fleet/auth.test.ts` — unauthenticated refused; **revoked token refused, never downgraded** to anonymous/partial (FR-088).
- [x] T110 [P] [US6] [tier:fast] RED: `tests/fleet/no-creds-in-cli.test.ts` — **0** credentials in any CLI process (SC-011).
- [x] T111 [P] [US6] [tier:fast] RED: `tests/fleet/spool-redacted.test.ts` — **0** raw un-redacted values on disk (SC-013).

### Implementation

- [x] T112 [US6] [tier:powerful] Implement the SSE client connection loop in `src/sidecar/uplink/sse-client.ts` over the injected transport, using `eventsource-parser` for **framing only**. We own the loop — reconnect is not free outside a browser.
- [x] T113 [US6] [tier:balanced] Implement reconnect + cursor advancement in `src/sidecar/uplink/reconnect.ts`. **The cursor is not command status** (FR-058).
- [x] T114 [US6] [tier:balanced] Implement the telemetry POST dispatcher in `src/sidecar/uplink/post.ts` — **separate connection**; two connections is the baseline (contracts/sidecar-plane-protocol C2).
- [x] T115 [US6] [tier:balanced] Implement the plane's SSE-out + **15s keepalive comment frames** in `src/plane/http/stream.ts`.
- [x] T116 [US6] [tier:balanced] Implement session liveness (sidecar → plane), **distinct from transport keepalive**; neither infers run liveness (FR-022/023/024).
- [x] T117 [US6] [tier:balanced] Implement bearer-token auth in `src/plane/http/auth.ts` — per-installation; revocation without re-crediting the fleet (FR-076/088).
- [x] T118 [P] [US6] [tier:balanced] Implement token custody in `src/machine-state/token.ts` — `0600`, machine-local, **never crosses the socket** (the Windows NULL-DACL consequence).
- [x] T119 [US6] [tier:balanced] Implement the operator-run token provisioning verb (PT-015) in `src/subcommands/plane.ts`.

**Checkpoint** — US6 integrated. *Not a ship point.*

---

## Phase 9: Front Door, Isolation Boundary & Cross-Cutting

> **T120–T123 are NOT optional and NOT follow-ups.** `check-front-door` enforces skill↔verb parity **in both directions** and is a **hard gate inside `/stack-control:define`**. Shipping the verbs without registering surfaces + skills takes it RED and **refuses the next feature's define**. It is clean at 65 operations today.

- [x] T120 [tier:fast] RED: extend `src/__tests__/cli-help/` coverage so `sidecar --help` and `plane --help` exit 0 with a usage body (C2b).
- [x] T121 [tier:balanced] Register the `sidecar` and `plane` verbs in `src/cli-help/surfaces/fleet.ts` and wire into `src/cli-help/mounted-verbs.ts`; declare each node's mediation class.
- [x] T122 [P] [tier:balanced] Author `skills/sidecar/SKILL.md` — thin adapter quoting the verb, adding **no behavior the CLI lacks**.
- [x] T123 [P] [tier:balanced] Author `skills/plane/SKILL.md` — same discipline.
- [x] T124 [tier:fast] Wire `sidecar`/`plane` dispatch in `src/cli.ts` and `src/subcommands/{sidecar,plane}.ts`.
- [x] T125 [tier:fast] Run `stackctl check-front-door` — **must exit 0 with 0 gaps**. A gap here blocks the next feature's define.

### The isolation exception must be able to fail

- [x] T126 [tier:powerful] **Extend `src/__tests__/installation-isolation-probe.test.ts` to bound the declared exception.** The probe snapshots only the **fixture's outer repo**, so machine-local writes to `$HOME` would pass **silently — for the wrong reason**, which is worse than failing. Assert the machine-local store is the **only** outside-tree write, and that the installation tree receives **nothing**. High blast radius: this probe is the constitution's permanent enforcement.
- [x] T127 [tier:fast] Audit every new test for the T009 machine-local redirect — **a test run must never mint identity into a real developer's `$HOME`**.

### Dogfood loop — the feature's primary verification path (FR-087 / SC-018)

- [x] T128 [tier:powerful] **Drive every quickstart.md scenario headlessly against a running sidecar + plane.** Any scenario not drivable from a terminal is a **defect**, not a documentation gap. This is the requirement, not a nicety.
- [~] T129 [tier:balanced] **Measure the CDN cache-hit rate — do not infer it.** Cloudflare does not cache `.json` by default; without the cache rule the hit rate is **zero while the data stays correct**, so the shield looks like it works and shields nothing (quickstart § Scenario 5).
- [x] T130 [tier:fast] Capture dogfood friction in the backlog as it surfaces — one friction per entry, per `.claude/rules/agent-discipline.md`.

### Polish

- [x] T131 [P] [tier:fast] Verify every source file is within the 300–500 line cap (Principle VI); refactor any that exceed it.
- [x] T132 [P] [tier:fast] Verify **no `any` / `as` / `@ts-ignore`** across all new code; `tsc --noEmit` clean.
- [x] T133 [P] [tier:fast] Confirm `T_SETTLE` is **derived from the backoff schedule**, not a magic number (research.md § Open items).
- [x] T134 [tier:balanced] Full suite green: `npm test`. **The suite is the floor, not the proof** — T128's dogfood loop is the primary evidence.

---

## Dependencies

```
Phase 1 (Setup)
   └─► Phase 2 (Foundational)  ← T009 harness blocks EVERY later test
          ├─► Phase 3 (US1 — fail-open)        ← the dominant constraint
          ├─► Phase 4 (US2 — aggregation)      ← needs registry + ingest
          │      └─► Phase 5 (US3 — commands)  ← needs the API surface
          ├─► Phase 6 (US4 — trust/failure)    ← needs spool + liveness
          ├─► Phase 7 (US5 — history)          ← needs archive + storage port
          └─► Phase 8 (US6 — hostile network)  ← needs uplink
                 └─► Phase 9 (front door, isolation, dogfood)
```

**Ordering, not slices.** No arrow above is a ship boundary.

**Hard sequencing constraints:**
- **T009 before every test.** Without the redirect harness, tests mint into a real `$HOME`.
- **T108 before T112/T114.** The head-of-line hazard is *inference*; the topology must not be fixed until the test says.
- **T089 before T097.** The object key must be right before objects exist — the fix is a rename now, a migration later.
- **T125 must exit 0 before this feature is considered done** — a RED front door blocks the next feature.

## Parallel opportunities

- **Phase 2**: T004, T006, T007, T008 (distinct DI seams); T012/T014/T016/T017/T019/T021 (distinct RED files).
- **Phase 3**: T031–T037 all `[P]`.
- **Phase 5**: T056–T066 all `[P]` — the command RED suite is broad and independent.
- **Phase 8**: T103–T111 all `[P]`.
- Implementation tasks within a phase are mostly **serial** where they share a file (`src/plane/http/api.ts` is touched by T053/T054/T071/T101 — do not parallelize those).

## Task summary

| Phase | Tasks | Count |
|---|---|---|
| 1 — Setup | T001–T003 | 3 |
| 2 — Foundational | T004–T030, T135–T137 | 30 |
| 3 — US1 fail-open (P1) | T031–T044, T138 | 15 |
| 4 — US2 aggregation (P2) | T045–T055 | 11 |
| 5 — US3 commands (P3) | T056–T073 | 18 |
| 6 — US4 trust/failure (P4) | T074–T088, T139 | 16 |
| 7 — US5 history (P5) | T089–T102 | 14 |
| 8 — US6 hostile network (P6) | T103–T119 | 17 |
| 9 — Front door / isolation / dogfood / polish | T120–T134 | 15 |
| **Total** | | **139** |

### Note on T135–T139: document order is execution order

These five were added by `/speckit-analyze` (findings C1–C4) to close **real coverage gaps** — requirements with zero tasks. They are placed in their **correct phase**, so their IDs are **not** monotonic with document order.

That is deliberate. Task IDs are **stable identifiers**, not a sort key: **document order is execution order**. Renumbering to restore monotonicity would rewrite 134 IDs and break the cross-references in § Dependencies (T009, T089, T108, T125, T126) — churn with a real chance of introducing exactly the kind of error the renumber was meant to tidy. The tier parser accepts `T\d+` only, so letter suffixes (`T019a`) would fail to parse and were not an option.

**Tier distribution** (re-derived from the file after the analyze additions, not estimated): `fast` **55** · `balanced` **66** · `powerful` **18** = 139. Every task carries exactly one tier tag; `resolve-tiers` resolves all 139 against this installation's `tier_map`, and emits them in **document order** (verified: `… T022 T135 T136 T137 T023 …`), which is what makes the non-monotonic IDs safe.

The `powerful` tier is reserved for genuinely cross-cutting or high-blast-radius work — the fail-open emit client (every invocation runs it), the liveness interpretation (the design's primary risk), the WAL, the durable command store, the live registry, the machine-state locator, the sequencing/gap classifier, the isolation probe extension, the dogfood drive, and the head-of-line test that gates the transport topology.

**No MVP scope is offered.** This is one delivery (see § Deviations).
