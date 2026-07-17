# Feature Specification: Fleet Control Plane

**Feature Branch**: `feature/fleet-control-plane`

**Created**: 2026-07-16

**Status**: Draft

**Input**: Design record `docs/superpowers/specs/2026-07-16-fleet-control-plane-design.md` (roadmap item `design:feature/fleet-control-plane`, `design-approved: yes`). That record is the authoritative source of intent; its decisions are settled and are not re-derived here.

## Context

stack-control manages development effort across many worktrees, sessions, hosts, and workstreams at once. Today an operator running parallel `stackctl execute` runs across several worktrees — on several machines — must switch terminal context to see progress, cannot pause or cancel a run from a central surface, and has no historical record of how long design / spec / execution / governance phases actually take. Roadmap and backlog state drift silently across worktrees with no reconciliation signal.

This feature adds a **control plane**: a network-reachable service that stack-control installations report into from wherever they run, aggregating that state into a live operator view with active control over each run, exposed over the plane's API. (The design record frames the consumer of that view as a dashboard; per the scope boundary below, the dashboard itself is a separate feature and this one delivers the plane and everything beneath it.)

### How to read the priorities in this spec

Story priorities (P1…P6) denote **task ordering within a single feature delivery**. They are **not** a scope cut and **not** separately-shipped increments. The design record explicitly adopted the reviews' four-phase proposal as ordering *within one delivery* and rejected it as four separately-shipped features, per the project's no-partial-delivery rule (partial implementations get abandoned and later work coral-reefs around the stump). A reader looking for the line below which work is dropped will not find one here: scoping is a separate, explicit, operator-driven pass (Constitution Principle II).

### Scope boundary — the plumbing and its API; not the frontend

**Operator scope decision, 2026-07-16.** The browser dashboard is **not** in this feature. The framing: *"I don't want to build the dashboard UI in this scope of work — I want to get the plumbing right before trying to slap a frontend on it."* The cut is recorded, not lost: the dashboard is now the roadmap item `design:feature/fleet-dashboard`, which `depends-on` this feature (a hard edge, satisfied only when this ships) so it cannot go ready until there is real fleet state for it to be *about*. The design record's dashboard design is **kept, not stripped**.

This is the capture-then-scope pass working as designed (Constitution Principle II): the design record captured everything; this is the operator's explicit, separate scoping pass. It is **not** an agent-inserted YAGNI cut.

**What stays, and why it is not speculative.** The plane's dashboard-facing HTTP surface — snapshot, deltas, command issuance, history — **is** in scope. It is the top edge of the plumbing, and it is exercised for real from day one rather than built for an imagined consumer: **the feature is dogfooded as it is built.** The sidecar and the plane are run, and *the same API requests a dashboard would make* are driven against them, to find out whether it works or how it is broken, in a tight feedback loop. That is the project's `agent-as-user dogfood mode` rule (`.claude/rules/agent-discipline.md`) applied to this feature: the agent building it is its first real consumer and its most demanding adopter. So the API has a concrete instance flowing through it now, and the dashboard becomes its *second* consumer later — the order Principle II requires, rather than an abstraction designed from a single imagined one.

What is therefore out of scope here, and belongs to `design:feature/fleet-dashboard`: browser markup and layout, the fleet table's visual presentation, the instance drawer's tabbed rendering, and destructive-action confirmation UX. Requirements below specify **what the plane computes and exposes**, never how a browser renders it.

### The constraint that dominates every other

**The control plane must never degrade the tool it observes.** stackctl verbs run constantly and interactively. An unreachable, slow, or broken control plane must not slow, block, or fail any stackctl invocation. Observation is strictly subordinate to the thing observed. Where any requirement below appears to trade against this constraint, this constraint wins.

## Clarifications

### Session 2026-07-16

- Q: The design record makes authentication mandatory but never states what the credential is, and the mechanism appears in neither its open questions nor this spec's Plan-Time Contracts — so it was an omission rather than a deliberate plan-time deferral. What authenticates a sidecar to the plane, and how does a new host get a credential? → A: A long-lived bearer token minted per installation, provisioned into the sidecar's machine-local config alongside `installationId`. Rejected: a fleet-wide shared secret (no per-installation revocation), mTLS client certificates (buys per-client identity the single-operator tenancy explicitly does not need, at the cost of certificate lifecycle), and a join-code enrollment handshake (better new-host UX, more machinery than a single-operator fleet warrants).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Emit telemetry without ever taxing the CLI (Priority: P1)

An operator runs stackctl verbs constantly. Every invocation reports what it is doing to a local sidecar over a local socket, and the invocation is never slowed, blocked, or failed by the state of the network, the sidecar, or the plane. If the plane is unreachable, the operator cannot tell from the CLI's behavior.

**Why this priority**: This is the constraint the whole comms architecture exists to satisfy, and the foundation every other story stands on. If emission can tax the CLI, the feature is a net harm regardless of what is later built on top of it.

**Independent Test**: Measure invocation wall-clock across the matrix of plane states — reachable, unreachable, slow/hanging, sidecar absent, sidecar mid-restart, sidecar version-skewed — and confirm no measurable degradation and no failure in any cell.

**Acceptance Scenarios**:

1. **Given** no sidecar is running, **When** any stackctl verb is invoked, **Then** the local connection fails immediately, the verb completes normally with unchanged output and exit code, and a sidecar is auto-spawned for subsequent invocations.
2. **Given** a sidecar is running but the plane is unreachable, **When** any stackctl verb is invoked, **Then** the verb is unaffected, the sidecar absorbs the failure and spools locally, and the CLI is never informed.
3. **Given** the plane hangs without responding, **When** any stackctl verb is invoked, **Then** the verb completes at its normal speed, because no network operation exists in the interactive path to time out.
4. **Given** two invocations start concurrently and find no live sidecar, **When** both attempt to spawn one, **Then** exactly one sidecar exists afterward and both invocations proceed unaffected.
5. **Given** an upgraded stackctl meets a sidecar running an older local protocol version, **When** it connects, **Then** the version mismatch is detected via the handshake and resolved by the defined restart path, without failing the invocation.

---

### User Story 2 - Aggregate the whole fleet into one live, queryable view (Priority: P2)

The plane aggregates every commandable run across every host into one live view of the fleet — what each run is, where it is, what it is doing, how far along, and whether it is healthy — and exposes it over its API. A client fetches one snapshot and then follows deltas. Today that client is the developer dogfooding the plane; later it is the dashboard.

**Why this priority**: This aggregation is the feature's headline value and the reason the telemetry exists. It is what a dashboard would later render, and it is fully verifiable without one.

**Independent Test**: Register commandable runs from multiple installations on multiple hosts, then drive the plane's API exactly as a dashboard would — confirm each run appears exactly once with correct attributes, and that live progress arrives as deltas.

**Acceptance Scenarios**:

1. **Given** commandable runs are active across several hosts, **When** a client requests the initial snapshot, **Then** it receives exactly one entry per commandable run, each carrying instance, compass, status, progress, model, git, and reconciliation state.
2. **Given** a client is following the live stream, **When** a run progresses, **Then** it receives a delta describing only what changed — never a full registry push per telemetry event.
3. **Given** short-lived verbs are being invoked constantly, **When** the fleet is requested, **Then** those invocations are **not** fleet entries, because the fleet means "runs you can act on" — while their timing data remains retrievable.
4. **Given** a specific run, **When** its detail is requested, **Then** overview, artifacts, execution, governance, timings, and reconciliation data are available for it.
5. **Given** two installations correspond to the same repository, **When** the fleet is exposed, **Then** grouping metadata permits a client to group them without that metadata ever being treated as identity.

---

### User Story 3 - Act on a run and always know what happened to the command (Priority: P3)

An operator pauses, resumes, cancels, pushes config to, or requests reconciliation of a run through the plane, and can always tell what happened to that command — whether it was accepted, delivered, received, applied, rejected, failed, expired, or superseded. "Sent" is never reported as "applied".

**Why this priority**: Active control is the difference between a telemetry pipeline and a control plane. The promise that the operator always knows a command's fate is what makes it trustworthy.

**Independent Test**: Issue each command type against runs in each reachable/unreachable state, and confirm the command's state machine is observable end-to-end and never reports a state stronger than what actually occurred.

**Acceptance Scenarios**:

1. **Given** a run is executing, **When** `pause` is issued, **Then** the command is tracked with a plane-generated identifier and its requested-versus-applied distinction is observable, because pause is cooperative.
2. **Given** a `cancel` is issued during a network blip, **When** connectivity returns, **Then** the buffered command is replayed and applied rather than silently dropped.
3. **Given** a command is accepted and the plane restarts a second later, **When** the plane returns, **Then** the command's `accepted` state survived the restart and is honored from the durable record.
4. **Given** a command is delivered but never applied, **When** its status is queried, **Then** it reports as delivered — not complete — because stream replay position is not command status.
5. **Given** a command is never delivered before its expiry, **When** it expires, **Then** it enters an observable terminal expired state that says so loudly rather than vanishing.
6. **Given** a pending un-applied `pause`, **When** `resume` is issued, **Then** the pause is superseded per that command's specific supersession rule.
7. **Given** two `cancel` commands for one run, **When** both are issued, **Then** they deduplicate rather than queueing, and re-delivery of an already-applied command is harmless because commands are idempotent.
8. **Given** a fleet-wide action is issued, **When** it is applied, **Then** it fans out non-atomically and its response says so — reporting targets, accepted, and unavailable — with per-instance command state individually observable.
9. **Given** a `reconcile` is issued, **When** it runs, **Then** its long-running lifecycle (received / started / completed / failed) is tracked and its results are linked by command identifier — a single acknowledgement does not represent it.

---

### User Story 4 - Trust what the fleet view says, including about failure (Priority: P4)

The operator can trust what the fleet state claims. It distinguishes disconnection from death, uplink failure from archive failure, and requested from applied. It never reports a run as healthy when it is uncommandable, and never silently drops history while implying completeness.

**Why this priority**: A fleet view that lies is worse than no fleet view. The design's primary identified risk is distributed-systems ambiguity, and this story is where that risk is discharged.

**Independent Test**: Induce each ambiguous condition — process kill, sidecar restart, machine shutdown, plane-unreachable, durable-store-unreachable, late event arrival — and confirm the surfaced state matches what is actually known, with no overclaim.

**Acceptance Scenarios**:

1. **Given** a run's process dies, **When** its local socket closes with no preceding end-of-invocation event, **Then** the run is recorded as abnormally disconnected with termination reason unknown — not as crashed — and a bounded reconciliation window opens.
2. **Given** the sidecar restarts, closing every local socket at once while no run has died, **When** the runs reconnect and re-announce within the reconciliation window, **Then** none is presumed dead.
3. **Given** a run does not reconnect before the reconciliation window closes, **When** the window closes, **Then** it is presumed gone.
4. **Given** a run's sidecar connection is lost while the run continues executing, **When** the fleet state is read, **Then** the run reports honestly as temporarily uncommandable rather than as healthy.
5. **Given** the sidecar cannot reach the plane, **When** health is surfaced, **Then** uplink health is reported independently — with spool depth, last success, last failure, and last error — and names which hop is degraded.
6. **Given** the plane cannot persist to the durable store, **When** health is surfaced, **Then** archive health is reported independently — with pending and failed write counts — and "degraded" always answers *which hop*.
7. **Given** events are retried and may arrive more than once, **When** they are ingested, **Then** duplicates are removed by event identifier, live registry state never regresses to an older sequence, late events are stored durably rather than discarded, and sequence gaps are exposed diagnostically.
8. **Given** the system's guarantees are described to an operator or a test, **When** delivery semantics matter, **Then** they are stated plainly as at-least-once transmission, idempotent ingestion, and effectively-once registry application — never as exactly-once.

---

### User Story 5 - Serve history without amplifying the capped resource (Priority: P5)

Historical runs and phase timings — how long design, spec, execution, and governance actually took — are retrievable from the plane, and those reads are served without amplifying transactions against the read-capped durable store.

**Why this priority**: History is the durable payoff of collecting telemetry, and read economics are the constraint that shapes the storage and read path. Any read path that amplifies capped transactions is a defect.

**Independent Test**: Drive repeated and varied historical reads against the plane's API and confirm capped-store read transactions stay flat rather than scaling with client traffic.

**Acceptance Scenarios**:

1. **Given** a client requests a historical view, **When** it is served, **Then** it comes from artifacts the plane derived and cached, and no client other than the plane ever contacts the content-delivery layer.
2. **Given** many repeated historical reads, **When** they are served, **Then** capped-store read transactions do not scale with them, because the delivery layer absorbs repeats.
3. **Given** the plane's derived-artifact cache is cold, **When** a historical view is requested, **Then** the plane re-reads through the delivery layer using canned, low-cardinality queries that hit its cache — and the capped store is not touched.
4. **Given** live runs are requested, **When** their state is read, **Then** it is served from the plane's in-memory registry, because cloud reads are confined to finalized run artifacts.
5. **Given** a late event arrives after a run was finalized, **When** it is stored, **Then** it lands as a new object and triggers a new derived-artifact revision or an explicit correction path — no published event object is ever mutated.
6. **Given** phase durations across the fleet are requested, **When** timings are read, **Then** design, spec, execution, and governance phase durations are available as historical record.

---

### User Story 6 - Operate the fleet safely across a hostile network (Priority: P6)

The fleet spans hosts behind NAT and firewalls in arbitrary network conditions. The operator's telemetry is authenticated and encrypted in transit, credentials never sprawl across CLI processes, and the operator's identity is not sent to a stranger's plane.

**Why this priority**: The plane is network-exposed by construction, which makes transport security and authentication mandatory rather than deferrable.

**Independent Test**: Confirm connections are refused without valid credentials and without transport encryption, that no CLI process holds credentials, and that connectivity is established from behind NAT with no inbound reachability.

**Acceptance Scenarios**:

1. **Given** a host behind NAT with no inbound reachability, **When** its sidecar connects, **Then** the session is established entirely by sidecar-outbound connections, because the plane can never dial a sidecar.
2. **Given** an unauthenticated client, **When** it attempts to connect to the plane, **Then** it is refused.
3. **Given** any stackctl invocation, **When** it emits telemetry, **Then** it holds no plane credentials — credentials are held only by the sidecar.
4. **Given** an intermediary that blocks connection-upgrade protocols, **When** the sidecar connects, **Then** the command stream still traverses it as plain HTTP.
5. **Given** an idle command stream carrying no commands, **When** intermediaries would kill it as idle, **Then** transport keepalive frames keep it alive — while proving nothing about process health.
6. **Given** the sidecar and its host are alive, **When** session liveness is reported to the plane, **Then** it is reported by a mechanism distinct from transport keepalive, and neither is used to infer run liveness.
7. **Given** an operating environment without end-to-end connection multiplexing, **When** the sidecar operates, **Then** the system still functions using separate connections — the absence of multiplexing is a cost, never a protocol failure.

---

### Edge Cases

- **An installation tree is cloned or copied to another host.** Identity must not travel with the tree: the copy re-mints its own installation identity rather than reporting as the original.
- **Two machines hold the same checkout at the same filesystem path.** They must not collide into one identity — identity is minted, never derived from a path.
- **The sidecar restarts mid-run.** Long-running commandable runs continue executing, retry the local connection without blocking, and resume telemetry and commandability when it returns; their bounded in-memory buffer covers the restart gap without a hole in the event stream.
- **A short verb meets an unavailable sidecar.** It drops its event and exits — no buffer, no ceremony, because a 200ms process exits long before a sidecar returns.
- **The sidecar exits while holding an un-flushed spool** — including via `SIGKILL`, which runs no code. Spooled telemetry MUST survive and replay on restart. *(Amended at plan time per research.md R-03: the original phrasing, "must not exit holding an un-flushed spool", promised a guarantee no shutdown sequence can keep — `SIGKILL` runs no code and Windows delivers no real `SIGTERM`. The requirement is inverted: a crash-safe write-ahead spool makes exiting-with-a-spool non-catastrophic rather than impossible, which is falsifiable by killing a sidecar mid-spool and asserting no loss on restart.)*
- **The spool reaches its size cap.** A defined drop policy names what is discarded first, and the loss is observable rather than silent.
- **An event exceeds the maximum event size.** Bounded rather than transmitted unbounded.
- **A stale lock is left by a crashed sidecar.** Spawn must not deadlock against it.
- **The plane restarts while sessions and command streams are attached.** Accepted commands survive by decision; live registry reconstruction and stream re-announcement are defined at plan time.
- **Telemetry contains absolute paths, usernames, branch names, commit messages, or error content.** Redaction happens before the spool — never after — so raw data never persists on local disk.
- **A run reconnects after being presumed gone.** The presumption was wrong and must be correctable.
- **An operator's automation loop invokes stackctl at high frequency.** Event classification — not emission — decides cost, so cloud objects are not minted at a rate nobody asked for.
- **Concurrent invocations emit simultaneously.** Installation-wide emission order must not be mistaken for causal ordering across concurrent runs.
- **A `config-push` races another config revision.** Lost updates must be prevented.
- **A client is offered access to an artifact on a filesystem it cannot reach.** A remote client refers to a filesystem that is not its own, so artifact references cannot be assumed openable (PT-009).

## Requirements *(mandatory)*

### Functional Requirements — Comms topology and the CLI's fail-open contract

- **FR-001**: Each stack-control installation MUST run a long-lived local sidecar process that maintains one authenticated, session-oriented connection to the control plane. One session up; N local connections down.
- **FR-002**: Local stackctl invocations MUST emit telemetry to the sidecar over a local socket and MUST NOT open any WAN connection. No network operation exists in the interactive path.
- **FR-003**: When no sidecar is reachable, the CLI's local connection MUST fail immediately and the invocation MUST continue unaffected in output, exit code, and wall-clock.
- **FR-004**: When the sidecar is reachable but the plane is not, the sidecar MUST absorb the failure and spool locally; the CLI MUST NOT be informed.
- **FR-005**: A running stackctl process MUST continue executing if its sidecar connection dies, MUST NOT block on reconnection, MUST retry the local connection without blocking, and MUST resume telemetry and commandability when the sidecar returns.
- **FR-006**: While disconnected from its sidecar, a run MUST be surfaced as temporarily uncommandable, never as healthy.
- **FR-007**: Long-running commandable runs MUST carry a small bounded in-memory buffer covering a sidecar restart gap. Short verbs MUST NOT buffer and MUST drop on a sidecar-unavailable socket.
- **FR-008**: Any invocation finding no live sidecar MUST start one, guarded against concurrent spawn so that exactly one sidecar results.
- **FR-009**: The sidecar MUST be runnable under external supervision (e.g. launchd/systemd) as an alternative to auto-spawn, without changing the local contract.
- **FR-010**: The local protocol MUST carry a version handshake with a defined restart path, because the sidecar outlives the CLI that spawned it and an upgraded stackctl may meet a stale sidecar.
- **FR-011**: One sidecar MUST be scoped to one installation, using that installation's config and credentials, with no cross-installation coordination. The local socket contract MUST be identical under a per-host sidecar so that promotion stays contained.

### Functional Requirements — Emission scope and event classification

- **FR-012**: Every stackctl invocation MUST emit to the local sidecar.
- **FR-013**: Only long-running interruptible runs (`execute`, `govern`) MUST register as commandable fleet instances. The fleet means "runs you can act on".
- **FR-014**: CLI usage and timing data across every verb MUST be available without those invocations appearing as fleet entries.
- **FR-015**: The sidecar MUST classify each event as live-only (never durably stored — heartbeats belong here), aggregated (rolled into a summary), or durable (its own immutable object). Classification, not emission, decides cost.
- **FR-016**: The classification seam MUST exist from the start so that adding rollup machinery later changes no contract.
- **FR-017**: The sidecar MUST reserve the right to coalesce or sample, and MUST enforce a maximum event size and a spool size cap with a defined drop policy naming what is discarded first.

### Functional Requirements — Transport

- **FR-018**: Every connection between a sidecar and the plane MUST be sidecar-outbound, because hosts sit behind NAT and firewalls and the plane can never dial a sidecar.
- **FR-019**: The sidecar MUST receive commands over a held-open server-sent event stream and MUST send telemetry via HTTP POST.
- **FR-020**: The sidecar MUST implement its stream client, reconnect policy, and cursor advancement explicitly — reconnect is not free outside a browser.
- **FR-021**: The system MUST function without end-to-end connection multiplexing, using separate connections. Absence of multiplexing is a cost, never a protocol failure.
- **FR-022**: The plane MUST send transport keepalive frames to keep an idle command stream alive through intermediaries. Keepalive MUST NOT be used to infer process health.
- **FR-023**: The sidecar MUST report session liveness to the plane, proving the sidecar and host are alive and reachable. This MUST be distinct from transport keepalive.
- **FR-024**: Run liveness MUST NOT depend on either heartbeat; local socket closure answers it.

### Functional Requirements — Liveness and state

- **FR-025**: Local socket closure MUST be the run-liveness primitive — no heartbeat, no TTL, no timeout.
- **FR-026**: A closed socket with no preceding end-of-invocation event MUST be recorded as abnormally disconnected with termination reason unknown — never as conclusive death.
- **FR-027**: The sidecar MUST open a bounded reconciliation window in which runs may reconnect and re-announce; a run that does not reconnect MUST be presumed gone when the window closes.
- **FR-028**: A sidecar restart, which closes every socket at once while no run has died, MUST NOT be interpreted as its runs having died.
- **FR-029**: Connection status (is the session attached), liveness status (is the sidecar answering), and execution status (starting, running, paused, cancelling, cancelled, completed, failed) MUST be separate axes. No single enum may carry more than one meaning.
- **FR-030**: The plane MUST expose the three axes separately and MUST NOT collapse them into a single authoritative status. Deriving one summary status *for display* from those axes is a client concern and belongs to `design:feature/fleet-dashboard`; the invariant this feature owns is that the axes remain independently readable, so no consumer is forced to infer one meaning from an enum carrying three.

### Functional Requirements — Identity

- **FR-031**: `installationId` MUST identify a stack-control installation, MUST be globally unique, MUST be minted once at sidecar first-start, and MUST NOT be derived from a path.
- **FR-032**: `installationId` MUST be persisted machine-locally, outside version-controlled or copyable installation content, MUST never be committed, and MUST never be intentionally copied.
- **FR-033**: An installation directory arriving on another host by clone or copy MUST re-mint its identity. Identity MUST NOT travel with the tree.
- **FR-034**: `invocationId` MUST identify one stackctl process invocation and MUST be generated fresh at process start.
- **FR-035**: `runId` MUST identify one execution run within an invocation.
- **FR-036**: Hostname, platform, runtime versions, `repositoryRemote`, and `workspacePath` MUST be metadata attached to the installation, never identity. Grouping metadata MUST NOT be treated as authoritative identity.

### Functional Requirements — Sequencing and ingestion

- **FR-037**: The sidecar MUST be the sequencing point for all of an installation's telemetry.
- **FR-038**: Every event MUST carry a globally unique `eventId`.
- **FR-039**: Every event MUST carry `installationSequence` — the sidecar's outbound emission order — used for transport diagnostics, gap detection, and spool restoration. It MUST be **durable, monotonic, and never reset across sidecar restart**: the sidecar persists a high-water mark with its machine-local state and resumes from it. A high-water mark that cannot be restored MUST fail loud; a silent reset to zero is prohibited. *(Added at plan time per research.md R-02, which found this unaddressed: the record decided the sidecar is the sequencer and that runs survive its restart, but never said what happens to the counter. A restarted sidecar resuming from zero would make every subsequent event look like a regression under FR-042, causing the plane to reject its own fleet's ongoing telemetry.)*
- **FR-040**: Every event MUST carry `invocationSequence` — per-invocation order — which is the sequence with domain meaning.
- **FR-041**: `installationSequence` MUST NOT be used for domain or causal ordering, because it interleaves concurrent invocations and would imply relationships between concurrent runs that do not exist.
- **FR-042**: The plane MUST deduplicate by `eventId`, MUST NOT regress live registry state from an older sequence, MUST store late events durably rather than discarding them, and MUST surface sequence gaps diagnostically. **Gap classification MUST operate on the sidecar's durable high-water mark (FR-039) plus event age, and MUST NOT infer absence from the durable object store** — because event classification (FR-015) makes the stored object set sparse by design, so absence-of-object is not absence-of-event. A sequence below the high-water mark and older than the settle bound is *lost*; below the mark and younger is *in-flight/retrying*; above the mark is *never sent*. *(Amended at plan time per research.md R-04.)*
- **FR-042a**: The plane's `eventId` deduplication MUST be understood and documented as an **optimization, not a correctness mechanism** — FR-042's no-regress rule plus deterministic object naming (FR-063) and byte-identity (FR-049) make ingestion correct with the dedupe set entirely absent. *(Recorded at plan time per research.md so the dedupe window's retention is not mistaken for a correctness parameter.)*
- **FR-043**: Delivery semantics MUST be documented and tested as at-least-once transmission, idempotent ingestion, and effectively-once registry application — never as exactly-once. Durable storage MAY transiently contain duplicate attempts unless object naming makes duplication impossible.

### Functional Requirements — Telemetry shape

- **FR-044**: Telemetry MUST separate an event envelope (identity, `eventId`, `sequence`, schema version, timestamps, event type), a bounded snapshot of current state from which the registry updates, and append-only domain events from which history is reconstructed.
- **FR-045**: Histories MUST NOT be resent. Per-event `execution.history[]` and `governance.history[]` are quadratic in run length and are prohibited.
- **FR-046**: Errors MUST be a structured record (code, message, task, timestamp, recoverable), MUST NOT be an unbounded generic field, and details MUST be fetched on demand rather than carried in the fleet payload.

### Functional Requirements — Redaction

- **FR-047**: The sidecar MUST be the redaction boundary — the last hop under the operator's control before telemetry leaves the host.
- **FR-048**: The sidecar pipeline order MUST be: receive local raw event → validate local protocol → normalize and redact → assign durable `eventId` and sequence → write spool record → transmit. Redaction MUST precede spooling so raw paths, usernames, and error content never persist on local disk.
- **FR-049**: A spooled object MUST be byte-for-byte identical to the object eventually transmitted and stored, so a spooled record can be replayed after restart. Nothing is redacted in flight.

### Functional Requirements — Command lifecycle

- **FR-050**: Every command MUST carry a plane-generated `commandId` and an explicit state machine covering at minimum accepted → delivered → received → applied, with rejected, failed, and expired as terminal branches.
- **FR-051**: Command acknowledgement MUST travel back as telemetry.
- **FR-052**: The operator MUST always be able to tell what happened to a command they issued. "Sent" MUST NEVER be presented as "applied".
- **FR-053**: The plane MUST hold a command until delivered-and-acknowledged, expired, or superseded, and MUST replay unexpired commands on reconnect, so a `cancel` survives a network blip.
- **FR-054**: Commands MUST be idempotent, because delivery is at-least-once.
- **FR-055**: Expiry MUST be a visible terminal state that announces itself rather than vanishing.
- **FR-056**: The plane MUST durably record a command before returning `accepted`, and the durable record MUST be authoritative across plane restart.
- **FR-057**: Supersession rules MUST be command-specific, never generic: `resume` supersedes a pending un-applied `pause`; a newer `config-push` supersedes an older un-applied revision; two `cancel`s deduplicate rather than queueing. "Superseded" is a valid terminal state.
- **FR-058**: Stream replay position (`Last-Event-ID`) MUST be tracked separately from command status, with separate advancement rules. A delivered-but-unapplied command MUST NOT look complete.
- **FR-059**: `pause` MUST be cooperative, with its requested-versus-applied distinction visible.
- **FR-060**: `config-push` MUST carry config schema version, validation, an allowed-key set, defined apply-timing, defined persistence after invocation end, and revision/compare-and-set semantics preventing lost updates.
- **FR-061**: `reconcile` MUST have its own received/started/completed/failed lifecycle with results linked by `commandId`; a single acknowledgement MUST NOT represent it.
- **FR-062**: Fleet-wide actions MUST be fan-out, not atomic, and their response MUST say so — reporting targets, accepted, and unavailable — with per-instance command state individually observable. (Destructive-action confirmation UX belongs to `design:feature/fleet-dashboard`; the plane's contract is that fan-out is never reported as atomic.)

### Functional Requirements — Durable store and read path

- **FR-063**: Telemetry MUST be stored as immutable per-event objects, laid out as `{bucket}/runs/{installationId}/{runId}/events/{invocationSequence}.json` — the sequence **zero-padded to a fixed width** — plus a finalized `summary.json` written once at run end. `eventId` MUST be carried **inside** the object, never in the key. *(Amended at plan time per research.md R-01, which found two independent defects in the original `{invocationSequence}-{eventId}.json` key: `eventId` in the filename forecloses sequence probing — the plane cannot construct the URL without already knowing the id it is discovering — and an unpadded sequence does not sort, `10-` preceding `2-`. Sequence is already unique within a run, so the key stays collision-free.)*
- **FR-064**: The sequence in the object path MUST be `invocationSequence`, named explicitly, and MUST be zero-padded to a fixed width so lexicographic order matches numeric order.
- **FR-065**: Append-in-place storage layouts MUST NOT be used; object storage does not append, and a mutable object defeats edge caching.
- **FR-066**: Published event objects MUST NEVER be mutated. A late event MUST land as a new object and trigger a new derived-artifact revision or an explicit correction path.
- **FR-067**: Reads of the capped durable store MUST be fronted by a content-delivery layer that absorbs repeat reads so read caps are never binding.
- **FR-068**: The plane MUST be the only reader of the delivery layer. No other client — the dogfooding developer today, a browser later — may contact it.
- **FR-069**: The plane's history queries MUST be canned and low-cardinality so the edge cache actually hits. Arbitrary caller-driven ranges, filters, and pagination that generate near-unique cache keys are prohibited. This constraint binds the plane's own API surface: it MUST NOT expose a query shape that would force a near-unique cache key per request.
- **FR-070**: No client-held credential for the delivery layer may exist, because there is no client-to-delivery-layer path. (This is what makes the later browser consumer safe by construction: any secret reachable by browser JavaScript is exfiltratable, so the absence of the path — not a short-lived-grant mechanism — is the guarantee.)
- **FR-071**: The plane MUST derive client-visible artifacts and cache them to avoid re-reading per request. A cold cache MUST re-read through the delivery layer, which is cached, and MUST NOT touch the capped store.
- **FR-072**: Live runs MUST be served from the plane's in-memory registry. Cloud reads MUST be confined to finalized run artifacts.
- **FR-073**: The sidecar MUST spool locally and retry with bounded backoff. Silent write loss is prohibited.
- **FR-074**: Uplink health (sidecar → plane) and archive health (plane → durable store) MUST be surfaced independently as healthy / degraded / disabled, each with pending counts, last success, last failure, and last error. "Degraded" MUST always answer which hop.

### Functional Requirements — Security and tenancy

- **FR-075**: Transport encryption and authentication MUST be mandatory, because the plane is network-exposed by construction.
- **FR-076**: Authentication MUST prove a sidecar belongs to the operator and MUST keep strangers out. The credential MUST be a long-lived bearer token minted **per installation** — not one secret shared fleet-wide — so that a single host's credential can be revoked without disrupting the rest of the fleet.
- **FR-077**: Credentials MUST be held by the sidecar and MUST NEVER be held by individual CLI invocations. The token MUST be persisted **machine-locally**, alongside `installationId`, and inherits that identifier's custody rules exactly (FR-032/FR-033): outside version-controlled or copyable installation content, never committed, never intentionally copied. An installation tree arriving on another host by clone or copy MUST NOT carry a usable credential with it.
- **FR-088**: A new host MUST be able to obtain a credential and join the fleet, and the operator MUST be able to revoke a single installation's token without re-crediting the others. A revoked or unknown token MUST be refused (FR-076) and MUST NOT degrade into anonymous or partial access.
- **FR-078**: Tenancy MUST be single-operator — one operator across many hosts — with no cross-tenant isolation, no per-instance permissions, and no per-operator scoping of history reads. Nothing in the design may foreclose a later multi-operator model.

### Functional Requirements — Authority boundary

- **FR-079**: The plane MUST aggregate state and issue commands, and MUST NOT become the execution engine, the scheduler, or the authority over task execution, pause points, cancellation semantics, or config application. stackctl MUST remain authoritative for all of those.

### Functional Requirements — The plane's client API

> This is the top edge of the plumbing, and the surface the dogfood loop drives. It specifies **what the plane exposes**, never how a client renders it. The browser dashboard that will later consume this surface is `design:feature/fleet-dashboard`, out of scope here (see *Scope boundary*).

- **FR-080**: A client MUST be able to source everything from the plane — live state and history alike. The plane MUST be the single endpoint a client needs to trust.
- **FR-081**: The plane MUST expose initial state as a snapshot, then live updates as deltas (instance upserted/removed, command updated, store health). A full registry push per telemetry event is prohibited.
- **FR-082**: The plane MUST expose one fleet entry per commandable run, each carrying instance, compass, status, progress, model, git, and reconciliation state, plus the actions available on it.
- **FR-083**: The plane MUST expose per-run detail covering overview, artifacts, execution, governance, timings, and reconciliation.
- **FR-084**: Historical views MUST be served from artifacts the plane derived and cached.
- **FR-085**: Design, spec, execution, and governance phase durations MUST be retrievable as historical record.
- **FR-086**: Roadmap and backlog reconciliation state MUST be exposed per instance.
- **FR-087**: The plane's API MUST be exercisable end-to-end without a browser — running the sidecar and the plane and issuing the same requests a dashboard would make MUST be sufficient to observe every state and drive every command this spec defines. This is the feature's own verification path (see *Assumptions* — dogfooding), and it is a requirement rather than a testing note: a state reachable only through a UI that does not exist yet is a state this feature cannot prove it delivers.

### Key Entities

- **Installation**: A stack-control installation. Identified by a minted, globally-unique, machine-local `installationId`. Carries metadata: hostname, platform, runtime versions, `repositoryRemote`, `workspacePath`.
- **Sidecar**: The per-installation long-lived process. Owns the authenticated session, the command stream, the local socket, the spool and retry, credential custody, clock-skew estimation, redaction, event classification, and sequence assignment. The CLI owns none of it.
- **Invocation**: One stackctl process invocation, identified by `invocationId`, generated at process start.
- **Run**: One execution run within an invocation, identified by `runId`. Commandable runs are the fleet's rows.
- **Event**: An envelope (identity, `eventId`, both sequences, schema version, timestamps, type) plus a bounded snapshot and append-only domain events. Classified live-only, aggregated, or durable.
- **Command**: A tracked object with a plane-generated `commandId` and an explicit lifecycle. Durably recorded before `accepted`. Idempotent. Command-specific supersession.
- **Fleet Instance**: The client-visible projection of a commandable run, carrying separate connection, liveness, and execution status axes plus a derived summary status.
- **Derived Artifact**: A plane-computed, cached, revisioned view over finalized run data.
- **Store Health**: Two independent hop-specific health records — uplink and archive.
- **Session**: A sidecar's authenticated connection to the plane, with its own liveness and replay cursor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the plane unreachable, hanging, or absent, stackctl invocation wall-clock time is statistically indistinguishable from the same invocation with telemetry disabled entirely, and exit codes and output are unchanged in 100% of cases.
- **SC-002**: No stackctl invocation ever fails, blocks, or emits an error because of control-plane, sidecar, or network state — measured across the full state matrix, 0 failures.
- **SC-003**: With runs active across multiple hosts, a single request to the plane returns every commandable run in the fleet — 100% appear, each exactly once, with no per-host request required.
- **SC-004**: Process death is reflected as abnormal disconnection within milliseconds of the process exiting, with no polling interval or TTL contributing latency.
- **SC-005**: A sidecar restart with N healthy runs produces 0 false death conclusions.
- **SC-006**: Every command an operator issues resolves to an observable terminal state, and no command is ever reported in a state stronger than what actually occurred — 0 overclaims.
- **SC-007**: A `cancel` issued during a network interruption is applied on reconnect rather than dropped, in 100% of interruptions shorter than the command's expiry.
- **SC-008**: Repeated and varied historical reads do not increase read transactions against the capped durable store — read transactions stay flat as client traffic scales.
- **SC-009**: Live-run views never generate a read against the durable store — 0 reads.
- **SC-010**: 0 published event objects are mutated after write, across the full lifecycle including late-event arrival.
- **SC-011**: 0 credentials are present in any CLI process's environment or memory.
- **SC-012**: Connections succeed from hosts behind NAT with no inbound reachability, and are refused for unauthenticated or unencrypted clients — 100% in both directions.
- **SC-013**: 0 raw unredacted values reach the local spool on disk.
- **SC-014**: An installation tree copied to another host reports as a distinct installation — 0 identity collisions, including for identical checkout paths on different machines.
- **SC-015**: Duplicate and reordered event delivery produces no incorrect registry state — a client following the fleet never walks backward from a later state to an earlier one.
- **SC-016**: An operator can determine which hop is degraded from the exposed health state alone, with no ambiguity between uplink and archive failure.
- **SC-017**: Phase durations for design, spec, execution, and governance are retrievable per run as historical record.
- **SC-018**: Every state and command this spec defines is reachable by running the sidecar and the plane and issuing the same requests a dashboard would make — 0 states require a browser to observe, and 0 require a UI that does not exist yet.

## Plan-Time Contracts

These are **not** scope cuts and **not** open scope questions. Each is a decision the design record deliberately deferred to plan time because prose cannot carry a write protocol, and each MUST be settled during `/speckit-plan` and pinned by RED tests before implementation. Attempting to fix them in prose here would be the false precision this project has a written rule against (`.claude/rules/spec-audit-diminishing-returns.md`). They are carried forward in full; none may be dropped.

- **PT-001 — Local socket transport, discovery, and machine-local state lookup.** Unix domain socket (filesystem permissions give local authorization free) versus localhost TCP (needs token and port allocation); Windows named pipes. Discovery MUST define the machine-local mapping from an installation root to its persisted `installationId`, its **plane bearer token** (FR-076/FR-077), and its sidecar endpoint — because identity and credential both live outside the installation tree, finding the socket and resolving them are the same lookup and MUST be solved together. The credential's at-rest protection on that store is part of this contract.
- **PT-002 — Sidecar spawn race and stale locks.** The lock mechanism and its behavior against a stale lock left by a crashed sidecar.
- **PT-003 — Sidecar idle lifetime versus spool durability.** *(Settled at plan time — research.md PT-003/R-03.)* The spool is a **crash-safe write-ahead log**: records are durable before acknowledgement and replay on restart, so exiting with an un-flushed spool is **non-catastrophic rather than impossible** (the original "must not exit holding an un-flushed spool" was unachievable — `SIGKILL` runs no code). Graceful shutdown is therefore a **latency optimization, not a correctness guarantee**, and idle-exit (~10 min) is safe by construction. The idle-exit constant is pinned in PT-014.
- **PT-004 — Delivery-layer read mechanism.** An edge worker doing listing and range logic, versus a pull-through cache with immutable period manifests making listing unnecessary. Listing is an uncacheable transaction against the capped store, which is the constraint any mechanism must answer. To be settled against real numbers.
- **PT-005 — Derived-artifact staleness, revision, and backfill.** What invalidates an artifact, how a late event triggers a new revision, how a revision is addressed so a stale one is not served, and how a bad artifact is rebuilt. This is the mechanism behind the bounded-immutability invariant (FR-066) and MUST NOT weaken it.
- **PT-006 — `runId` uniqueness scope and invocation linkage in the storage path.** The layout keys on `{installationId}/{runId}` and omits `invocationId`, while the identity model places a run within an invocation. Either `runId` is globally unique and invocation linkage lives in event data, or the path must carry `invocationId`. Related: whether one invocation may contain multiple runs, which also decides whether a run-scoped sequence is cleaner than `invocationSequence` in the object name.
- **PT-007 — Plane restart beyond commands.** Command acceptance survives by decision (FR-056); the in-memory registry still vanishes. What happens to live sessions and their streams on restart, and how relays re-announce.
- **PT-008 — Telemetry redaction and retention policy.** The redaction boundary is decided (FR-047/048); the policy is not — field length caps, a path policy, and a retention policy.
- **PT-009 — Artifact reference semantics.** Whether artifacts are filesystem paths, repo-relative paths, URLs, or opaque identifiers. Browsers largely will not open `file://` from an HTTP page, and a remote dashboard refers to a filesystem the browser cannot reach — so "quick-access links" likely means copy-path or something richer.
- **PT-010 — Reconciliation window length.** How long the sidecar waits for an abnormally-disconnected run to reconnect before presuming it gone, and what the fleet view shows during the window.
- **PT-011 — `cancel` semantics.** Whether cancel interrupts the current task or waits for a task boundary; whether child processes are terminated and with what signal; what cleanup is guaranteed; whether the invocation ends or only the run; whether cancellation can time out. A future forceful `terminate` is named to keep cooperative `cancel` unambiguous, even if only `cancel` ships.
- **PT-012 — Completed-instance retention in the live registry.** How long completed/failed/cancelled runs remain in "Recent", and whether "recent" is scoped to invocation or installation. Independent of durable retention.
- **PT-013 — Clock semantics.** Wall-clock timestamps, monotonic process durations, and plane-side receive time coexist across many hosts. Which is authoritative for which purpose; cross-host ordering MUST NOT rely on wall-clock alone. The sidecar estimates skew once per session.
- **PT-014 — Constants and protocol contracts.** Command envelope schema, command transition table, expiry constants, heartbeat intervals and thresholds, backoff and retry policy, socket protocol framing, route namespacing and versioning, maximum event size, spool cap with drop policy, the long-running run's in-memory buffer bound (FR-007), and the bearer token's lifetime and rotation policy — "long-lived" (FR-076) fixes the shape, not the number. All pinned by RED tests.
- **PT-015 — Credential provisioning transport.** FR-088 fixes the *guarantees* — a new host can join, a single installation's token is revocable without re-crediting the fleet, and a revoked token is refused rather than downgraded. How the token physically reaches a new host (manual placement, an operator-run verb, a join exchange) is a plan-time choice against the real enrollment experience; the operator-facing story is a single-operator one and MUST NOT be over-built.

## Assumptions

- **The feature is dogfooded as it is built, and that is how "the plumbing is right" gets established.** The sidecar and the plane are run, and the same API requests a dashboard would make are driven against them, to find out whether it works or how it is broken, in a tight feedback loop (operator decision 2026-07-16). Two consequences the plan inherits: (a) the plane's API is **not** a speculative abstraction — it has a real consumer from day one, which is what Constitution Principle II requires before the dashboard becomes its second consumer; and (b) a green test suite is a **prerequisite, not proof** — per `.claude/rules/agent-discipline.md`, tests written against our own assumptions cannot establish that a distributed system behaves, and this project's discipline is explicit that verification means driving the real surface. The dogfood loop is the primary evidence; the suite is the floor beneath it.
- **Deployment location is not a design input.** The plane is an HTTP service at `STACKCTL_CP_URL` with reasonable connectivity. Where it runs — VPS, managed host, edge — is an operational choice that changes no requirement here and is deliberately unspecified.
- **Read economics, not global distribution, are why a content-delivery layer is in this design.** It is a read-amplification shield in front of an expensive origin, not user-facing edge delivery.
- **The durable store's read transactions and egress are aggressively capped**; the delivery layer's egress from it is free under an existing bandwidth agreement.
- **Telemetry objects are immutable once written**, which is what makes edge caching work at all — the storage layout and the delivery layer are not independent decisions.
- **Multi-operator tenancy is deferred by explicit decision, not oversight.** stack-control is heading toward being a product; if the plane ever serves multiple operators it needs authorization, per-operator history scoping, and redaction becomes urgent rather than hygienic. Nothing here forecloses it.
- **Sidecar scope is per-installation, with the door open to per-host.** Cost is N long-lived sessions from a host with N worktrees. Revisit when a host's concurrent installation count makes N sessions costly in practice; the local socket contract is identical under either scope, so the swap stays contained.
- **A bidirectional connection protocol becomes correct if sidecar-initiated request/response is ever needed.** The sidecar makes that promotion cheap and contained.
- **Rollup machinery is not built until volume justifies it**, but the classification seam (FR-015/016) exists from the start so adding it changes no contract.
- **A dead-letter processing UI is deferred; silent failure is not.** Failure is observable at both hops (FR-074).
- **The `compass` column, governance results, and reconciliation state** refer to existing stack-control concepts and are surfaced, not redefined, by this feature.
