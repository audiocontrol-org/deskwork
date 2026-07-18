# Feature Specification: Instance Observability

**Feature Branch**: `feature/fleet-control-plane` (numbered spec dir on the program's long-lived branch)

**Created**: 2026-07-18

**Status**: Draft

**Input**: Design record `plugins/stack-control/docs/superpowers/specs/2026-07-18-instance-observability-design.md` (roadmap item `design:feature/instance-observability`, design-approved). That record is the authoritative source of intent; its decisions are settled and are carried, not re-derived, here.

## Context

Feature 036 (Fleet Control Plane) built the plane's transport — sidecar election, the crash-safe spool WAL, the uplink, the HTTP plane scaffolding, the fail-open emission path, the event classification seam, and bearer auth — under a **run-centric** model: the fleet is a table of commandable `execute`/`govern` runs, and the registry builds rows only from `run.*` events. That transport is real and tested, and is reused wholesale here. Two limits of the *model* motivate this feature: the producers that would emit real lifecycle telemetry were never wired (so real activity does not populate the plane), and — more fundamentally — the run is the wrong root object.

The reframe that motivates this feature: **"Control starts at observability. You cannot control something you cannot observe."** The unit worth observing is not a run — it is the **instance**: every connected sidecar/worktree and its live state. Runs are one facet of an instance's activity, not the center. The immediate goal is not to answer every possible question — it is to **start collecting real telemetry** so we can reason about what is answerable now and what data is still missing.

The new work is therefore the producers that emit real lifecycle telemetry, an instance-registry projection, and a read-only query API — all built on the reused transport.

### Scope boundary — observability, not control

**Operator scope decision, 2026-07-18.** This feature is **observability only**: telemetry collection, a per-instance registry, and a **read-only** query API. The deliverable is "ask the plane for every connected instance and its current state," with enough real telemetry flowing to reason from data.

**Out of scope, by explicit decision — a named follow-on, not a dropped requirement:** *issuing commands or control* against instances (pause/cancel/reconcile/config-push and any state-changing action on an observed instance). Control is built on top of observability once we can see. Nothing here forecloses it; the identity, event, and registry model are shaped so control layers on cleanly.

### Relationship to the prior fleet control plane (036)

This feature reuses feature 036's transport wholesale (named above) and **inverts its model**: where 036 made the run the root object and the fleet a table of runs, this makes the **instance** the root and 036's runs a **facet** of an instance (see the runs-as-facet requirement, FR-025). The two are one continuous body of work on the same plane, not competing designs.

## User Scenarios & Testing *(mandatory)*

### How to read the priorities

Priorities (P1…P3) denote **task ordering within a single feature delivery** and mirror the design record's 3-step collection order. They are not a scope cut and not separately-shipped increments. Each is an independently demonstrable slice: implementing P1 alone yields a viable surface (instances with last-activity), and P2/P3 enrich it.

### User Story 1 - Ask the plane for every connected instance and what it last did (Priority: P1)

An operator, from anywhere, asks the control plane for every connected instance and its current state, without switching terminal context to each machine. The first, cheapest slice answers: which instances exist, whether each is connected, what each last did, and when — sourced by no longer discarding telemetry the plane already receives.

**Why this priority**: This is the observability foundation — the headline deliverable and the surface every later enrichment hangs on. It also proves the discipline 036 failed: real instances appearing from real invocations, not injected events.

**Independent Test**: With a real sidecar and plane running, run ordinary `stackctl` verbs in one or more installations, then `GET /v1/instances` and confirm each real instance appears exactly once with its identity (`host:path`), connection/liveness, and its most recent activity (which verb, when) — driven end-to-end, never from synthetic events.

**Acceptance Scenarios**:

1. **Given** a running sidecar + plane and a real `stackctl` invocation in an installation, **When** a client requests `GET /v1/instances`, **Then** that installation appears as exactly one instance keyed by `host:path`, carrying `connection`, `liveness`, `lastActivityAt`, and `lastActivity` (the verb it ran).
2. **Given** two installations on two hosts both active, **When** a client requests `GET /v1/instances`, **Then** both appear, each exactly once, keyed by distinct `host:path`, from a single request with no per-host call.
3. **Given** the same checkout path exists on two different machines, **When** both are active, **Then** they appear as two distinct instances (the `host` component disambiguates), with zero identity collision.
4. **Given** an instance whose sidecar has disconnected, **When** a client requests `GET /v1/instances`, **Then** it is reported `disconnected` (not absent) under `?include=all`, and excluded from the default connected view.
5. **Given** a real invocation stream, **When** telemetry emission runs, **Then** no invocation is ever slowed, blocked, or failed by plane/sidecar/network state (the 036 fail-open contract is preserved unchanged).

### User Story 2 - See an instance's sessions and their history (Priority: P2)

An operator asks how many sessions an instance has started and ended, whether one is open right now and since when, and when the last session began — where a **session is the span from `/stack-control:session-start` to `/stack-control:session-end`** (a stack-control construct, not the Claude Code session).

**Why this priority**: Sessions are the operator's unit of "sitting down to work"; session history is the first layer of real reasoning about an instance's activity over time. It requires the session lifecycle producers (design-record Step 2).

**Independent Test**: Run a real `/stack-control:session-start`, some verbs, and a real `/stack-control:session-end` in an installation; confirm `GET /v1/instances/{id}` reports the session lifecycle (an open session while active, `sessionsStarted`/`sessionsEnded` counts, `firstSessionAt`), and that the counts survive a plane restart.

**Acceptance Scenarios**:

1. **Given** a real `/stack-control:session-start`, **When** `GET /v1/instances/{id}` is requested, **Then** `currentSession` reports `{sessionId, startedAt}` and `sessionsStarted` increments.
2. **Given** invocations run between session-start and session-end, **When** their telemetry is observed, **Then** each is attributed to the open session's id.
3. **Given** a real `/stack-control:session-end`, **When** state is read, **Then** `currentSession` is cleared and `sessionsEnded` increments.
4. **Given** a session-start with no matching session-end (crash, or the operator walks away), **When** state is read, **Then** the instance shows a session **open since X** as a first-class state — never an error, never blocking the session verbs.
5. **Given** session events have been recorded and the plane is then restarted, **When** state is read, **Then** lifetime counters (`sessionsStarted`/`sessionsEnded`, `firstSessionAt`) are unchanged — rehydrated from the durable event log.

### User Story 3 - See an instance's current bearing and phase-duration timeline (Priority: P3)

An operator asks what an instance's current compass bearing is (which lifecycle phase, on which item) and how long its design / spec / execution / governance phases have taken.

**Why this priority**: Bearing and phase durations are the richest reasoning layer and depend on instrumenting the workflow phase transitions (design-record Step 3). They complete the "what is this instance doing, and for how long across its whole life" view.

**Independent Test**: Drive a real phase transition (e.g. an `implementing → governing` move through the workflow) in an installation; confirm `GET /v1/instances/{id}` reports the updated `currentBearing` and accrues the corresponding entry in `phaseDurations`.

**Acceptance Scenarios**:

1. **Given** a real workflow phase transition, **When** state is read, **Then** `currentBearing` reflects the new phase and the item it applies to.
2. **Given** an instance that has moved through phases over time, **When** state is read, **Then** `phaseDurations` reports design / spec / execution / governance durations, honestly marking any phase not yet observed as absent rather than fabricating a zero.
3. **Given** phase events recorded and the plane restarted, **When** state is read, **Then** the phase timeline is unchanged (rehydrated from the durable log).

### Edge Cases

- **Same-machine, two worktrees** at different paths → two distinct instances (different `path`).
- **Worktree moved or renamed** → a new instance identity; prior history remains under the old `host:path` (a moved worktree is a new location — defensible, documented).
- **Hostname drift** (DHCP/VM rename) → a new instance identity. A configured stable host-id override is a recorded open question, not built here.
- **A second `/stack-control:session-start` while a session is open** → supersede the open session and mark the prior one abandoned (leaning supersede; recorded as an open question for the plan).
- **Plane restart with live instances** → instances re-announce; lifetime counters rehydrate from the durable event log; no false "gone" conclusion from the bounce alone.
- **Late or reordered events** → registry never regresses an instance to an earlier state (the 036 no-regress/effectively-once ingest contract is reused).
- **Emission when the sidecar or plane is unreachable** → the invocation is unaffected; telemetry is spooled or dropped per the existing fail-open rules; the CLI is never informed.

## Requirements *(mandatory)*

### Functional Requirements

**Identity**

- **FR-001**: The system MUST identify each instance by a stable **Instance Identity** — a git-safe, collision-free, human-legible identifier. Its **current derivation** is `host:path` (the machine hostname plus the canonicalized (`realpath`) installation-root path); the derivation MAY later evolve (e.g. a configured stable host-id) without changing the identity's required properties in FR-002–FR-004. The conceptual model depends on the properties, not on the derivation.
- **FR-002**: The Instance Identity MUST be **derived at runtime, never minted and never persisted as a value in the version-controlled tree**, so it cannot become branch-global or produce a merge conflict.
- **FR-003**: The Instance Identity MUST be **stable across sidecar restarts** (recomputed identically from its inputs), so an instance's history accumulates across restarts, idle-exits, and reboots; a restart is a liveness event on the instance's timeline, not a new instance.
- **FR-004**: The same checkout path on two different machines MUST resolve to two distinct instances (under the current derivation, the `host` component disambiguates) — zero identity collision.

**The event / identity hierarchy**

- **FR-005**: The system MUST model a nested hierarchy in which an **instance** (`host:path`) contains **sessions**, and a session contains **invocations/runs**; every event MUST self-identify its place in this hierarchy.
- **FR-006**: A **session** MUST be defined as the span from `/stack-control:session-start` to `/stack-control:session-end` — a stack-control construct with a stack-control-minted session id, distinct from any Claude Code session id (which is at most an optional correlation attribute).
- **FR-007**: `/stack-control:session-start` MUST mint a session id, persist a machine-local `current-session` record for the instance, and emit a `session.started` event; `/stack-control:session-end` MUST emit `session.ended` and clear the record.
- **FR-008**: Invocations and runs occurring during an open session MUST be attributed to that session's id (read from the machine-local `current-session` record).
- **FR-009**: An **unclosed session MUST be a first-class observable state** ("open since X"), never an error; emitting session telemetry MUST NOT block or gate the session-start/session-end skills (fail-open, consistent with the session-skills-never-block rule).

**Telemetry the plane collects**

- **FR-010**: The plane MUST record, per instance, the existing `invocation.completed` telemetry (which verb ran, when) rather than discarding it — this is the load-bearing source of instance existence and last-activity.
- **FR-011**: Every emitted event MUST carry the instance identity (`host:path`) and, when within a session, the current session id.
- **FR-012**: The system MUST emit typed `session.started` / `session.ended` events (from the session skills) and `phase.entered` events (from the workflow phase-transition seam, carrying the phase — designing/specifying/implementing/governing — a timestamp, and the compass-bearing snapshot).
- **FR-013**: `session.*` and `phase.entered` events MUST be **durably recorded**, so that lifetime counters and the phase timeline survive a plane restart (rehydrated from the durable event log). Live/current state MUST NOT require a durable read.
- **FR-014**: Emission MUST NOT slow, block, or fail any `stackctl` invocation regardless of sidecar/plane/network state (the 036 fail-open contract is reused unchanged).

**The instance registry & the state it exposes**

- **FR-015**: The plane MUST maintain an **instance registry** — a **materialized projection**, not a source of truth. The durable event log is the authoritative record of facts; the registry is a derived view that folds the event stream (plus live signals) into one `InstanceState` per instance, and MUST rehydrate from the durable event log on restart so a bounce does not reset lifetime state. Every `InstanceState` field is a projection of underlying events, never an independently-authoritative value.
- **FR-016**: `InstanceState` MUST expose: `id` (the Instance Identity), `host`, `path`; the two independent status axes `connection` and `liveness` (FR-016a) and `lastHeartbeatAt`; `currentSession` (`{sessionId, startedAt}` or none); `currentBearing` (`{phase, item}`); `lastActivityAt` and `lastActivity`; `sessionsStarted` and `sessionsEnded`; `firstSeenAt` and `firstSessionAt`; `phaseDurations` (design/spec/execution/governance); and `recentActivity` (FR-016b).
- **FR-016a**: `connection` and `liveness` are **two independent axes** and MUST be defined precisely (they can diverge — e.g. an open uplink to a hung instance is `attached` + `stale`). `connection` is whether the instance's sidecar currently has an open uplink to the plane: `attached` | `disconnected`. `liveness` is how recently the plane last received any signal from the instance: `live` (within the liveness window) | `stale` (past the window but within the reconciliation grace) | `gone` (past the reconciliation grace). Neither axis is derived from the other.
- **FR-016b**: `recentActivity` is a **bounded, newest-first list of the instance's most recent events, capped at a fixed N** — a best-effort convenience view, explicitly **not** a complete or authoritative history (full history is not this field's job). Entries beyond the cap are evicted; on rehydrate it is rebuilt from the retained window.
- **FR-017**: `InstanceState` MUST NOT carry a `waiting`/`blocked` field in this feature — the telemetry to populate it is undefined and a null field would mislead. It is recorded as an open question only.
- **FR-018**: A phase duration that has not been observed MUST be reported as **absent**, never fabricated as zero.
- **FR-019**: The instance registry MUST NOT regress an instance to an earlier state on duplicate or reordered event delivery (reusing 036's no-regress / effectively-once ingest contract).

**The query API (read-only)**

- **FR-020**: The plane MUST expose `GET /v1/instances` returning a snapshot of every instance and its state, defaulting to connected instances, with `?include=all` to include known-but-disconnected/historical instances.
- **FR-021**: The plane MUST expose `GET /v1/instances/{id}` returning full detail including `recentActivity`.
- **FR-022**: The plane MUST expose `GET /v1/instances/stream` delivering live deltas (snapshot-then-deltas), so a watcher receives updates without re-polling.
- **FR-023**: Serving live/current instance state MUST generate zero reads against the durable store; only lifetime-history fields derive from durable data.
- **FR-024**: The query API MUST be **read-only** — it exposes no state-changing or command-issuing operation (that is the out-of-scope control follow-on).

**Runs as a facet & auth**

- **FR-025**: The commandable `execute`/`govern` runs MUST reframe as a **facet of an instance** — exposed as `GET /v1/instances/{id}/runs` — with `/v1/fleet` surviving as a cross-instance "all active runs" view derived from the instance registry.
- **FR-026**: Authentication MUST remain sound with a derived, guessable identity: the bearer token (not the identity) is the secret; the plane MUST bind a token to its authorized `host:path` and reject any event claiming an identity outside that authorization.

**Verification discipline (first-class, non-negotiable — Principle I)**

- **FR-027**: Verification MUST include real end-to-end telemetry produced by production producers (a real `/stack-control:session-start`, real `stackctl` verbs, a real phase transition, then `GET /v1/instances` showing a real instance with real state). Synthetic event injection is insufficient for feature acceptance; a green automated test suite is the floor, not the proof.

### Key Entities

- **Instance**: A connected sidecar/worktree, identified by its **Instance Identity** (FR-001; currently derived as `host:path`, machine-local). The top-level observable unit. Carries the folded `InstanceState`.
- **Session**: The span from `/stack-control:session-start` to `/stack-control:session-end`, with a stack-control-minted session id; many over an instance's life; may be open (unclosed) as a first-class state.
- **Invocation / Run**: One `stackctl` process (invocation) or an `execute`/`govern` run (the commandable subset, observed here) within a session.
- **Event**: A telemetry record — the unit of **fact** — classified live-only / aggregated / durable (reusing 036's classification seam). Types: `invocation.completed` (aggregated, now retained per instance), `session.started`/`session.ended` (durable), `phase.entered` (durable, carries bearing), `session.heartbeat` (live-only). The durable event log is the authoritative record; everything below is derived from it.
- **InstanceState**: A **materialized projection** of one instance's live + historical state (fields per FR-016), derived from the event log + live signals — never an independently-authoritative value.
- **Instance Registry**: The materialized projection (FR-015) that folds the event stream (plus live signals) into `InstanceState` per instance; rehydrated from the durable event log on restart. A **derived view, not the source of truth** — the event log is.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With real `stackctl` activity across one or more installations, a single `GET /v1/instances` returns every active instance exactly once, each keyed by `host:path`, with correct connection/liveness and last-activity — with zero per-host requests.
- **SC-002**: Every state this feature exposes is reachable by running the real sidecar + plane and issuing the query API — 0 states require injected/synthetic events to observe, and 0 require a UI that does not exist.
- **SC-003**: The same checkout path on two machines yields two distinct instances — 0 identity collisions.
- **SC-004**: Instance identity never appears in any committed (version-controlled) file — 0 occurrences — and is byte-identical across restarts of the same sidecar.
- **SC-005**: `stackctl` invocation wall-clock time with telemetry active is statistically indistinguishable from telemetry disabled, and 0 invocations fail/block due to plane/sidecar/network state.
- **SC-006**: Lifetime counters (`sessionsStarted`/`sessionsEnded`, `firstSeenAt`, phase durations) are unchanged across a plane restart — 0 drift attributable to the bounce.
- **SC-007**: Serving live instance state generates 0 durable-store reads.
- **SC-008**: An unclosed session is observable as "open since X" in 100% of cases where `session-end` did not run, with 0 session-skill failures caused by telemetry.
- **SC-009**: A phase not yet observed is reported absent (never a fabricated 0) in 100% of cases.
- **SC-010**: The feature's acceptance is demonstrated by a real end-to-end dogfood (real session-start → real verbs → real phase transition → real `GET /v1/instances`), captured as evidence — not by the test suite alone.

## Assumptions

- **The feature is dogfooded as it is built** (Principle II): the sidecar and plane are run and the real query API is driven against real producers, in a tight loop, as the primary evidence. A green test suite is a prerequisite, not proof.
- **036's transport is reused unchanged**: sidecar election, spool WAL, uplink, HTTP plane scaffolding, fail-open emission, event classification seam, and bearer auth are dependencies, not rebuilt.
- **Single-operator fleet**: the `host:path` identity (which embeds a filesystem path with a username) is acceptable telemetry for one operator; multi-operator path redaction is a recorded open question, deferred.
- **Deployment location is not a design input**: the plane is an HTTP service reachable at its configured URL; where it runs is an operational choice.
- **The workflow phase model already exists** (`designing/specifying/implementing/governing`) and its transition seam is the single instrumentation point for bearing + phase durations — surfaced, not redefined, here.

## Out of Scope

- **Control / commanding instances** (pause/cancel/reconcile/config-push or any state change) — the explicit follow-on feature; this feature is read-only observability.
- **A browser dashboard** over the instance view — a separate consumer; this feature delivers the API the dashboard would later call.
- **Multi-operator tenancy**, per-operator history scoping, and identity redaction — deferred by explicit decision.

## Open Questions (captured, not resolved)

- **Waiting/blocked signal**: what states count as waiting (operator input, a gate, a command, idle-vs-stuck)? Telemetry undefined; the field is omitted until it can be sourced honestly.
- **Reconciliation-state producer** (roadmap/backlog drift per instance) — its own producer; the 036 FR-086 analog, not built here.
- **Concurrent/nested sessions** on one instance — supersede vs. warn (leaning supersede).
- **Hostname drift** — a configured stable host-id override if it bites.
- **Multi-operator path leakage** — identity may need a hash/opaque handle when the fleet serves more than one operator.
- **Storage-layout / token-map re-key** — 036's `runs/{installationId}/…` layout and token map to `host:path`, or an internal `host:path`↔`installationId` mapping.
