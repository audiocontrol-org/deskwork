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

**Conditional, but not a correctness dependency.** The connection economics assume HTTP/2 end-to-end, so the SSE stream and telemetry POSTs multiplex over one TCP connection. Without HTTP/2 the two-connection cost is real — but the system must still *function* over HTTP/1.1 using two connections. Absence of HTTP/2 is a cost, never a protocol failure.

**"Native reconnect" is a browser property and does not come for free here.** `Last-Event-ID` is part of the SSE protocol, but the automatic reconnect semantics people associate with SSE belong to the browser's `EventSource`. The sidecar is a Node client: it must implement the SSE client, the reconnect policy, and cursor advancement explicitly. This record previously cited native reconnect as an advantage of SSE; outside a browser, that advantage is work, not a gift.

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

### Read path — Chosen: the plane is the only reader

The dashboard reads everything from the plane. The plane reads history through the CDN using **canned, low-cardinality queries**, and derives the dashboard-visible artifacts from that data. The browser never talks to the CDN.

**Why chosen:** the CDN sits in front of **B2**, so it shields B2's read caps from whoever the reader is — the reader's identity is irrelevant to the shield. Once that is seen clearly, every argument for putting the browser on that hop collapses, and the costs of doing so are pure loss:

- **Cache keys stay low-cardinality.** The plane owns the query shapes, so reads are canned and reusable and the edge cache actually hits. Arbitrary browser-driven ranges, filters, and pagination would generate a near-unique key per request, degrading the edge cache to nothing and defeating the read-cap protection that justifies the CDN in the first place.
- **There is no browser-held credential, because there is no browser→CDN path.** Any secret available to browser JavaScript is exfiltratable by the user, extensions, XSS, or devtools — so a durable browser credential was never achievable, and the short-lived-grant machinery needed to work around that is now unnecessary.
- **The CDN contract stops being public.** It is an interface between two things we control, not a browser-facing API needing an origin policy, CORS, and a public versioning story.
- **One dashboard backend.**
- **It answers who precomputes aggregates:** the plane does, and caches the derived artifacts. A cold cache re-reads through the CDN, which is cached, which does not touch B2.

**Accepted cost:** the plane is in the history read path and must cache derived artifacts to avoid re-reading per request. This is cheap — the plane is our own infrastructure and is not the capped resource; B2 is.

### Read path — Rejected: browser reads the CDN directly

Historical views fetched by the dashboard straight from the edge; live state over SSE from the plane.

**Why rejected:** preserves browser cache on top of edge cache, but buys it with high-cardinality cache keys (which defeat the edge cache the CDN exists to provide), an impossible browser-credential problem, a public CDN contract, and a second endpoint for the dashboard to trust. *This record chose this option in a previous pass, on the reasoning that proxying "discards browser caching and re-amplifies reads." That reasoning was wrong: it mislocated the CDN as sitting on the browser hop rather than in front of B2. The first design review recommended proxying and was overruled on this mistaken basis; the review's recommendation was correct.*

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

### Local socket closure is the liveness primitive — but it proves disconnection, not death

When a run's process dies, the OS closes its socket to the sidecar immediately. This is the liveness primitive: no heartbeat, no TTL, no timeout, and the signal arrives in milliseconds.

**What it proves is narrower than it first appears.** A closed socket with no preceding `invocation-end` event means **abnormal disconnection**, not conclusively a crash. The same observation is produced by SIGKILL, machine shutdown, a local socket failure, a protocol-version restart, a process detaching — and, decisively, **by the sidecar itself restarting, which closes every socket at once while no run has died at all.** A sidecar that concluded "all my runs crashed" on restart would be maximally wrong at the worst possible moment.

So the recorded state is `abnormally-disconnected` with termination reason unknown, and the sidecar opens a bounded reconciliation window in which runs may reconnect and re-announce themselves. A run that reconnects was never dead; a run that does not is presumed gone when the window closes.

This still retires the original 60s stale TTL, which tried to infer process death across a network from the absence of transition telemetry — which is why any task longer than a minute would have read as stale on a healthy fleet. Local liveness belongs where the OS answers it. It is the *interpretation* of that answer that must stay honest about what it knows.

### The sidecar is subordinate: runs survive its restart

The sidecar removed WAN failure from the CLI path but introduced a local dependency for commandability and durable telemetry. That dependency is **subordinate to execution, never above it**:

- A running stackctl process **continues executing** if its sidecar connection dies. It never blocks on reconnection.
- It retries the local connection without blocking, and resumes telemetry and commandability when the sidecar returns.
- While disconnected it is **temporarily uncommandable**, which the fleet view must show honestly rather than presenting it as healthy.

**Long-running commandable runs carry a small bounded in-memory buffer** so a sidecar restart does not punch a hole in the event stream. This is deliberately scoped: short verbs get **no** buffer and simply drop on a sidecar-unavailable socket, because a 200ms process exits long before a sidecar returns and buffering would be ceremony. Long-term durability remains the sidecar's job; the buffer covers only the restart gap.

### Delivery is at-least-once — say so plainly

The combination of local spooling, retries, deduplication, immutable objects, and assigned sequence invites an exactly-once reading. It is not:

- **transmission:** at-least-once
- **ingestion:** idempotent
- **registry application:** effectively-once

Durable storage may transiently contain duplicate attempts unless object naming makes duplication impossible. Stating this here prevents tests and operator expectations from later assuming a guarantee the system does not offer.

### Two heartbeats, unrelated, both required

- **Transport keepalive** (plane → sidecar, SSE comment frames): an SSE stream carrying no commands is idle by construction, and intermediaries kill idle connections. This proves nothing about process health; it exists to survive load balancers.
- **Session liveness** (sidecar → plane): proves the sidecar and its host are alive and reachable.

Run liveness needs neither — the local socket answers it. Intervals and thresholds are plan-time, pinned by tests.

### Identity — minted, not derived

| Identifier | Lifetime |
|---|---|
| `installationId` | A stack-control installation. **Globally unique, minted once at sidecar first-start and persisted machine-locally.** Not derived from a path. |
| `invocationId` | One stackctl process invocation; generated fresh at process start. |
| `runId` | One execution run within an invocation. |

Hostname, platform, and runtime versions are **metadata attached to the installation**, not identity. So are `repositoryRemote` and `workspacePath` — the dashboard will want to group installations that correspond to the same repository, and grouping metadata must never be mistaken for authoritative identity.

The original `instanceId` (worktree path + session ID, hashed) failed twice over: it conflated a workspace with a process invocation, and — fatally for a global fleet — a path-derived identifier collides across hosts, since two machines with the same checkout at the same path produce the same hash. Minting the identifier rather than deriving it removes the collision at its root and makes a separate host-identity dimension unnecessary.

**Minting is not sufficient on its own — where the identifier lives is load-bearing.** `.stack-control/` is version-controlled; the roadmap, backlog, and workflow documents live there and are committed. Persisting `installationId` anywhere inside version-controlled or copyable installation content would ship one identifier to every clone — reintroducing, one layer down, exactly the collision that minting exists to prevent.

Therefore: **`installationId` is machine-local runtime identity. It is persisted outside version-controlled installation content, is never committed, and is never intentionally copied.** An installation directory that arrives on another host by clone or copy must **re-mint**; identity does not travel with the tree.

### Liveness and execution state are separate axes

The original `live | stale | complete` collapsed three unrelated things. They are separated:

- **connectionStatus** — is the sidecar's session attached?
- **livenessStatus** — is the sidecar answering?
- **executionStatus** — what is the run doing (starting, running, paused, cancelling, cancelled, completed, failed)?

The dashboard derives one summary status for display. No single enum carries three meanings.

### Command lifecycle — commands are tracked objects

Every command carries a plane-generated `commandId` and an explicit state machine covering at minimum accepted → delivered → received → applied, with rejected, failed, and expired as terminal branches. Acknowledgement travels back as telemetry.

The promise: **the operator can always tell what happened to a command they issued.** "Sent" is never presented as "applied". `pause` is cooperative and its requested/applied distinction is visible.

**`accepted` survives plane restart.** This is a design-level decision, not a plan-level one, because it fixes what the word *means*. An in-memory pending-command registry plus an undefined restart behavior would let a `cancel` accepted a second before restart vanish silently — which makes the promise above false in exactly the case that matters most. So the plane durably records a command before returning `accepted`, and the durable record is authoritative across restart. The persistence mechanism is plan-time; the guarantee is not.

**Supersession rules are command-specific, never generic.** `resume` supersedes a pending un-applied `pause`; a newer `config-push` supersedes an older un-applied revision; two `cancel`s deduplicate rather than queueing; whether `reconcile` requests coalesce is its own question. "Superseded" is a valid terminal state, but there is no universal rule for when it applies.

**Stream replay position is not command status.** `Last-Event-ID` tracks which command *frames the stream delivered* — it says nothing about whether a run received or applied anything. The sidecar's replay cursor and the command lifecycle are separate state with separate advancement rules; conflating them would let a delivered-but-unapplied command look complete.

Envelope schema, transition table, and expiry constants are plan-time contracts pinned by RED tests.

### Telemetry shape — event envelope plus snapshot; histories are not resent

Telemetry separates an **event envelope** (identity, `eventId`, `sequence`, schema version, timestamps, event type), a bounded **snapshot** of current state from which the registry updates, and **append-only domain events** from which history is reconstructed.

Histories are never resent. `execution.history[]` and `governance.history[]` on every event is quadratic in run length.

### The sidecar is the sequencer — and there are two sequences, not one

All of an installation's telemetry passes through one sidecar, which makes it the natural sequencing point. Every event carries a globally unique `eventId` and **two** monotonic sequences:

- **`installationSequence`** — the sidecar's outbound emission order. Used for transport diagnostics, gap detection, and spool restoration.
- **`invocationSequence`** — per-invocation order. This is the one with domain meaning.

They are not interchangeable. An installation-wide sequence interleaves every concurrent invocation and every short verb into one counter, so it defines *emission order at the sidecar*, **not causal ordering across simultaneous runs**. Using it for domain ordering would imply relationships between concurrent runs that do not exist.

The plane deduplicates by `eventId`, never regresses live registry state from an older sequence, stores late events durably, and surfaces sequence gaps diagnostically. Without this the dashboard can walk backward from `task-complete` to `task-start` on reordered delivery — likely once retries exist.

### Redaction happens before the spool, not after

The sidecar is the redaction boundary — it is the last hop under the operator's control before telemetry leaves the host. **Ordering within the sidecar is load-bearing:** redacting after spooling would leave raw paths, usernames, and error content persisted on local disk, which defeats the point.

The pipeline is: receive local raw event → validate local protocol → normalize and redact → assign durable `eventId` and sequence → write spool record → transmit.

This ordering also yields a useful invariant: **the spooled object is identical to the object eventually transmitted and stored.** Nothing is redacted in flight, so a spooled record can be replayed byte-for-byte after a restart.

### Everything emits locally; not everything becomes a cloud object

"Every invocation telemeters" is a statement about the *local* hop. It is not a commitment that every event becomes an immutable B2 object — an operator with shell completions, status checks, editor integrations, or automation loops would otherwise mint cloud objects at a rate nobody asked for.

The sidecar classifies each event: **live-only** (never durably stored — heartbeats belong here), **aggregated** (rolled into a summary rather than stored individually), or **durable** (its own immutable object). The classification, not the emission, decides cost.

Boundedness principles that follow, with values pinned at plan time: a maximum event size; a spool size cap with a defined drop policy naming what is discarded first; and the sidecar's reserved right to coalesce or sample. Rollup *machinery* is not built until volume justifies it, but the classification seam exists from the start so adding it later changes no contract.

### Storage layout — immutable per-event objects

`{bucket}/runs/{installationId}/{runId}/events/{sequence}-{eventId}.json` plus a finalized `summary.json` written once at run end.

The original `events.jsonl` was a defect: object storage does not append, so every event required a read-modify-write of the whole object.

### Read confinement — live runs never touch B2

Live runs are served from the plane's in-memory registry. B2/CF serves only *completed* runs, which are immutable by definition. Cloud reads are confined to exactly the data that caches perfectly.

### Durability is the sidecar's job, and failure is observable at both hops

The sidecar spools locally and retries with bounded backoff. A silently dropped write lets an operator believe history is complete when it is not — the same class of lie the command-expiry decision rejects. A dead-letter processing UI is deferred; silent failure is not.

**There are two durability queues and they fail for unrelated reasons**, so one "store degraded" indicator would be ambiguous exactly when it matters:

- **Uplink health** (sidecar → plane): this host cannot reach the plane. Sidecar spool depth is the signal.
- **Archive health** (plane → B2): the plane cannot persist. Pending and failed write counts are the signal.

Both are surfaced independently — healthy / degraded / disabled, with pending counts, last success, last failure, and last error. "Degraded" must always answer *which hop*.

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

Everything comes from the plane — live state and history alike. Live updates over SSE; initial state via REST snapshot, then **deltas** (instance upserted/removed, command updated, store health) — never a full registry push per telemetry event. Historical views are served from artifacts the plane derived and cached.

Fleet table: one row per commandable run — instance, compass, status, progress, model, git, reconciliation, actions. Instance detail drawer, tabbed: overview, artifacts, execution, governance, timings, reconciliation.

Fleet-wide actions are **fan-out, not atomic**, and are presented as such: the response reports targets/accepted/unavailable and the UI shows per-instance command state. `Cancel all` requires confirmation.

## Open questions

- **Local socket transport and portability.** Unix domain socket (filesystem permissions provide local authorization for free) versus localhost TCP (needs a token and port allocation). Windows needs named pipes. Discovery path for the socket — under the installation root, or a well-known per-user location — is unsettled.
- **Sidecar spawn race and singleton guard.** Two concurrent invocations finding no sidecar must not both spawn one. The lock mechanism, and its behavior on a stale lock from a crashed sidecar, are undefined.
- **Sidecar idle lifetime.** Does an auto-spawned sidecar exit after idle, and if so does the next invocation pay a spawn cost? Interacts with spool durability — a sidecar that exits with a non-empty spool must not lose it.
- **CDN read mechanism.** The design fixes that the plane is the only reader and that its queries are canned and cacheable. *How* the shield is built — an edge Worker doing listing and range logic, or CF as a pull-through cache with immutable period manifests making listing unnecessary — is a plan-time choice to settle against real numbers. Listing is an uncacheable B2 transaction, which is the constraint any mechanism must answer. Deciding this in prose now would be false precision.
- **Derived-artifact staleness and backfill.** The plane derives and caches dashboard artifacts. What invalidates a derived artifact, what happens when a late event arrives after derivation, and how a bad artifact is rebuilt are undefined.
- **Plane restart, beyond commands.** Command acceptance now survives restart by decision. The in-memory *registry* still vanishes: what happens to live sessions and their SSE streams on restart, and how relays re-announce, is undefined.
- **Telemetry redaction and retention.** Absolute paths, usernames, branch names, commit messages, artifact paths, and error content leave the host for a cloud store. Even single-operator, this needs a redaction boundary, field length caps, a path policy, and a retention policy. The sidecar is the natural place to enforce it — it is the last hop under the operator's control.
- **Artifact reference semantics.** Whether artifacts are filesystem paths, repo-relative paths, URLs, or opaque identifiers is unspecified. Browsers largely will not open `file://` from an HTTP page, and with a *remote* dashboard the paths refer to a filesystem the browser cannot reach at all — so "quick-access links" likely means copy-path, or something richer.
- **Reconciliation window length.** How long the sidecar waits for an abnormally-disconnected run to reconnect before presuming it gone, and what the fleet view shows during the window.
- **Sidecar spawn race and stale locks.** Two concurrent invocations finding no sidecar must not both spawn one. The lock mechanism, and its behavior against a stale lock left by a crashed sidecar, are undefined.
- **Sidecar idle lifetime versus spool durability.** If an auto-spawned sidecar idle-exits, it must not exit holding an un-flushed spool. The interaction between idle-exit and spool drain is undefined.
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

The SSE choice **survived both passes but on entirely different grounds than originally recorded**: the load-bearing argument is NAT traversal (the plane can never dial a sidecar behind a firewall), not traffic shape.

**Amendment pass 3 — second design review, and an operator correction that reversed the read path.**

The second review's decisive catches, all adopted: `installationId` persisted inside copyable installation content would ship one identity to every clone, reintroducing the collision minting exists to prevent; socket closure proves abnormal *disconnection*, not death — and a sidecar restart closes every socket while nothing has died; sidecar-restart continuity was missing entirely; the exactly-once temptation needed naming; `accepted` could not survive plane restart while the record promised the operator always knows a command's fate; redaction must precede spooling or raw data persists on disk; one installation-wide sequence conflates transport order with causal order; store health needs an uplink/archive split; SSE reconnect is not free outside a browser; `Last-Event-ID` is a stream cursor, not command status; supersession rules cannot be generic; and "everything telemeters" must not mean "every event becomes a cloud object".

The review's framing — *approve at design level, with issues to become contracts in `/define`* — was not adopted, for the same reason as pass 1: four of the issues it raised are **decisions**, not downstream contracts, and it elevated them as needing answers before `/define` itself. There is no approved-with-asterisks state; this was an amendment pass.

Two review positions were **refined rather than adopted wholesale**: the invocation-side buffer is scoped to long-running commandable runs only (a 200ms verb exits long before a sidecar returns, so buffering it is ceremony), and the immutable-resource discipline was noted to carry a real cost — cross-run aggregates require someone to precompute them, which the read-path reversal then assigned to the plane.

**The read path was reversed by operator correction, and this record's previous reasoning was wrong.** The dashboard does not read the CDN; the plane is the only reader, running canned cacheable queries and deriving dashboard artifacts. The prior pass had chosen browser-direct reads on the reasoning that proxying "discards browser caching and re-amplifies reads" — which **mislocated the CDN as sitting on the browser hop rather than in front of B2.** The CDN shields B2's read caps from *whoever reads*; the reader's identity never mattered. This was the second instance of the same category error in this design's history: the first draft asked "why a CDN for a localhost dashboard," treating a CDN as user-facing edge delivery rather than a read-amplification shield in front of an expensive origin.

The reversal resolved the second review's sharpest finding (high-cardinality cache keys defeating the edge cache) and dissolved another (a browser-held credential is exfiltratable by construction) — both by construction rather than by mechanism. It also vindicates the **first** review's proxy recommendation, which this record had overruled on the mistaken basis above.

A further correction rejected an attempt to settle **whether the Worker survives** as a design decision: with the plane as sole reader, the shield's mechanism is a plan-time choice against real numbers, and forcing it in prose is false precision — the same failure this record criticizes the reviews for.

Per the house rules, mechanism was deliberately kept out: command envelope schemas, route namespacing and versioning, heartbeat and backoff constants, socket protocol framing, and retry policy are plan-time contracts pinned by RED tests. Prose cannot carry a write protocol; attempting it is the spec-audit generator this project has a written rule against.

Handoff: `/stack-control:define`.
