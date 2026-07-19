# Instance Observability — design record

**Date:** 2026-07-18
**Status:** design-approved (brainstorming), pending implementation plan
**Supersedes the model of:** `design:feature/fleet-control-plane` (spec `specs/036-fleet-control-plane`) — run-centric; this reframes the fleet as instance-centric and subsumes 036's run view as a facet.
**Scope of this record:** observability only. Control (issuing commands) is a separate follow-on.

## Why this exists

036 (Fleet Control Plane) shipped a **run-centric** model: the fleet is a table of commandable `execute`/`govern` runs, and the registry only builds rows from `run.*` events. A live dogfood found that the plane-internal machinery is real, correct, and tested, but **no real producer exists** — real verbs never populate the fleet, phase durations and history serve absent data, and the mandated end-to-end verification (FR-087/SC-018) was signed off against **synthetic events POSTed to `/v1/ingest`, not real runs**. So 036 cannot be considered delivered against its own spec.

The reframe that motivates this design (operator, 2026-07-18): **"Control starts at observability. You can't control something you can't observe."** The unit we actually want to observe is not a run — it is the **instance**: every connected sidecar/worktree and its live state. Runs are one facet of an instance's activity, not the center.

The immediate goal is not to answer every question — it is to **start collecting telemetry** so we can reason about what is answerable now and what data is still missing.

## Scope

**In scope (this design):** telemetry collection + a per-instance registry + a read-only query API. The deliverable is "ask the plane for every connected instance and its current state," with enough real telemetry flowing to reason from data.

**Out of scope (separate follow-on):** issuing commands (pause/cancel/reconcile/…) against instances. Observability first; control is built on top once we can see.

## Foundation — new model on 036's existing plumbing

We keep 036's transport unchanged and build the new model *inside* the plane. The transport that already works and is tested — sidecar election, the crash-safe spool WAL, the uplink, the HTTP plane scaffolding, the fail-open emission path, the event classification seam, bearer auth — is reused as-is. The new work is: an **instance registry** projection that folds the event stream into per-instance state, a query API over it, and the **producers** that emit the lifecycle telemetry (the half 036 never built).

```
producers --emit--> sidecar (spool/uplink, existing) --uplink--> plane
                                                                   |
                                                       run registry (existing, a facet)
                                                       INSTANCE REGISTRY (new): fold events -> per-instance state
                                                                   |
                                                       GET /v1/instances (new)
```

## Identity — `host:path`

The instance identity is **`host:path`** (hostname + `realpath(installationRoot)`), and it is **derived, never stored, never in git.**

- **Why derived beats a minted UUID.** A minted, persisted id is a honeypot: if it ever lands in the version-controlled tree it becomes branch-global (every checkout shares it — a cross-host collision) or is independently generated per branch (a merge conflict). `host:path` is computed at runtime, so there is nothing to commit and nothing to conflict on. This is the same reason 036 kept `installationId` out of `.stack-control/` (see `locate.ts` header), taken one step further: we do not even mint or persist an id.
- **Stable across restarts, for free.** Recomputed from the same host + path on every daemon start, so an instance's history accumulates across restarts, idle-exits, and reboots. A restart is a liveness event on the instance's timeline, not a new instance. No identity file in the durable store.
- **SC-014 for free.** The `host` component makes the same checkout path on two machines two distinct instances.
- **Legible.** The identity *is* the answer to "which instance is this?" — `host:/Users/…/fleet-control-plane/plugins/stack-control` names machine and worktree with no lookup against an opaque UUID. This is the observability win.
- **Forward-compatible with the deferred worktree axis.** `path` *is* the worktree location, so `host:path` is already worktree-granular. When sidecars go shared (per-host, serving many worktrees), the identity scheme does not change — only the transport does (one shared sidecar carries many `host:path` streams).

**Auth stays sound** even though the id is guessable: the token is the secret, not the identity; `host:path` is just a label the token is authorized to use. The plane binds token → authorized `host:path` and rejects claims outside it (the `refuseInstallationMismatch` pattern, re-keyed). Seam to resolve in the plan: the storage layout `runs/{installationId}/…` and the token map currently key on the minted UUID — they re-key to `host:path` or map `host:path`↔`installationId` internally.

**Caveats (pinned, not blockers for the single-operator scope):**
- Move/rename the worktree → new identity (history resets). Same as today's path-keyed store; defensible (a moved worktree is a new location).
- Hostname drift (DHCP/VM rename) → new identity. Allow a configured stable host-id override later if it bites.
- The path leaks filesystem layout + username into telemetry. Fine for a single-operator fleet; in tension with the spec's redaction (`redact.ts` scrubs `homeDir`) — for the multi-operator future the identity may need a hash or opaque handle.

## Event model — the identity spine

A nested hierarchy, keyed from `host:path` down; every event self-identifies its place in it:

- **Instance** = `host:path` — the sidecar/worktree; the top-level observable unit.
- **Session** = the span from `/stack-control:session-start` to `/stack-control:session-end` — the operator's unit of sitting down to work. A **stack-control construct**, NOT the Claude Code session. Carries a stack-control-minted session id. `CLAUDE_CODE_SESSION_ID` is at most an optional correlation attribute.
- **Invocation / Run** = one `stackctl` process (invocation), or an `execute`/`govern` run (the commandable subset — observed here, commanded in the follow-on), *within* the current session.

**Events that flow** (reusing 036's classification seam — live-only / aggregated / durable — which decides storage cost):

| Event | New? | Carries | Class |
|---|---|---|---|
| `invocation.completed` | exists — **stop discarding it** | which verb ran + when → last activity, what it did | aggregated |
| `session.started` / `session.ended` | new | minted session id, `host:path` → session counts, first/last session | durable |
| `phase.entered` | new | `designing/specifying/implementing/governing` + timestamp → current bearing + phase-duration timeline | durable |
| `session.heartbeat` | exists | liveness | live-only |

Two deliberate minimalisms: **compass bearing is not its own event** — it is a snapshot field on `session.started` and updated by `phase.entered`, so "current bearing" is always the latest such event. And **live state serves from the in-memory registry with zero durable reads** (SC-009); only lifetime history touches durable storage.

### Session mechanics (the two verbs are separate processes)

- `/stack-control:session-start` mints a session id, writes a `current-session` record `{sessionId, startedAt}` to the **machine-local durable store** for this `host:path`, and emits `session.started`.
- **Invocations during the session** read `current-session` and stamp their `invocation.completed` (and run/phase events) with the session id — that is what threads "everything that happens between" to the session.
- `/stack-control:session-end` reads the record, emits `session.ended`, clears it.
- **An unclosed session is a first-class observable state**, not an error — the instance shows "session open since X". No pairing enforcement; emission stays fail-open, keeping the `session-start/session-end never block` rule intact.
- **Open edge (minor, for the plan):** a second `session-start` while a session is open — lean supersede-and-mark-the-old-one-abandoned.

## Per-instance state & query API

**`InstanceState`** — each field traces to a question this design answers:

| Field | Answers | Source |
|---|---|---|
| `id` (`host:path`), `host`, `path` | which instance is this | derived |
| `connection` (uplinked / disconnected), `liveness` (live / stale), `lastHeartbeatAt` | is it connected right now | heartbeat + uplink |
| `currentSession` : `{sessionId, startedAt}` \| `null` | is a session open, since when | `session.*` |
| `currentBearing` : `{phase, item}` | current compass bearing | latest `phase.entered` / `session.started` snapshot |
| `lastActivityAt` + `lastActivity` | last time it did anything, and what | latest event of any kind |
| `sessionsStarted` / `sessionsEnded` | how many sessions started/ended | folded `session.*` counts |
| `firstSeenAt`, `firstSessionAt` | since when this instance has existed | earliest events |
| `phaseDurations` : design/spec/execution/governance | the FR-085 timeline | folded `phase.entered` |
| `recentActivity[]` (last N events) | the detail feed | event window |

`waiting` ("is it waiting for anything") is intentionally **omitted** from the shape and the API. We do not yet know how to populate it, and a null field would pollute the response. Recorded here as a future question with telemetry undefined; added when we know how to source it.

**Live vs. durable.** The instance registry folds the event stream into per-instance accumulators (same pattern as the run registry). Live/current fields serve from memory with zero durable reads. Lifetime counters are accurate because the plane **rehydrates the instance registry from the durable event log on restart** (reusing 036's `rehydrateIngestState`), so a plane bounce does not reset counts (PT-007). Load-bearing requirement on the collection layer: **`session.*` and `phase.entered` must be durably logged.**

**Query API:**
- `GET /v1/instances` — snapshot of every instance + state. Defaults to connected; `?include=all` for known-but-disconnected/historical.
- `GET /v1/instances/{id}` — full detail + `recentActivity`.
- `GET /v1/instances/stream` — SSE deltas (snapshot-then-deltas, mirroring the run fleet).

**Runs become a facet.** The commandable execute/govern runs (036's `/v1/fleet`) reframe as an instance's runs — `GET /v1/instances/{id}/runs` — and `/v1/fleet` survives as a cross-instance "all active runs everywhere" query over the instance registry.

## Producers (collection layer) & wiring order

| Event | Emitted at | Change |
|---|---|---|
| `host:path` on every envelope | envelope construction (all events) | derive `host` + `realpath(path)`, stamp it |
| `invocation.completed` | existing CLI telemetry wrapper | stop discarding plane-side; stamp with current session id |
| `session.started` / `session.ended` | `/stack-control:session-start` / `:session-end` | mint/clear `current-session`; emit (fail-open) |
| `phase.entered` | the workflow **transition-engine** (one seam, already fires on every phase transition) | stamp timestamp + emit |
| `session.heartbeat` | existing | unchanged |

The transition-engine is the leverage point: instrument that one seam for the whole design→spec→execute→govern timeline instead of touching every lifecycle skill.

**Wiring order (the "start collecting now" path):**
- **Step 1 (ship first, cheapest):** `host:path` on the envelope + stop discarding `invocation.completed` + the instance-registry projection + `GET /v1/instances`. Almost no new producers — mostly the plane no longer discarding data it already receives.
- **Step 2:** `session.*` from the two session skills + session-id threading.
- **Step 3:** `phase.entered` from the transition-engine.

## What's answerable when (the reasoning map)

| Question | After Step 1 | After Step 2 | After Step 3 |
|---|---|---|---|
| Which instances exist / are connected? | yes | | |
| Last time it did anything + what verb? | yes | | |
| Activity volume / recency | yes | | |
| Sessions started/ended, current open session, when session-start ran | | yes | |
| Current compass bearing | partial (last verb) | | yes |
| Phase-duration timeline (design/spec/execution/governance) | | | yes |

**Still needs telemetry we have not designed** (named, not built): the waiting/blocked signal; reconciliation drift (FR-086 — its own producer); anything about *what specifically* the work is doing beyond phase + verb (richer snapshots, later).

## Verification discipline

The dogfood drives **real producers, never synthetic events.** Acceptance: run a real `/stack-control:session-start`, real `stackctl` verbs, a real phase transition, then `GET /v1/instances` and confirm a real instance shows real state. This is the exact step 036 skipped (it validated the plane against injected events); it is non-negotiable here. A green test suite is the floor, not the proof.

## Relationship to 036 and its graduation

036's govern convergence record graduated over code that does not satisfy its own spec (producers unbuilt; FR-087/SC-018 verified against synthetic events). The roadmap node is still `status: planned`, so no roadmap-status reversal is needed. This design is the corrected architecture; implementing it supersedes 036's stale convergence record on re-govern. The reusable plane/sidecar internals carry forward unchanged; the run-centric model becomes a facet of the instance view.

## Open questions (captured, not answered)

- **Waiting/blocked signal.** What states count as waiting (operator input, a gate, a command, idle-vs-stuck)? Telemetry undefined.
- **Reconciliation state (FR-086).** Roadmap/backlog drift per instance needs its own producer.
- **Concurrent/nested sessions** on one instance — supersede vs. warn (lean supersede).
- **Hostname drift** — configured stable host-id override if it bites.
- **Multi-operator path leakage** — identity may need a hash/opaque handle when the fleet serves more than one operator.
- **Storage-layout / token-map re-key** — `runs/{installationId}/…` and the token map to `host:path`, or an internal mapping.
