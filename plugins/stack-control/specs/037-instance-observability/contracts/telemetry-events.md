# Contract: Telemetry Events (producer → sidecar → plane)

The wire contract for the events this feature produces and the plane folds. Extends 036's envelope + classification seam (`src/fleet/event.ts`, `classification.ts`) — additive, never a break. Shapes in [data-model.md](../data-model.md).

## Extended envelope

Every event's `EventEnvelope` gains three fields (D3):

```
host:      string          // Instance Identity component (hostname)
path:      string          // Instance Identity component (realpath of installation root)
sessionId: string | null   // open session id, or null
```

- Set once in `constructEnvelope`; validated in `validateEnvelope` (fail-loud on wrong type).
- `schemaVersion` increments; pre-feature events lack `host`/`path` and are not attributed to an instance.
- **`host`/`path` MUST NOT be minted or read from any git-tracked file** (SC-004) — derived at runtime only.

## New event types (all `durable`)

Registered by adding to the `EventType` union (`types.ts`) + one `EVENT_CLASSIFICATIONS` entry each (`classification.ts:104-116`). `classifyEvent` fails loud on unknown types — so the union + catalog stay in lockstep (compiler-enforced).

### `session.started`
- **Envelope**: `sessionId` = the new session id; `host`/`path` set.
- **Snapshot**: `{ sessionId, startedAt }`.
- **Producer**: the `session-start` CLI verb (fail-open; never blocks — `session-skills-never-block`).

### `session.ended`
- **Snapshot**: `{ sessionId, endedAt, reason: 'ended' | 'abandoned' }` (`'abandoned'` on supersede, FR-009a).
- **Producer**: the `session-end` verb; and the `session-start` verb when superseding an open session.

### `phase.entered`
- **Snapshot**: `{ phase, from, item }` where `phase`/`from` ∈ the workflow `PhaseId` set (`designing|specifying|implementing|governing|…`) and `item` = the roadmap item identifier. The instance's `currentBearing` is **derived** as `{ phase, item }` from this event — no separate `bearing` field is carried (analyze L2), which also frees the phase-emit seam from resolving the compass.
- **Producer**: a fail-open side emission after the committed `applyTransition` in the `workflow-advance` subcommand (D4). Never emitted on a dry-run.

## Changed handling of existing events

- **`invocation.completed`** (`aggregated`, unchanged class): now stamped with `host`/`path`/`sessionId`, and **retained** by the plane (folded into the instance registry) rather than discarded. Still never a fleet *run* row (runId null).
- **`session.heartbeat`** (`live-only`, unchanged): feeds the `liveness` axis (recency); never durably stored.

## Classification-cost invariant (reused from 036)

- `live-only` → never stored; `aggregated` → rolled into the projection; `durable` → its own immutable record in the event log (the authoritative history instance state rehydrates from). The three new types are `durable` precisely because lifetime counters + the phase timeline must survive a plane restart (FR-013).

## Payload-threading contract (D5 — the sharpest seam)

- `toClassifiedEvent` (`ingest.ts:250`) MUST copy the bounded `snapshot` onto `ClassifiedEvent`, and the event log MUST persist it, so `phase.entered`/`session.*` payloads reach `buildInstanceRegistry` and survive rehydrate. RED test: a `phase.entered` ingested end-to-end appears in the instance's `currentBearing` and persists across a rehydrate.
- Snapshot stays `≤ MAX_EVENT_SNAPSHOT_BYTES` (32 KiB, `event.ts:50`) — the existing bound is unchanged.

## Fail-open contract (reused, non-negotiable — SC-005)

Every producer emit is fail-open: socket resolution, identity derivation, session-record read, envelope construction, and emission MUST NOT slow, block, or fail the `stackctl` invocation (or the phase advance, or the session verb) regardless of sidecar/plane/network state.
