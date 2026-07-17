# Implementation Plan: Fleet Control Plane

**Branch**: `feature/fleet-control-plane` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/036-fleet-control-plane/spec.md`; approved design record `docs/superpowers/specs/2026-07-16-fleet-control-plane-design.md`; Phase 0 findings in [research.md](./research.md)

## Summary

A network-reachable **control plane** that stack-control installations report into from any host, plus the plane's client API. Each installation runs a long-lived local **sidecar** holding one authenticated session to the plane (SSE down for commands, HTTP POST up for telemetry, all sidecar-outbound because hosts sit behind NAT). Local `stackctl` invocations emit to the sidecar over a local socket and **never touch the WAN** — the constraint that dominates every other decision here. Telemetry lands as immutable per-event objects in a capped durable store fronted by a CDN, of which the plane is the only reader.

The browser dashboard is **out of scope** by operator decision (roadmap item `design:feature/fleet-dashboard`). The plane's client API is **in** scope and is exercised by **dogfooding** — running the sidecar and plane and issuing the same requests a dashboard would make (FR-087, SC-018).

**Technical approach:** three new domains (`sidecar`, `plane`, `telemetry`) over a shared `fleet` domain of types, plus a `machine-state` module owning the deliberately-outside-the-installation store. Everything network- or clock-facing is reached through an injected interface so the contracts are pinned by RED tests against real in-process servers rather than mocks.

## Technical Context

**Language/Version**: TypeScript 5.6, strict. ESM (`"type": "module"`). **Node ≥20 declared; 22.19.0 actual.** The declared floor is binding — see research.md's UUIDv7 trap, where the stdlib API exists only in Node 26.

**Primary Dependencies**: existing — `commander` (CLI), `yaml`, `ajv` (+`ajv-formats`) for schema validation. **New** — `eventsource-parser` (SSE framing only, dependency-free), `uuidv7` (zero-dep; the stdlib API is Node 26+). No HTTP framework: the plane is `node:http` + a small router, consistent with a repo that currently has **zero** network dependencies.

**Storage**: capped object store (B2) fronted by a CDN (Cloudflare pull-through cache) for durable telemetry; a crash-safe on-disk WAL spool in the sidecar; a machine-local state store for identity, token, and the sequence high-water mark; the plane's own index for live registry + derived-artifact revisions.

**Testing**: vitest. Real in-process `node:http` servers on ephemeral ports; real sockets, processes, and files. Injected `Clock` / `SseTransport` / `ProcessProbe` interfaces. **Not** vitest fake timers (verified open bug: they do not fake `performance.now()`, the clock PT-013 depends on).

**Target Platform**: macOS, Linux, Windows for the CLI + sidecar (UDS on POSIX, named pipes on Windows, through Node's single `net` path API). The plane is a long-running Node service; **deployment location is deliberately not a design input** — it is an HTTP service at `STACKCTL_CP_URL`.

**Project Type**: CLI plugin (in-tree TypeScript run via `tsx`) **gaining a daemon and a network service**. See Structure Decision.

**Performance Goals**: the only hard one is SC-001 — CLI invocation wall-clock with the plane unreachable/hanging/absent must be statistically indistinguishable from telemetry disabled. Everything else is bounded by "must not degrade the tool."

**Constraints**: no network operation in the interactive CLI path (so there is no timeout to bound); sidecar-outbound connections only; published event objects never mutated; reads must not amplify against the capped store; source files 300–500 lines.

**Scale/Scope**: single-operator tenancy (FR-078) bounds the fleet to ~tens of hosts and ~tens of concurrent commandable runs. This is why the plane's in-memory live registry is uncontroversial and why enrollment stays manual (PT-015). **Deliberately not clarified further** — at this scale the answer changes no decision.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Test-First (NON-NEGOTIABLE)** | PASS | Every PT contract and every R-finding is pinned by a RED test before implementation. Research names the highest-value test (keepalive re-arms the read-idle watchdog) and the one that must precede a topology decision (undici head-of-line inference). Exploration spikes permitted but thrown away, never kept. |
| **II. Integration-First, No Speculative Building** | PASS (with reasoning) | The plane's client API would be a speculative abstraction built for an imagined consumer — **except** the dogfood loop makes the developer its first real consumer from day one (FR-087/SC-018), so the dashboard becomes its *second*. That is the order this principle requires. Capture-then-scope was honored: capture first, operator's scoping pass second. |
| **III. Branch on Capabilities, Never Provider Identity** | PASS | No provider branching is introduced. Vendor identities (B2/Cloudflare) are confined to the storage adapter behind an interface; nothing in the plane or sidecar branches on them. |
| **IV. Division of Labor** | PASS | FR-079 is this principle verbatim: the plane aggregates and issues commands; it never becomes the execution engine, scheduler, or authority over pause points / cancellation / config application. PT-011 keeps `cancel` semantics owned by stackctl. |
| **V. No Fallbacks, No Mock Data Outside Tests** | **VIOLATION — declared, justified below** | The CLI's fail-open behavior is a deliberate silent degradation. See Complexity Tracking. |
| **VI. Strict Typing & Composition** | PASS | No `any` / `as` / `@ts-ignore`. DI with interface types is load-bearing here (`Clock`, `SseTransport`, `ProcessProbe`, storage port) — it is what makes the contracts testable. 300–500 line cap drives the module decomposition below. |
| **VII. Commit & Push Early and Often** | PASS | Process; one logical change per commit, no AI attribution. |
| **VIII. Faithful Tool Adoption** | PASS | Full chain in order: specify → clarify → plan → checklist → tasks → analyze → implement, governance per phase. |
| **IX. Execution-Backend Pluggability** | N/A | This feature introduces no execution backend. Runs remain stackctl's. |
| **Installation-anchor invariant** (Additional Constraints) | **VIOLATION — declared, justified below** | Machine-local state is deliberately persisted outside the installation tree. See Complexity Tracking. |
| **Isolation invariant** (`dw-lifecycle` undisturbed) | PASS | No `dw-lifecycle` surface touched. |
| **Enforcement lives in skills + CLI verbs, never git hooks** | PASS — with a required task | New verbs must ship skills + surface registration or `check-front-door` goes RED. See Front-door obligation. |

### Front-door obligation (a self-blocking trap to avoid)

`check-front-door` enforces four invariants over every registered operation — skill exists, working `--help`, mutating ops mediated, and **skill↔verb parity in both directions**. It is currently clean (65 operations) and it is a **hard gate inside `/stack-control:define`**. Adding `sidecar` / `plane` verbs without registering their surfaces and authoring their skills takes it RED — which would refuse *the next feature's* define. Surface registration and skill authoring are therefore **in-scope tasks of this feature**, not follow-ups.

## Project Structure

### Documentation (this feature)

```text
specs/036-fleet-control-plane/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — PT-001..PT-015 settled
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output — the dogfood loop
├── contracts/           # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (installation root: `plugins/stack-control/`)

```text
src/
├── fleet/                    # Shared domain — types + pure logic, no I/O
│   ├── types.ts              # Identity, envelope, snapshot, fleet instance
│   ├── event.ts              # Envelope construction + validation
│   ├── command.ts            # Command state machine (accepted→delivered→received→applied; rejected/failed/expired/superseded)
│   ├── supersession.ts       # Per-command rules (never generic — FR-057)
│   ├── sequence.ts           # Two sequences; high-water mark; gap classification
│   ├── status.ts             # The three axes, never collapsed (FR-029/030)
│   └── redact.ts             # Deny-by-default field policy (PT-008)
├── machine-state/            # The deliberate outside-the-installation store (PT-001)
│   ├── locate.ts             # Durable vs ephemeral dirs; sha256(realpath)[0:16] keying
│   ├── identity.ts           # Mint / read installationId; re-mint on clone
│   ├── token.ts              # 0600 bearer token; never crosses the socket
│   └── highwater.ts          # installationSequence durability (R-02)
├── telemetry/                # CLI-side emit client — the fail-open path
│   ├── emit.ts               # Local socket write; fails instantly, never blocks
│   ├── protocol.ts           # Local wire protocol + version handshake (FR-010)
│   └── buffer.ts             # Bounded in-memory buffer for long runs only (FR-007)
├── sidecar/
│   ├── server.ts             # Local socket/pipe listener; bind-wins election (PT-002)
│   ├── spawn.ts              # detached + stdio:ignore + windowsHide + unref
│   ├── lifecycle.ts          # Idle-exit; clean shutdown; reconciliation window
│   ├── pipeline.ts           # receive→validate→normalize+redact→assign→spool→transmit (FR-048)
│   ├── spool/
│   │   ├── wal.ts            # Crash-safe write-ahead spool (R-03)
│   │   └── drain.ts          # Replay; bounded backoff; drop policy
│   ├── uplink/
│   │   ├── sse-client.ts     # Connection loop over injected SseTransport
│   │   ├── reconnect.ts      # Full jitter; Last-Event-ID cursor; terminal-fail states
│   │   └── post.ts           # Telemetry POST dispatcher (separate connection)
│   └── liveness.ts           # Socket closure ⇒ abnormally-disconnected, never "dead"
├── plane/
│   ├── http/                 # node:http + router; no framework
│   │   ├── server.ts
│   │   ├── auth.ts           # Bearer token; refuse unknown/revoked (FR-088)
│   │   ├── ingest.ts         # POST telemetry; dedupe; no-regress
│   │   ├── stream.ts         # SSE out; keepalive comments; replay
│   │   └── api.ts            # Client API — snapshot, deltas, commands, history
│   ├── registry.ts           # Live state; derived, not authoritative (PT-007)
│   ├── commands/
│   │   ├── store.ts          # Durable BEFORE accepted (FR-056)
│   │   └── dispatch.ts       # Buffer, replay, expiry, fan-out
│   ├── archive/
│   │   ├── writer.ts         # Immutable per-event objects; manifests
│   │   ├── derived.ts        # Revision-in-key artifacts; never purge (PT-005)
│   │   └── reconcile.ts      # Listing as backstop only (R-04)
│   └── health.ts             # Uplink vs archive, always naming the hop (FR-074)
├── storage/
│   ├── port.ts               # Object-store interface (vendor-free)
│   ├── b2.ts                 # B2 adapter
│   └── cdn-reader.ts         # Canned low-cardinality reads; 404 bypass (PT-004/005)
├── subcommands/
│   ├── sidecar.ts            # stackctl sidecar <subaction>
│   └── plane.ts              # stackctl plane <subaction>
└── cli-help/surfaces/
    └── fleet.ts              # Surface registration — check-front-door parity

skills/
├── sidecar/SKILL.md          # Front-door skill (parity requirement)
└── plane/SKILL.md            # Front-door skill (parity requirement)

tests/fleet/                  # Mirrors src; real servers/sockets/files
```

**Structure Decision**: the existing repo convention is `src/<domain>/` with pure logic separated from I/O, `subcommands/<verb>.ts` for CLI entry, and `tests/<domain>/` mirrors. This feature follows it, adding six domains rather than one because the 300–500 line cap (Principle VI) makes a single `fleet/` module untenable — the command state machine, the spool, the SSE client, and the plane's HTTP surface are each independently substantial.

**The plane runs as a CLI verb** (`stackctl plane serve`), not a separate package. This keeps the single-workspace shape, matches "deployment location is not a design input" (deploy = run the verb on a host), and avoids a second build/publish pipeline. The plane's code ships inside the plugin; adopters who never run a plane simply never invoke the verb.

**Vendor identity is confined to `storage/b2.ts` behind `storage/port.ts`** so Principle III is structurally satisfied rather than merely intended.

## Complexity Tracking

> Two constitutional violations. Both are deliberate, spec'd, and load-bearing — declared here rather than finessed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Principle V (No Fallbacks)** — the CLI *silently* continues when the sidecar is unreachable (FR-003/FR-004), rather than raising a descriptive error naming what is absent. | The design's dominant constraint is that **the control plane must never degrade the tool it observes** (spec § "The constraint that dominates every other"). Telemetry is not the verb's functionality — the verb's contract (output, exit code, wall-clock) is unchanged whether or not anyone is observing. Observation is strictly subordinate to the thing observed. Principle V exists to stop *missing functionality* being hidden; here the functionality is intact and only the *observation* is absent. | Failing loud on an unreachable sidecar would make **every** `stackctl` invocation fail whenever the plane or sidecar is down — converting an observability outage into a total tool outage. That is precisely the harm the design forbids, and it would make the feature a net negative regardless of the dashboard's quality. **Bounded:** the silence is confined to the telemetry path. The sidecar itself fails loud (spool depth, uplink health); the plane fails loud (archive health); an unknown/revoked token is refused, never downgraded to partial access (FR-088). Nothing about *stack-control's own work* degrades silently. |
| **Installation-anchor invariant** — `installationId`, the bearer token, and the sequence high-water mark are persisted **outside** the installation tree (machine-local), where the invariant requires state to be anchored inside the nearest-enclosing installation. | `.stack-control/` is **version-controlled**. Persisting identity inside it would ship one identifier to every clone — reintroducing, one layer down, exactly the cross-host collision that minting exists to prevent (FR-031/032/033). The same applies to a bearer token, which additionally must not be committed. Identity must **not** travel with the tree; a copied installation must re-mint. PT-001 fixes the store's location and lookup. | Anchoring inside the installation is unavailable **by construction** — it is the failure mode. A `.gitignore` entry was rejected: it is advisory, defeated by `git add -f`, absent from a fresh clone's expectations, and does not stop a plain `cp -r`. **Bounded, and the boundary is tested:** the machine-local store is the ONLY sanctioned outside-tree write; nothing else escapes the installation. |

### The isolation exception must be tested, not assumed

The constitution names `src/__tests__/installation-isolation-probe.test.ts` as the invariant's permanent enforcement. That probe snapshots only the **fixture's outer repo**, so writes to `$HOME` would **pass silently** — the exception would go unnoticed for the wrong reason, which is worse than failing. Two tasks follow:

1. **Extend the probe** to assert the machine-local store is the *only* outside-tree write these verbs make, and that the installation tree receives nothing.
2. **Redirect the machine-local store to a temp dir in every test.** Non-negotiable: without it, a test run mints identity into a real developer's `$HOME` and a CI run pollutes the agent.

## Phase 0 — Research

Complete. See [research.md](./research.md). All fifteen Plan-Time Contracts settled; four defects in specified mechanism recorded as amendments (R-01…R-04); one operator ground-truth correction pinned against re-derivation.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — entities, fields, state transitions.
- [contracts/](./contracts/) — the local socket protocol, the sidecar↔plane protocol, and the plane's client API.
- [quickstart.md](./quickstart.md) — the dogfood loop: run the sidecar and plane, drive the API as a dashboard would (FR-087/SC-018).

## Phase 2 — Tasks

Not created by `/speckit-plan`. `/speckit-tasks` generates `tasks.md`, with each task carrying a `[tier:]` annotation per the model-tier requirement, and phases governed at each boundary.

**One delivery.** Task ordering within it is expected; separately-shipped increments are not (project no-partial-delivery rule; the design record explicitly rejected the reviews' four-phase proposal as separate features).
