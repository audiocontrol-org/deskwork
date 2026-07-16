# Design Record: Fleet Control Plane

**Item**: `design:feature/fleet-control-plane`
**Date**: 2026-07-16
**Approval**: recorded as the `design-approved:` marker on the roadmap node — never as prose in this file. If the marker is absent, this design is not approved, whatever any line here says.

> **Revision note.** This record has been through two amendment passes since the original
> draft: a third-party design review, and an operator correction that inverted a
> foundational assumption (the plane is global and multi-host, not localhost). Decisions
> that did not survive, and the reasons, are recorded in *Provenance* rather than quietly
> dropped.

## Problem domain

stack-control manages development effort across many worktrees, sessions, hosts, and workstreams simultaneously. Today there is no way to see what is happening across them at a glance. An operator running parallel `stackctl execute` runs across several worktrees — on several machines — must switch terminal context to check progress, has no mechanism to pause or cancel a run from a central surface, and has no historical record of how long design / spec / execution / governance phases actually take. Roadmap and backlog state drift silently across worktrees with no reconciliation signal.

The missing piece is a **control plane**: a network-reachable service that stack-control installations report into from wherever they run, and a dashboard that aggregates that state into a live operator view with active control over each run.

### Constraints the design is bound by

- **The control plane must never degrade the tool it observes.** stackctl verbs run constantly and interactively. An unreachable, slow, or broken control plane must not slow, block, or fail any stackctl invocation. Observation is strictly subordinate to the thing observed. This is the constraint that shapes the comms architecture more than any other.
- **The fleet is global and spans many hosts.** Hosts sit behind NAT and firewalls in arbitrary network conditions. The plane is network-exposed by construction, so TLS and authentication are mandatory, not deferrable.
- **Deployment location is not a design input.** The plane is an HTTP service at `STACKCTL_CP_URL` with reasonable connectivity. Where it runs — VPS, managed host, edge — is an operational choice that changes no decision in this record and is deliberately unspecified.
- **B2 reads are aggressively capped.** Read economics — not global distribution — are what put a CDN in this design. Any read path that amplifies B2 transactions is a defect.
- **Distributed-systems ambiguity is the primary risk.** The failure mode is not a wrong transport; it is a system that cannot distinguish "pause requested" from "paused", "sent" from "received", "stale" from "disconnected", or "run complete" from "process died".

## Solution space

Eight axes were explored. Each records its rejected alternatives.

### Comms topology — Chosen: a local sidecar per installation

Each stack-control installation runs a long-lived local **sidecar** that maintains one authenticated, session-oriented connection to the control plane. Local stackctl invocations connect to the sidecar over a local socket to emit telemetry; commandable runs hold a local connection down which commands are delivered. One session up, N local connections down.

**Why chosen:** it is the only topology that satisfies the "never degrade the tool" constraint rather than approximating it. The CLI never touches the WAN, so there is no network in the interactive path to time out, retry, or bound. It is also the only topology in which **durability is coherent**: retry, spooling, and backoff require a process that outlives the invocation that produced the event, and an ephemeral 200ms CLI process has nobody left to retry after it exits. Secondary wins: one authenticated session per installation instead of per invocation; credentials live in the sidecar rather than in every CLI process's environment; reconnect, replay, and clock-skew estimation resolve once in one place.

### Comms topology — Rejected: direct per-invocation connections

Every stackctl invocation POSTs telemetry to the control plane and opens its own command stream.

**Why rejected:** puts WAN latency, TLS handshake, and auth on the interactive path of every CLI call; a configured-but-unreachable plane taxes every invocation. Makes spooling and retry unimplementable for short-lived processes. Multiplies authenticated connections by invocation count. This was the original design and it does not survive the global constraint.

### Comms topology — Rejected: fire-and-forget with no local component

Invocations emit best-effort and accept loss.

**Why rejected:** acceptable for metrics, not for lifecycle events (`invocation-start`, `invocation-end`, `task-error`, command acknowledgement, governance results). Silent loss of lifecycle events produces a fleet view that lies, which is worse than no fleet view.

### Sidecar↔plane transport — Chosen: SSE for commands, HTTP POST for telemetry

The sidecar holds an SSE stream to receive commands and POSTs telemetry upstream.

**Why chosen — and note this is not the original justification.** The load-bearing argument is **NAT traversal**: hosts are behind NAT and firewalls, so the plane can *never* dial a sidecar. Every connection must be sidecar-outbound and held open. That is a hard constraint, not a preference. Secondary: SSE is plain HTTP and traverses hostile proxies that block WebSocket upgrades; it has native reconnect with `Last-Event-ID` replay, which composes directly with buffered commands. The original record justified SSE on traffic shape — true but not decisive, and it never stated the constraint that actually forces the choice.

**Conditional:** the connection economics assume HTTP/2 end-to-end, so the SSE stream and telemetry POSTs multiplex over one TCP connection. Without HTTP/2 the two-connection cost is real.

### Sidecar↔plane transport — Rejected: WebSocket

One bidirectional authenticated connection.

**Why rejected:** the sidecar contains connection-lifecycle complexity either way, so WebSocket's main cost is neutralized — but so is its main benefit, since HTTP/2 multiplexing collapses the connection-count advantage. What remains is worse proxy traversal. WebSocket becomes correct if sidecar-initiated request/response is ever needed; the sidecar makes that promotion cheap and contained.

### Sidecar↔plane transport — Rejected: polling

Sidecar short-polls for commands.

**Why rejected:** turns a durable command channel into delivery latency, and the sidecar already solves the problem polling exists to avoid.

### Sidecar scope — Chosen: per installation, door open to per-host

One sidecar per `.stack-control` installation.

**Why chosen:** scoped to that installation's config and credentials, with no cross-installation coordination. Cost is N long-lived sessions from a host with N worktrees. The local socket contract is identical under a per-host sidecar, so promotion stays contained if connection count becomes a real problem.

### Sidecar scope — Rejected: per host, multiplexing installations

**Why rejected:** one WAN session per host regardless of worktree count, but the sidecar must then serve installations with potentially different configs and credentials, and discovery stops being install-scoped. Not justified without evidence that connection count is a real problem.

**Revisit when:** a host's concurrent installation count makes N sessions costly in practice. The local socket contract is identical under either scope, so the swap stays contained to the sidecar.

### Sidecar lifecycle — Chosen: auto-spawn, supervisable

Any invocation that finds no live sidecar starts one, singleton-guarded against concurrent spawn. Operators who want a supervised long-lived process can run it under launchd/systemd instead.

**Why chosen:** telemetry that silently fails to flow because someone forgot to start a daemon is exactly the quiet gap that erodes trust in a fleet view. Auto-spawn means it always works; supervision is available for those who want it.

### Sidecar lifecycle — Rejected: explicitly operator-started only

**Why rejected:** predictable lifecycle and no spawn race, but the forgot-to-start failure is silent and the fleet view becomes untrustworthy without announcing itself.

### Emit scope — Chosen: everything telemeters; the fleet shows commandable runs

Every stackctl invocation emits to the local sidecar. Only long-running interruptible runs (`execute`, `govern`) register as commandable fleet instances.

**Why chosen:** the sidecar makes emission a local socket write — microseconds, no network — so the cost argument for restricting emission evaporates. This decouples two concerns that were previously fused: *what emits* (everything, cheaply) and *what is commandable* (runs you can act on). The fleet table means "runs you can act on"; CLI usage and timing data across every verb is available without phantom rows in it. The sidecar decides what is worth forwarding upstream.

### Emit scope — Rejected: commandable runs only

**Why rejected:** was the right answer when emission cost WAN latency per invocation. The sidecar removed that cost, and with it the justification. Discards useful cross-fleet CLI timing data for no remaining benefit.

### Emit scope — Rejected: sidecar samples/aggregates short-verb telemetry into rollups

**Why rejected:** bounds WAN traffic and B2 object count, but buys a rollup schema and aggregation logic in the sidecar before there is evidence the volume is a problem. Available later without changing the local contract.

### Durable store — Chosen: B2 fronted by Cloudflare

Immutable per-event objects in B2; a Cloudflare Worker fronts reads.

**Why chosen:** B2 read transactions and egress are aggressively capped. Telemetry objects are immutable once written — exactly the content a CDN caches perfectly, write once and cache indefinitely. Cloudflare absorbs repeat reads so B2 read caps are never binding. Bandwidth Alliance makes B2→CF egress free.

**This composes with the storage-layout decision and is not independent of it.** The original `events.jsonl` append-in-place layout would have been actively hostile: a mutable object defeats edge caching and forces revalidation on every read. Immutable per-event objects are what make the CDN work at all.

### Durable store — Rejected: local-only store

**Why rejected:** forecloses cross-host history entirely, which is the point of a global fleet.

### Durable store — Rejected: B2 direct, no CDN

**Why rejected:** walks straight into the read caps the CDN exists to absorb.

### Read path — Chosen: browser reads Cloudflare directly

Historical views are fetched by the dashboard from the Worker; live state arrives over SSE from the plane.

**Why chosen:** preserves browser cache stacked on edge cache — the strongest available protection for the read caps that justify the CDN. Putting the plane in the read path discards browser caching and re-amplifies reads.

**Accepted cost:** the dashboard trusts a second endpoint, so the Worker's `/query` contract genuinely faces the browser and needs an origin policy, a versioning story, and CORS.

### Read path — Rejected: plane proxies Worker reads

**Why rejected:** tidier contract, but it puts the plane in every history read and discards browser caching, weakening the exact mechanism the CDN provides. *The design review recommended this; it was overruled because the review did not have the read-cap cost model.*

### Command delivery — Chosen: buffered with visible expiry

The plane holds a command until delivered-and-acknowledged, expired, or superseded, and replays unexpired commands on reconnect.

**Why chosen:** a `cancel` must survive a network blip, and on a WAN blips are routine rather than exceptional. Expiry is a *visible terminal state* — an expired command says so loudly rather than vanishing, which is the same silent-drop failure this design rejects in the storage path. Commands must therefore be idempotent.

### Command delivery — Rejected: ephemeral, connected-only

**Why rejected:** a `cancel` during a blip becomes a silent no-op — the worst failure mode on the one destructive command.

### Command delivery — Rejected: split classes (buffered for pause/cancel, ephemeral for the rest)

**Why rejected:** two delivery classes enter the command contract and must be reasoned about at every call site, for a saving that never materializes — the pending-command registry must exist for `cancel` regardless.

## Decisions

### The sidecar is the architecture's center

Naming: **sidecar**, not "agent". Two reasons, and both matter. It is the established industry term for this exact pattern — a co-located process that handles cross-cutting concerns on behalf of the thing it accompanies — so it imports the right intuitions for free rather than asking a reader to learn a local coinage. And this codebase is saturated with coding agents and agent dispatch; reusing that word for a network daemon would collide with its dominant meaning in every future session.

The sidecar owns: the authenticated session to the plane, the command stream, the local socket, the spool and retry, credential custody, clock-skew estimation, and sequence assignment. The CLI owns none of it.

### Local socket closure is the liveness primitive

When a run's process dies, the OS closes its socket to the sidecar immediately. **A closed socket with no preceding `invocation-end` event is a crash** — known in milliseconds, with no heartbeat, no TTL, and no timeout.

This is why the original 60s stale TTL does not get fixed so much as it stops existing for local liveness. The TTL was trying to infer process death across a network from the absence of transition telemetry, which is why any task longer than a minute would have read as stale on a perfectly healthy fleet. Death detection belongs where the OS already answers it for free.

### Two heartbeats, unrelated, both required

- **Transport keepalive** (plane → sidecar, SSE comment frames): an SSE stream carrying no commands is idle by construction, and intermediaries kill idle connections. This proves nothing about process health; it exists to survive load balancers.
- **Session liveness** (sidecar → plane): proves the sidecar and its host are alive and reachable.

Run liveness needs neither — the local socket answers it. Intervals and thresholds are plan-time, pinned by tests.

### Identity — minted, not derived

| Identifier | Lifetime |
|---|---|
| `installationId` | A stack-control installation. **Globally unique, minted once at sidecar first-start and persisted.** Not derived from a path. |
| `invocationId` | One stackctl process invocation; generated fresh at process start. |
| `runId` | One execution run within an invocation. |

Hostname, platform, and runtime versions are **metadata attached to the installation**, not identity.

The original `instanceId` (worktree path + session ID, hashed) failed twice over: it conflated a workspace with a process invocation, and — fatally for a global fleet — a path-derived identifier collides across hosts, since two machines with the same checkout at the same path produce the same hash. Minting the identifier rather than deriving it removes the collision at its root and makes a separate host-identity dimension unnecessary.

### Liveness and execution state are separate axes

The original `live | stale | complete` collapsed three unrelated things. They are separated:

- **connectionStatus** — is the sidecar's session attached?
- **livenessStatus** — is the sidecar answering?
- **executionStatus** — what is the run doing (starting, running, paused, cancelling, cancelled, completed, failed)?

The dashboard derives one summary status for display. No single enum carries three meanings.

### Command lifecycle — commands are tracked objects

Every command carries a plane-generated `commandId` and an explicit state machine covering at minimum accepted → delivered → received → applied, with rejected, failed, and expired as terminal branches. Acknowledgement travels back as telemetry.

The promise: **the operator can always tell what happened to a command they issued.** "Sent" is never presented as "applied". `pause` is cooperative and its requested/applied distinction is visible.

Envelope schema, transition table, and expiry constants are plan-time contracts pinned by RED tests.

### Telemetry shape — event envelope plus snapshot; histories are not resent

Telemetry separates an **event envelope** (identity, `eventId`, `sequence`, schema version, timestamps, event type), a bounded **snapshot** of current state from which the registry updates, and **append-only domain events** from which history is reconstructed.

Histories are never resent. `execution.history[]` and `governance.history[]` on every event is quadratic in run length.

### The sidecar is the sequencer

All of an installation's telemetry passes through one sidecar, which makes it the natural point to assign monotonic sequence. Every event carries a globally unique `eventId` and a monotonic `sequence`. The plane deduplicates by `eventId`, never regresses live registry state from an older sequence, stores late events durably, and surfaces sequence gaps diagnostically.

Without this the dashboard can walk backward from `task-complete` to `task-start` on reordered delivery — likely once retries exist.

### Storage layout — immutable per-event objects

`{bucket}/runs/{installationId}/{runId}/events/{sequence}-{eventId}.json` plus a finalized `summary.json` written once at run end.

The original `events.jsonl` was a defect: object storage does not append, so every event required a read-modify-write of the whole object.

### Read confinement — live runs never touch B2

Live runs are served from the plane's in-memory registry. B2/CF serves only *completed* runs, which are immutable by definition. Cloud reads are confined to exactly the data that caches perfectly.

### Durability is the sidecar's job, and failure is observable

The sidecar spools locally and retries with bounded backoff; the plane tracks and surfaces store health (healthy / degraded / disabled, pending and failed write counts, last success, last failure, last error). A silently dropped write lets an operator believe history is complete when it is not — the same class of lie the command-expiry decision rejects. A dead-letter processing UI is deferred; silent failure is not.

### The CLI fails open, instantly

If no sidecar is reachable, the CLI's local socket connection fails immediately and the invocation continues unaffected. If the sidecar is up but the plane is unreachable, the sidecar absorbs it, spools, and the CLI never knows. There is no network in the interactive path, so there is no timeout to bound.

### Auth is mandatory; tenancy is single-operator

The plane is network-exposed, so TLS and authentication are mandatory. The fleet is **one operator across many hosts**: auth proves a sidecar is the operator's and keeps strangers out. No cross-tenant isolation, no per-instance permissions, no per-operator scoping of history reads.

Credentials are held by the sidecar, never by individual CLI invocations.

### Version skew is a protocol concern

The sidecar outlives the CLI that spawned it, so an upgraded stackctl may meet a stale sidecar. The local protocol carries a version handshake with a defined restart path. This is a consequence of the auto-spawn lifecycle, not an afterthought.

### The plane owns aggregation; stackctl owns execution

The plane aggregates state and issues commands. It does not become the execution engine, the scheduler, or the authority over task execution, pause points, cancellation semantics, or config application. stackctl remains authoritative for all of those.

### Dashboard

Live updates over SSE from the plane; historical views read directly from the Worker. Initial state via REST snapshot, then **deltas** (instance upserted/removed, command updated, store health) — never a full registry push per telemetry event.

Fleet table: one row per commandable run — instance, compass, status, progress, model, git, reconciliation, actions. Instance detail drawer, tabbed: overview, artifacts, execution, governance, timings, reconciliation.

Fleet-wide actions are **fan-out, not atomic**, and are presented as such: the response reports targets/accepted/unavailable and the UI shows per-instance command state. `Cancel all` requires confirmation.

## Open questions

- **Local socket transport and portability.** Unix domain socket (filesystem permissions provide local authorization for free) versus localhost TCP (needs a token and port allocation). Windows needs named pipes. Discovery path for the socket — under the installation root, or a well-known per-user location — is unsettled.
- **Sidecar spawn race and singleton guard.** Two concurrent invocations finding no sidecar must not both spawn one. The lock mechanism, and its behavior on a stale lock from a crashed sidecar, are undefined.
- **Sidecar idle lifetime.** Does an auto-spawned sidecar exit after idle, and if so does the next invocation pay a spawn cost? Interacts with spool durability — a sidecar that exits with a non-empty spool must not lose it.
- **Cloudflare Worker `/query` contract.** Browser-facing, so its request/response schema, versioning, and origin/auth policy are a public interface. Blocks every historical view.
- **Worker read auth.** History is now globally reachable. How the Worker authenticates a read, and how that credential reaches the browser without being exfiltratable, is undesigned.
- **Plane restart.** The in-memory registry and pending-command queue vanish. What happens to live sessions, their SSE streams, and buffered-but-undelivered commands?
- **Telemetry redaction and retention.** Absolute paths, usernames, branch names, commit messages, artifact paths, and error content leave the host for a cloud store. Even single-operator, this needs a redaction boundary, field length caps, a path policy, and a retention policy. The sidecar is the natural place to enforce it — it is the last hop under the operator's control.
- **Artifact reference semantics.** Whether artifacts are filesystem paths, repo-relative paths, URLs, or opaque identifiers is unspecified. Browsers largely will not open `file://` from an HTTP page, and with a *remote* dashboard the paths refer to a filesystem the browser cannot reach at all — so "quick-access links" likely means copy-path, or something richer.
- **`cancel` semantics.** Does cancel interrupt the current task or wait for the task boundary? Are child processes terminated, with what signal? What cleanup is guaranteed? Is the invocation ended or only the run? Can cancellation time out? A future `terminate` (forceful) is named to keep `cancel` (cooperative) unambiguous, even if only `cancel` ships.
- **`config-push` safety.** Needs config schema version, validation, an allowed-key set, apply-timing, persistence after invocation end, and revision/compare-and-set semantics to avoid lost updates.
- **`reconcile` is long-running.** A single acknowledgement cannot represent it; needs its own received/started/completed/failed lifecycle with results linked by `commandId`.
- **Structured errors.** `errors` must not be an unbounded generic field. Needs a structured record (code, message, task, timestamp, recoverable) with details fetched on demand rather than carried in the fleet payload.
- **Completed-instance retention in the live registry.** How long completed/failed/cancelled runs remain in "Recent", and whether "recent" is scoped to invocation or installation. Independent of durable retention.
- **Clock semantics.** Wall-clock timestamps, monotonic process durations, and plane-side receive time coexist across many hosts. Which is authoritative for which purpose, and cross-host ordering must not rely on wall-clock alone. The sidecar is the natural place to estimate skew once per session.
- **Multi-operator tenancy.** Deferred by decision, not by oversight. stack-control is heading toward being a product; if the plane ever serves multiple operators it needs authorization, per-operator history scoping, and the redaction question becomes urgent rather than hygienic. Nothing here should foreclose it.
- **Scope boundary against `multi:feature/control-plane-frontend`.** That roadmap item covers "scope/barrage surfaces, engine-run surfaces" and overlaps this design's dashboard. Whether it is absorbed, re-cut, or left alone is an operator scope decision, unresolved at design time.

## Provenance

Originally designed in-session via `superpowers:brainstorming`, driven through the `/stack-control:design` frontend with the `stack-control-design-v1` house rules injected at the seam.

**Amendment pass 1 — third-party design review.** The review returned "approve with required revisions". Decisive catches, all adopted: `events.jsonl` in object storage is a defect (no append); the 60s stale TTL contradicts transition-only telemetry; per-event histories are quadratic; `instanceId` conflates workspace with invocation; ordering and deduplication were absent; `live | stale | complete` conflates transport health with execution state; command delivery had no lifecycle, acknowledgement, or replay semantics.

One review recommendation was **overruled**: proxying history reads through the plane. The review lacked the B2 read-cap cost model that justifies the CDN; proxying discards browser caching and re-amplifies reads against the exact limit the CDN exists to absorb.

The review's proposed **four-phase delivery** was adopted as *task ordering within a single feature delivery* and rejected as *four separately-shipped features*, per the project's no-partial-delivery rule: partial implementations get abandoned and later work coral-reefs around the stump.

**Amendment pass 2 — operator correction, and it inverted the foundation.** The draft assumed a single-operator, single-machine, localhost-only plane. The operator corrected: the plane is global and may span many hosts. This invalidated a set of decisions that had been recorded as settled:

- **Loopback binding by default** — inverted. The plane is network-exposed by construction.
- **Multi-machine deferred as an open question** — it was the core requirement, demoted to a footnote.
- **CSRF token and cross-origin rejection** — a localhost threat model, replaced by mandatory TLS and authentication.
- **Redaction as a plan-time detail** — telemetry crossing a host boundary to a cloud store is a first-class design concern.
- **The three-identifier taxonomy** — this record had *overruled* the review's `installationId` on the reasoning that installation and workspace are 1:1. That reasoning holds within a host and breaks across hosts, where two machines with identical checkout paths collide. The review was pointing at something real. The resolution is a **minted, globally-unique `installationId`** rather than a path-derived one — which removes the collision at its root and makes a separate host dimension unnecessary. `connectionId` remains an implementation detail of reconnect, not a registry index.

A further operator correction rejected **deployment topology as a design input**: where the plane runs does not change any decision here, and treating hosting as architecture was a category error.

**The comms architecture is the operator's.** The local sidecar — a per-installation service holding a session-oriented connection to the plane, with local invocations connecting to it — was proposed by the operator and is the largest single improvement in this record. It made three previously-recorded requirements coherent for the first time: the local spool (an ephemeral CLI process cannot retry a failed write after it exits), fail-open (there is no longer a network in the interactive path to bound), and process-death detection (local socket closure answers it for free, in milliseconds). It also reopened and reversed the **emit-scope** decision — restricting telemetry to commandable runs had been justified by per-invocation network cost, which the sidecar eliminates.

Two defects the review missed were caught independently:

1. **Every invocation opening a command channel** — the original core sentence attached a command channel to 200ms read-only verbs. The review built a command state machine on top of this without noticing the channel was attached to the wrong thing.
2. **Emitter behavior against an unreachable plane was unspecified** — fully dissolved by the sidecar.

The SSE choice **survived both passes but on entirely different grounds than originally recorded**: the load-bearing argument is NAT traversal (the plane can never dial a sidecar behind a firewall), not traffic shape, and it is now conditional on HTTP/2 for connection economics.

Per the house rules, mechanism was deliberately kept out: command envelope schemas, route namespacing and versioning, heartbeat and backoff constants, socket protocol framing, and retry policy are plan-time contracts pinned by RED tests. Prose cannot carry a write protocol; attempting it is the spec-audit generator this project has a written rule against.

Handoff: `/stack-control:define`.
