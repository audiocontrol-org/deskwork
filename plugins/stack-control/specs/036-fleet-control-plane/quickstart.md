# Quickstart: Fleet Control Plane — the dogfood loop

**Feature**: `specs/036-fleet-control-plane` | **Validates**: FR-087, SC-018, and every user story

This is **not** a demo script. It is the feature's **primary verification path** and a first-class requirement (FR-087/SC-018).

**Why it is load-bearing.** The browser dashboard is out of scope, so this loop *is* the consumer: run the sidecar and the plane, issue **the same API requests a dashboard would make**, and find out whether it works or how it is broken — in a tight feedback loop (operator decision, 2026-07-16). Two consequences the implementation inherits:

1. **The plane's API is not speculative.** It has a real consumer from day one, which is what Constitution Principle II requires before the dashboard becomes its second consumer.
2. **A green test suite is a prerequisite, not proof.** Per `.claude/rules/agent-discipline.md`, tests written against our own assumptions cannot establish that a distributed system behaves. **The dogfood loop is the primary evidence; the suite is the floor beneath it.**

If a scenario below cannot be driven from a terminal, that is a **defect in the feature**, not a gap in the guide — a state reachable only through a UI that does not exist yet is a state this feature cannot prove it delivers.

## Prerequisites

- Node ≥20 (declared floor; 22.19.0 actual). `npm install` at the repo root.
- A reachable plane. For the loop: run one locally — deployment location is not a design input (`STACKCTL_CP_URL` is the only thing that matters).
- A bearer token provisioned into the machine-local durable store (PT-015).

> **Before running anything: redirect the machine-local store to a temp dir.** Identity, token, and the sequence high-water mark live **outside** the installation tree (the declared installation-anchor exception — see [plan.md](./plan.md) § Complexity Tracking). Without redirection, a loop run mints identity into your real `$HOME`.

## Scenario 1 — The CLI is never degraded (US1, SC-001/002)

**The dominant constraint. Verify it first: if this fails, nothing else matters.**

1. Baseline: time any `stackctl` verb with telemetry disabled.
2. **No sidecar:** delete the socket, run the verb. → Completes; identical output and exit code; wall-clock indistinguishable from baseline. A sidecar is spawned for *next* time.
3. **Plane unreachable:** point `STACKCTL_CP_URL` at a dead address. → Verb unaffected and never informed; sidecar spools.
4. **Plane hanging:** point at a server that accepts and never responds. → **Verb completes at normal speed.** There is no network in the interactive path to time out. *This is the scenario that catches an accidental `await` on the WAN.*
5. **Concurrent spawn:** launch several invocations at once with no sidecar. → **Exactly one** sidecar; all invocations unaffected.
6. **Version skew:** start an old-protocol sidecar, run a newer CLI. → Restart path fires; invocation **not** failed.

## Scenario 2 — Fleet aggregation (US2, SC-003)

1. Start commandable runs (`execute` / `govern`) in several installations — ideally on more than one host.
2. `GET /v1/fleet` → **exactly one** entry per commandable run, carrying instance, compass, the three status axes, progress, model, git, reconciliation.
3. Follow `GET /v1/fleet/stream`. Let a run progress. → **Deltas** only; never a full registry push per event.
4. Hammer short verbs in a loop. → They **never** appear as fleet entries; their timings remain retrievable.
5. `GET /v1/runs/{runId}` → overview, artifacts, execution, governance, timings, reconciliation. **Artifact refs are installation-relative — never `file://`, never absolute host paths.**

## Scenario 3 — Commands, and always knowing their fate (US3, SC-006/007)

1. `POST /v1/runs/{runId}/commands` with `pause`. → Returns a `commandId`. `GET /v1/commands/{commandId}` shows **requested vs applied** distinctly — pause is cooperative.
2. **The blip test:** issue `cancel`, immediately sever the sidecar's network, restore it. → Buffered command **replays and applies**. Not silently dropped. *This is the one destructive command; a silent no-op here is the worst failure in the design.*
3. **The restart test:** issue a command, kill the plane within a second, restart it. → `accepted` **survived**; honored from the durable record.
4. Deliver a command to a run that never applies it. → Reports **delivered**, not complete. *Stream replay position is not command status.*
5. Let a command expire undelivered. → **Visible terminal `expired`.** It says so loudly rather than vanishing.
6. Issue `pause`, then `resume` before apply. → `pause` **superseded**. Issue two `cancel`s → they **deduplicate**, never queue.
7. `POST /v1/fleet/commands`. → Response reports targets / accepted / unavailable. **Never presented as atomic.**
8. Issue `reconcile`. → Its own received/started/completed/failed lifecycle; results linked by `commandId`.

## Scenario 4 — Trust, including about failure (US4, SC-004/005/015/016)

1. **`kill -9` a run's process.** → Within **milliseconds**, `abnormally-disconnected`, **termination reason unknown**. **Not** "crashed". No TTL or polling interval contributes latency.
2. **Restart the sidecar with N healthy runs.** → **Zero** false death conclusions. Every socket closed at once and nothing died. Runs re-announce inside the reconciliation window. *The single most important honesty test in the feature.*
3. Let a run miss the reconciliation window. → **Presumed gone** — only then.
4. Sever a run's sidecar connection while it keeps executing. → Reports **temporarily uncommandable**, never healthy.
5. **Sever the uplink.** → **Uplink** health degrades, naming that hop, with spool depth / last success / last failure / last error. Run execution **unaffected**.
6. **Break the archive** (bad durable-store credentials). → **Archive** health degrades, naming *that* hop, with pending + failed counts. **"Degraded" always answers which hop.**
7. Replay duplicate and reordered events. → Deduped; registry **never walks backward** from a later state to an earlier one.
8. **`SIGKILL` the sidecar mid-spool, restart it.** → **No record loss**; the WAL replays. *Note: this is the test the original "must not exit holding an un-flushed spool" phrasing could not pass by construction — `SIGKILL` runs no code (R-03).*

## Scenario 5 — History without amplifying the capped store (US5, SC-008/009/010)

1. Instrument durable-store reads.
2. View **live** runs repeatedly. → **Zero** durable-store reads. Live is served from the in-memory registry.
3. Finalize a run; read its history repeatedly and with varied shapes. → Capped-store transactions stay **flat** as client traffic scales.
4. **Cold-cache test:** clear the plane's derived cache; request history. → Re-reads **through the delivery layer** (cached); **does not touch the capped store**.
5. **The decorative-shield test:** confirm the CDN is actually caching `.json`. → **Cloudflare does not cache JSON by default.** Without an explicit cache rule the hit rate is **zero** while the data stays correct — the shield *looks* like it works and shields nothing. **Measure the hit rate; do not infer it from correct data.**
6. Deliver a **late event after finalization**. → Lands as a **new object**; triggers a **new derived revision**. **Zero** published objects mutated.
7. Probe a sequence that does not exist yet, then write it. → The **404 is not cached**; the new event is seen immediately. *The one deliberate no-cache decision in an otherwise cache-forever design.*
8. `GET /v1/runs/{runId}/timings` → design / spec / execution / governance durations.

## Scenario 6 — Hostile network (US6, SC-011/012/013/014)

1. Run a sidecar behind NAT with **no inbound reachability**. → Session establishes — every connection is sidecar-outbound.
2. Connect **unauthenticated**. → Refused. **Revoked token** → refused, never downgraded to partial access.
3. Inspect any CLI process's environment and memory. → **Zero** credentials. Inspect every frame on the local socket. → **The token never crosses it.**
4. Put an intermediary that blocks connection upgrades in front. → The command stream **still traverses it** — it is plain HTTP.
5. Idle the command stream past the intermediary's timeout. → **Keepalive comment frames** hold it open. *Verify the comment frames re-arm the client's read-idle watchdog — the likeliest silent bug in the feature; it presents as a mystery disconnect every ~45s.*
6. Inspect the spool **on disk**. → **Zero** raw un-redacted values. Redaction precedes spooling.
7. **Copy an installation tree to another host** (or another path) and start it. → It **re-mints**. Distinct installation; **zero** identity collisions — including for identical checkout paths on different machines. *Confirm no usable credential travelled with the tree.*

## Definition of done for this guide

Every scenario is drivable from a terminal against a running sidecar + plane, with **no browser** and **no UI** (SC-018). Any scenario that is not is a **defect**.
