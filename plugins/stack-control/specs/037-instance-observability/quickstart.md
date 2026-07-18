# Quickstart: Instance Observability — the real-producer dogfood loop

**Feature**: `specs/037-instance-observability` | **Validates**: FR-027 / SC-010, and every user story

This is **not** a demo script. It is the feature's **primary verification path** and a first-class requirement (FR-027). Per the constitution (Test-First) a green `vitest` suite is the **floor, not the proof** — this loop is the proof. The rule it enforces, learned from 036: **drive real producers end-to-end; never validate against synthetic events injected at `/v1/ingest`.** If a state below is only reachable by injecting an event, that is a defect in the producers, not a gap in this guide.

## Prerequisites

- Node ≥20; `npm install` at the repo root.
- A reachable plane (run one locally for the loop; `STACKCTL_CP_URL` is the only thing that matters).
- A bearer token provisioned into the machine-local store (reused 036 mechanism: `stackctl plane provision-token`).
- **Redirect the machine-local store to a temp dir before running** (`HOME` + a short `TMPDIR`, per 036's isolation exception), so a loop run does not mint identity/session state into your real `$HOME`.

## Scenario 1 — An instance appears from real activity (US1, SC-001/002)

1. Start a sidecar + plane (`stackctl sidecar run` / `stackctl plane serve`), redirected store.
2. Run any ordinary `stackctl` verb in the installation (e.g. `stackctl version`).
3. `GET /v1/instances` → the installation appears as **exactly one** instance, keyed by its Instance Identity (`host:path`), carrying `connection`, `liveness`, `lastActivityAt`, and `lastActivity` (the verb it ran). **Driven by a real invocation — no event was POSTed by hand.**
4. Run a verb in a *second* installation (ideally another host). → Both appear, each once, distinct `host:path`, from one request.
5. Point `STACKCTL_CP_URL` at a dead address and run a verb. → The verb is unaffected and never informed; the instance view is simply not updated (fail-open preserved).

## Scenario 2 — Sessions are real and survive a restart (US2, SC-006/008)

1. Run a real `/stack-control:session-start` in the installation. → `GET /v1/instances/{id}` shows `currentSession {sessionId, startedAt}` and `sessionsStarted` incremented. Confirm a machine-local `current-session` record exists beside identity/token.
2. Run verbs during the session. → their events attribute to the open session id.
3. Run a real `/stack-control:session-end`. → `currentSession` cleared, `sessionsEnded` incremented.
4. **The unclosed-session test:** run `session-start`, then do *not* run `session-end`. → the instance shows a session **open since X** — a first-class state, no error, session verbs never blocked.
5. **The supersede test:** with a session open, run a second `session-start`. → the new session is current; the prior open one is recorded ended/abandoned (FR-009a).
6. **The restart test:** record session counts, restart the plane, re-query. → `sessionsStarted`/`sessionsEnded`/`firstSessionAt` are **unchanged** — rehydrated from the durable event log (SC-006).

## Scenario 3 — Bearing and phase durations from real transitions (US3, SC-009)

1. Drive a real workflow phase transition in the installation (e.g. move an item `implementing → governing` through the sanctioned flow). → `GET /v1/instances/{id}` `currentBearing` reflects the new phase + item.
2. End the session / go idle. → `currentBearing` **persists** (shows what it was last doing), never blanked by session end (FR-016c).
3. Re-enter a phase (e.g. a redesign returns to `designing`). → that phase's duration in `phaseDurations` **accrues cumulatively** across spans (FR-018).
4. Read `phaseDurations` for a phase not yet entered. → reported **absent**, never a fabricated `0` (SC-009).

## Scenario 4 — Live is free; the API is read-only (FR-023/SC-007, FR-024)

1. Instrument durable-store reads. View live instances repeatedly. → **zero** durable reads (live serves from the in-memory registry).
2. Confirm the API exposes **no** state-changing/command operation — every route is a read (FR-024). (Control is the follow-on feature.)
3. `GET /v1/instances/{id}/runs` → the instance's `execute`/`govern` runs as a facet; `/v1/fleet` still serves the cross-instance run view.
4. Follow `GET /v1/instances/stream`, let an instance act. → **deltas** arrive (snapshot-then-deltas), not a full re-push per event.

## Acceptance (FR-027)

The feature is accepted only when Scenarios 1–4 are driven **end-to-end against real producers** (real session-start/end, real verbs, a real phase transition) and captured as evidence — in addition to a green `vitest` suite. Synthetic event injection is insufficient for acceptance.

> Contracts (event/envelope shapes, API response shapes) and entity fields are defined in [contracts/](./contracts/) and [data-model.md](./data-model.md); this guide references them rather than duplicating them.
