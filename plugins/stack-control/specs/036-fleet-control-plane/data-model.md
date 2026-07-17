# Data Model: Fleet Control Plane

**Feature**: `specs/036-fleet-control-plane` | **Date**: 2026-07-16
**Derived from**: [spec.md](./spec.md) Key Entities + Requirements; decisions in [research.md](./research.md)

Field types are described structurally, not as TypeScript source — implementation lands in `src/fleet/types.ts` under Principle VI (no `any`, no `as`, no `@ts-ignore`).

## Identity

| Entity | Identifier | Generation | Lifetime | Storage |
|---|---|---|---|---|
| **Installation** | `installationId` | **UUIDv4** (`crypto.randomUUID()`) | minted once, machine-local, re-minted on clone/copy | machine-local durable store — **never** the installation tree (FR-032/033) |
| **Invocation** | `invocationId` | **UUIDv7** (`uuidv7` package) | one CLI process | event data |
| **Run** | `runId` | **UUIDv7**, **globally unique** (PT-006) | one execution run within an invocation | object path + event data |
| **Event** | `eventId` | **UUIDv7** | one event, forever | event envelope |
| **Command** | `commandId` | plane-generated, **UUIDv7** | one command, forever | plane's durable command store |

**`installationId` is UUIDv4 deliberately** — it is never sorted, and a time-ordered id would leak installation time for no benefit.

**`eventId` is identity, NEVER an ordering key.** UUIDv7's time-ordering invites illegitimate ordering; ordering is `invocationSequence`'s job (PT-013). This rule is pinned by a test.

**Metadata, never identity** (FR-036): `hostname`, `platform`, runtime versions, `repositoryRemote`, `workspacePath`. `repositoryRemote` + `workspacePath` are *grouping* metadata — a client may group installations by repository, but grouping metadata must never be treated as authoritative identity.

## Machine-local state (the declared installation-anchor exception)

Split by lifetime (PT-001):

| Field | Store | Notes |
|---|---|---|
| `installationId` | **durable** — `XDG_STATE_HOME` / `~/Library/Application Support` / `%LOCALAPPDATA%` | re-mint if absent |
| bearer token | **durable**, file mode `0600` | **never crosses the local socket** — the sidecar reads it itself |
| `installationSequence` high-water mark | **durable** (R-02) | monotonic across restart; **never resets** |
| socket / pipe endpoint | **ephemeral** — `XDG_RUNTIME_DIR` / `$TMPDIR` / named pipe | correctly cleared on reboot |

**Keyed by** `sha256(realpath.native(installationRoot))[0:16]`. Consequence (accepted): `mv` of an installation re-mints; an explicit `reattach` is the escape hatch.

**Authorization is the `0700` parent directory**, not the socket file mode — POSIX makes no guarantee about socket-file permissions and BSD-derived systems (including macOS) may ignore them.

## Event

Three separable parts (FR-044). **Histories are never resent** (FR-045) — `execution.history[]` / `governance.history[]` per event is quadratic in run length and prohibited.

### Envelope

| Field | Type | Notes |
|---|---|---|
| `eventId` | UUIDv7 | globally unique; dedupe key |
| `installationId` | UUIDv4 | |
| `invocationId` | UUIDv7 | |
| `runId` | UUIDv7 \| null | null for non-run invocations |
| `installationSequence` | integer, monotonic | **transport diagnostics only** — gap detection, spool restoration. **Never domain ordering** (FR-041) |
| `invocationSequence` | integer, monotonic | **the sequence with domain meaning** (FR-040) |
| `schemaVersion` | integer | |
| `type` | enum | event type |
| `wallClock` | ISO-8601 | **describes; never orders** (PT-013) |
| `monotonicOffsetMs` | number | computed **at source** — the plane cannot difference `hrtime` even in principle |
| `classification` | `live-only` \| `aggregated` \| `durable` | **classification, not emission, decides cost** (FR-015) |

### Snapshot

Bounded current state from which the registry updates. **Bounded** is a contract, not an aspiration — max event size is pinned (PT-014).

### Domain events

Append-only; history is reconstructed from them, never carried on each event.

### Structured error (FR-046)

`{ code, message, task, timestamp, recoverable }`. **Not** an unbounded generic field; details fetched on demand, never carried in the fleet payload.

## Status — three axes, never collapsed

| Axis | Values |
|---|---|
| `connectionStatus` | is the sidecar's session attached |
| `livenessStatus` | is the sidecar answering |
| `executionStatus` | `starting` \| `running` \| `paused` \| `cancelling` \| `cancelled` \| `completed` \| `failed` |

The plane **exposes all three separately and never collapses them** into a single authoritative status (FR-030). Deriving one summary *for display* is a client concern belonging to `design:feature/fleet-dashboard`.

**`abnormally-disconnected` is a distinct condition, not an execution status** — socket closure proves disconnection, not death (FR-026). Termination reason: unknown. A bounded reconciliation window (PT-010) allows re-announcement; a run that reconnects was never dead.

## Command

### State machine (FR-050)

```
                 ┌──────────────► rejected   (terminal)
                 │
accepted ──► delivered ──► received ──► applied   (terminal)
   │             │             │
   │             │             └──────► failed    (terminal)
   │             │
   │             └────────────────────► expired   (terminal)
   └──────────────────────────────────► superseded (terminal)
```

- **`accepted` is durable before it is returned** (FR-056) — the plane records the command durably *before* answering `accepted`, and the durable record is authoritative across plane restart. Without this, a `cancel` accepted a second before a restart vanishes silently, which is exactly the case the operator promise exists for.
- **Acknowledgement travels back as telemetry** (FR-051).
- **Expiry is a visible terminal state** (FR-055) — it announces itself rather than vanishing.
- **Commands are idempotent** (FR-054) — delivery is at-least-once.
- **Stream replay position is NOT command status** (FR-058). `Last-Event-ID` tracks which frames the stream delivered; it says nothing about receipt or application. Separate state, separate advancement rules.

### Supersession — per-command, never generic (FR-057)

| Command | Rule |
|---|---|
| `pause` | superseded by a later `resume` while un-applied |
| `resume` | supersedes a pending un-applied `pause` |
| `cancel` | two `cancel`s **deduplicate**, never queue |
| `config-push` | a newer revision supersedes an older un-applied one; compare-and-set prevents lost updates (FR-060) |
| `reconcile` | own long-running lifecycle: received → started → completed/failed, results linked by `commandId` (FR-061) |

### `cancel` semantics (PT-011)

Cooperative, **task-boundary scoped**. Sets a flag the run observes at its next task boundary; does not interrupt mid-task. Ends the **run**, not the invocation. Child processes are **not** force-terminated — that is the future `terminate` verb's job, named precisely to keep cooperative `cancel` unambiguous. Does **not** time out: a run that never reaches a boundary stays `cancelling` **visibly**, which is honest rather than silently escalating to a kill.

## Sequences and gap classification

Two sequences, not interchangeable (FR-039/040/041).

**`installationSequence` is durable and never resets across sidecar restart** (R-02) — a reset would make every subsequent event look like a regression under FR-042's no-regress rule, causing the plane to reject its own fleet's telemetry. Unrestorable ⇒ **fail loud** (Principle V), never a silent reset.

**Gap classification** operates on the sidecar's high-water mark plus event age — **never** on object-store contents (R-04), because classification makes the durable object set sparse by design, so absence-of-object is not absence-of-event:

| Condition | Classification |
|---|---|
| below high-water mark, older than settle bound | **lost** |
| below high-water mark, younger than settle bound | **in-flight / retrying** |
| above high-water mark | **never sent** |

Gaps are surfaced **diagnostically**, never as errors (FR-042).

## Storage layout

```
{bucket}/runs/{installationId}/{runId}/events/{invocationSequence padded}.json
{bucket}/runs/{installationId}/{runId}/manifest-{rev}.json
{bucket}/runs/{installationId}/{runId}/derived/summary-{rev}.json
{bucket}/runs/{installationId}/{runId}/summary.json          (finalized once at run end)
```

**Amended from FR-063 per R-01** — two independent defects in the specified key:
1. `eventId` in the filename **forecloses sequence probing** (the plane cannot build the URL without already knowing the id it is discovering).
2. Unpadded sequence **does not sort** — `10-` precedes `2-` lexicographically.

Fix: zero-padded fixed-width sequence alone; `eventId` moves **inside** the object. Sequence is already unique within a run, so the key stays collision-free.

**Invariants:**
- **Published event objects are never mutated** (FR-066). A late event lands as a **new object** and triggers a new derived-artifact **revision** — it never rewrites a stored object.
- **Duplicate PUT is a no-op** — byte-identity (FR-049) makes last-writer-wins harmless, which is what makes the dedupe set an *optimization* rather than a correctness mechanism.
- **`Cache-Control: public, max-age=31536000, immutable`** on every object. **Never purge** — a new revision is a new URL, so staleness is unrepresentable rather than operationally avoided. **Except 404s on the probe path, which bypass cache** (a cached "doesn't exist" would stall the plane when the event lands a second later).

## Derived artifact

Plane-computed, cached, **revisioned** view over finalized run data. Revision lives **in the key**. The plane's own index holds the current revision — it derived the artifact, so it never needs to discover it.

## Store health — two hops, always named (FR-074)

| Hop | Signal |
|---|---|
| **uplink** (sidecar → plane) | spool depth, last success, last failure, last error |
| **archive** (plane → durable store) | pending count, failed count, last success, last failure, last error |

Each `healthy` \| `degraded` \| `disabled`, surfaced **independently**. "Degraded" must always answer **which hop** — one combined indicator would be ambiguous exactly when it matters.

## Fleet instance

The client-visible projection of a **commandable** run (`execute`, `govern` only — FR-013). Carries the three status axes plus instance, compass, progress, model, git, reconciliation, and available actions.

Short verbs emit (FR-012) but are **never** fleet entries — their timing data stays retrievable (FR-014). The fleet means "runs you can act on".

## Delivery semantics — stated plainly (FR-043)

- **transmission:** at-least-once
- **ingestion:** idempotent
- **registry application:** effectively-once

**Never exactly-once.** Durable storage may transiently contain duplicate attempts unless object naming makes duplication impossible — which, here, it does.
