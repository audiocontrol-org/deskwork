# Phase 1 Data Model: Instance Observability

Entities and shapes, grounded in 036's real types (`src/fleet/types.ts`, `src/fleet/event.ts`, `src/plane/registry.ts`). "EXTEND" = an additive change to an existing 036 type; "NEW" = a new type this feature introduces. No `any`/`as`/`@ts-ignore`.

## Instance Identity (NEW)

`host:path` — the machine hostname plus the canonicalized installation-root path. **Derived, never persisted as a value, never in git.**

```
InstanceId   = string            // the composite key, e.g. "orion-mbp:/Users/.../plugins/stack-control"
deriveInstanceId(installationRoot):
  host = hostname()
  path = realpathSync.native(installationRoot)
  id   = `${host}:${path}`
```

- **Validation / properties (FR-001–004):** git-safe (never written to a tracked file); stable across restarts (same inputs → same id); collision-free across machines (host disambiguates same path); human-legible. Derivation MAY later change (configured stable host-id) without changing these properties.
- Lives in a new `src/machine-state/instance-id.ts`. `installationId` (UUIDv4) is retained internally and unchanged (D8); `host:path` is added alongside, not a replacement.

## EventEnvelope (EXTEND — `fleet/types.ts:73`, `event.ts:59-68`)

Add three fields (validated in `validateEnvelope`):

| Field | Type | Source |
|---|---|---|
| `host` | `string` | **derived inside `constructEnvelope`** from `installationRoot` (via `deriveInstanceId`) — never caller-supplied, so every event carries it by construction (FR-011, analyze M2) |
| `path` | `string` | same — derived internally (canonicalized) |
| `sessionId` | `string \| null` | on `EnvelopeInput` (caller-supplied); the emit site reads it from the `current-session` record; `null` when no session is open (same shape as `runId`) |

`schemaVersion` increments; older events read `sessionId: null` and derive `host`/`path` absent → not attributable to an instance (pre-feature events are simply not projected). Existing fields (`installationId`, `invocationId`, `runId`, sequences, `type`, `classification`, `eventId`, `wallClock`, `monotonicOffsetMs`) unchanged.

## ClassifiedEvent (EXTEND — `registry.ts:77-81`, `ingest.ts:250-257`)

Add the bounded `snapshot` so event-specific payload survives the ingest→registry→log boundary (D5, minimal TASK-457 fix):

| Field | Type | Meaning |
|---|---|---|
| `envelope` | `EventEnvelope` | unchanged |
| `classification` | `EventClassification` | unchanged |
| `type` | `EventType` | unchanged |
| `snapshot` | `SnapshotPayload` | NEW — the already-validated, `≤ 32 KiB` payload (`event.ts:108`); `toClassifiedEvent` now copies it |

## Event types (EXTEND catalog — `classification.ts:104-116`, `types.ts` union)

Three new `durable` types (D2). Each envelope carries identity (`host`,`path`,`sessionId`); event-specific data rides the `snapshot`:

| Type | Class | Snapshot payload | Emitted by |
|---|---|---|---|
| `session.started` | durable | `{ sessionId, startedAt }` | `session-start` verb (D9) |
| `session.ended` | durable | `{ sessionId, endedAt, reason: 'ended' \| 'abandoned' }` | `session-end` verb; also on supersede (FR-009a) |
| `phase.entered` | durable | `{ phase, from, item }` (currentBearing `{phase,item}` derived) | `workflow-advance` seam (D4) |

`invocation.completed` (existing, `aggregated`) is unchanged in class but now (a) stamped with `host`/`path`/`sessionId` and (b) **retained** by the plane (folded into the instance registry) instead of discarded. `session.heartbeat` (existing, `live-only`) feeds the `liveness` axis.

## CurrentSessionRecord (NEW — machine-local — `machine-state/current-session.ts`)

Lives in `MachineStateLocation.durableDir` (`locate.ts:73,181`) beside `installation-id`/token; **not** in git.

```
CurrentSessionRecord = { sessionId: string, startedAt: string /* ISO */ }
```

- `mint()` on `session-start` (writes the record, returns id); `read()` by every invocation (to stamp `sessionId`); `clear()` on `session-end`.
- **Supersede (FR-009a):** `session-start` with an existing record → emit `session.ended{reason:'abandoned'}` for the old id, then overwrite with the new. No nesting/queue.
- Absent record → `sessionId: null` on events (an instance with activity but no open session is valid — FR: instances can exist from a bare invocation).

## InstanceState (NEW projection — served by the API; `plane/instance-registry.ts`)

A **materialized projection** (FR-015), never authoritative. Fields (FR-016/016a/016b/016c):

| Field | Type | Derivation |
|---|---|---|
| `id` | `InstanceId` | envelope `host`+`path` |
| `host`, `path` | `string` | envelope |
| `connection` | `'attached' \| 'disconnected'` | current uplink presence (D1) |
| `liveness` | `'live' \| 'stale' \| 'gone'` | recency of last signal vs. 90 s / 10 min (D1) |
| `lastHeartbeatAt` | `string \| null` | latest `session.heartbeat` |
| `currentSession` | `{ sessionId, startedAt } \| null` | open `session.started` not yet ended |
| `currentBearing` | `{ phase, item } \| null` | latest `phase.entered`; **persists** through `session.ended` (FR-016c) |
| `lastActivityAt` | `string \| null` | wallClock of the latest event of any kind |
| `lastActivity` | `string \| null` | a short label of that event (e.g. verb name / `phase.entered`) |
| `sessionsStarted` | `number` | count of `session.started` |
| `sessionsEnded` | `number` | count of `session.ended` |
| `firstSeenAt` | `string \| null` | wallClock of the earliest event |
| `firstSessionAt` | `string \| null` | earliest `session.started` |
| `phaseDurations` | `{ designing?, specifying?, implementing?, governing? }` (ms) | **cumulative** time-in-phase across re-entries (FR-018); an unobserved phase is **absent**, never `0` (SC-009) |
| `recentActivity` | `Event[]` (≤ `N=50`, newest-first) | bounded convenience view (FR-016b); not authoritative history |

No `waiting` field (FR-017).

## InstanceAccumulator (NEW — internal fold state — parallels `RunAccumulator`)

The mutable per-instance fold state `buildInstanceRegistry` maintains (mirrors `registry.ts:291-321`): keyed by `InstanceId`; no-regress + effectively-once by `invocationSequence` and `eventId` dedupe (reused discipline); tracks the phase-entry timestamp to accrue `phaseDurations` cumulatively (on the next `phase.entered` or a terminal, add `now - phaseEnteredAt` to the leaving phase's total). `toInstanceState(acc)` projects it to the served shape.

## Plan-time constants (NEW — `liveness-constants.ts` seam; each pinned by a RED test — D1)

| Constant | Value | Note |
|---|---|---|
| heartbeat interval | `45_000` ms | reuse 036 `DEFAULT_LIVENESS_INTERVAL_MS` (no new value) |
| liveness window (`live`→`stale`) | `90_000` ms | 2× heartbeat |
| reconciliation grace (`stale`→`gone`) | `600_000` ms | aligned with 036 idle-exit horizon |
| `recentActivity` cap `N` | `50` | eviction asserted at N+1 |
| historical/`gone` retention | (none) | follows the durable event log; no separate eviction clock |

## Relationships

```
Instance (host:path)  1───*  Session (session-start..session-end)
Instance              1───*  Invocation / Run   (run = execute/govern facet)
Session               1───*  Invocation / Run   (attributed via sessionId)
Instance              1───1  InstanceState (materialized projection over the event log)
```
