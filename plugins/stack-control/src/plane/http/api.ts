// specs/036-fleet-control-plane — T053 + T054 [US2] (impl), pairs with
// tests/fleet/api-snapshot.test.ts (T046), tests/fleet/api-deltas.test.ts
// (T047), and tests/fleet/api-axes.test.ts (T048).
//
// Projects src/plane/registry.ts's (T050) derived `FleetRegistry` onto the
// two client-facing shapes contracts/plane-client-api.md defines:
//
//   C2 — Snapshot, then deltas (FR-081):
//     - `fleetSnapshot(registry)`      → GET /v1/fleet          (T053)
//     - `computeFleetDeltas(prev,next)` → GET /v1/fleet/stream   (T053)
//   C5 — Per-run detail (FR-083):
//     - `perRunDetail(entry)`          → GET /v1/runs/{runId}    (T054)
//
// This module is deliberately BELOW the HTTP/SSE transport (no server.ts /
// ingest.ts wiring here — that is T051/T052/T101's concern). It pins the
// shape-level contract those routes must serve: pure, synchronous,
// transport-independent projections over `FleetEntry` / `FleetRegistry`.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias — this plugin has none).

import type { FleetCommandKind, FleetEntry, FleetRegistry, RunProgress, TimingsRecord } from '../registry.js';
import type { StatusAxes } from '../../fleet/status.js';

// ---------------------------------------------------------------------------
// C2 — Snapshot (T053, GET /v1/fleet).
// ---------------------------------------------------------------------------

/**
 * The client-visible projection of one commandable run, as it appears in a
 * fleet snapshot. Structurally identical to `FleetEntry` (T050) — the
 * snapshot is a direct, order-preserving projection of the registry, not a
 * re-shaping — aliased under the API's own name so callers of this module
 * depend on the API contract's vocabulary, not the registry's internal type.
 */
export type FleetSnapshotEntry = FleetEntry;

/**
 * The full current fleet state (C2 "Initial: snapshot"). One entry per
 * commandable run, each exactly once (SC-003), in first-observed order
 * (the order `FleetRegistry.entries()` — T050 — already guarantees).
 */
export interface FleetSnapshot {
  readonly entries: readonly FleetSnapshotEntry[];
}

/**
 * Project a `FleetRegistry` into a `FleetSnapshot` — the whole current fleet
 * state in ONE call, no per-installation fan-out (SC-003). Synchronous: the
 * registry already holds everything in memory (C7 — live views generate
 * zero durable-store reads), so there is nothing to await here.
 */
export function fleetSnapshot(registry: FleetRegistry): FleetSnapshot {
  return { entries: registry.entries() };
}

// ---------------------------------------------------------------------------
// C2 — Deltas (T053, GET /v1/fleet/stream).
// ---------------------------------------------------------------------------

/**
 * The four-kind delta vocabulary C2 enumerates. A delta describes only WHAT
 * CHANGED — never a restatement of the whole fleet (FR-081: "a full registry
 * push per telemetry event is prohibited"). `command-updated` and
 * `store-health-changed` are part of this closed union for API-contract
 * completeness (C6 commands, § Store health — two hops); this module's own
 * `computeFleetDeltas` (a pure `FleetEntry[]` diff) only ever produces
 * `instance-upserted` / `instance-removed` — command lifecycle and store
 * health are sourced elsewhere (the command subsystem, T05x; the store
 * health poller) and multiplexed onto this same delta stream at the
 * transport layer (T101), not fabricated here.
 */
export type FleetDelta =
  | { readonly kind: 'instance-upserted'; readonly instance: FleetEntry }
  | { readonly kind: 'instance-removed'; readonly runId: string }
  | { readonly kind: 'command-updated'; readonly commandId: string; readonly status: string }
  | {
      readonly kind: 'store-health-changed';
      readonly hop: 'uplink' | 'archive';
      readonly status: string;
    };

/**
 * Deterministic delta ordering: upserts before removals before command
 * updates before store-health changes (mirrors C2's own listing order).
 * Exhaustive `never` switch (Constitution: the audit-barrage is stochastic
 * defense-in-depth; a closed union's completeness is the COMPILER's job,
 * never a heuristic's — see
 * .claude/rules/audit-barrage-is-stochastic-defense-in-depth.md). If
 * `FleetDelta` ever grows, drops, or renames a kind, this function's
 * `default` branch fails `tsc --noEmit` before any review — heuristic or
 * human — would get a chance to notice.
 */
function deltaKindOrder(kind: FleetDelta['kind']): number {
  switch (kind) {
    case 'instance-upserted':
      return 0;
    case 'instance-removed':
      return 1;
    case 'command-updated':
      return 2;
    case 'store-health-changed':
      return 3;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/**
 * Value-equality over two `FleetEntry` instances. `FleetEntry` (T050) is
 * plain, cycle-free, insertion-ordered data — always built through the same
 * `toEntry()` construction path — so `JSON.stringify` comparison is a
 * faithful, dependency-free structural-equality check (no deep-equal
 * library needed for this shape).
 */
function fleetEntriesEqual(a: FleetEntry, b: FleetEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff two `FleetEntry` snapshots (e.g. successive `registry.entries()`
 * calls, one per inbound telemetry event) into the BOUNDED set of deltas
 * that changed (C2, FR-081). Pure and transport-independent: no HTTP/SSE
 * framing here (T101's concern) — only the shape-level diff those routes
 * must serve.
 *
 * - A run present in `next` but absent from — or changed since — `previous`
 *   yields exactly one `instance-upserted` delta naming only that run.
 * - A run present in `previous` but absent from `next` yields exactly one
 *   `instance-removed` delta naming only that run's id.
 * - An unchanged run yields NO delta — this is what keeps the payload
 *   bounded to what changed, never proportional to fleet size.
 */
export function computeFleetDeltas(
  previous: readonly FleetEntry[],
  next: readonly FleetEntry[],
): readonly FleetDelta[] {
  const previousByRunId = new Map(previous.map((entry) => [entry.runId, entry] as const));
  const nextRunIds = new Set(next.map((entry) => entry.runId));

  const deltas: FleetDelta[] = [];

  for (const entry of next) {
    const before = previousByRunId.get(entry.runId);
    if (before === undefined || !fleetEntriesEqual(before, entry)) {
      deltas.push({ kind: 'instance-upserted', instance: entry });
    }
  }

  for (const entry of previous) {
    if (!nextRunIds.has(entry.runId)) {
      deltas.push({ kind: 'instance-removed', runId: entry.runId });
    }
  }

  return deltas.sort((a, b) => deltaKindOrder(a.kind) - deltaKindOrder(b.kind));
}

// ---------------------------------------------------------------------------
// C5 — Per-run detail (T054, GET /v1/runs/{runId}).
// ---------------------------------------------------------------------------

/** Bare identity facet — the two ids that, together with the top-level
 * `runId`, uniquely place this run in the fleet. */
export interface PerRunOverview {
  readonly installationId: string;
  readonly invocationId: string;
}

/** Execution-progress facet: derived progress counters + the commands
 * currently offered (both already carried on `FleetEntry`, C6). */
export interface PerRunExecution {
  readonly progress: RunProgress;
  readonly availableActions: readonly FleetCommandKind[];
}

/** Timing-envelope facet: first/last observed telemetry for this run. */
export interface PerRunTimings {
  readonly firstObserved: TimingsRecord;
  readonly lastObserved: TimingsRecord;
}

/**
 * Per-run detail response (C5: "Overview, artifacts, execution, governance,
 * timings, reconciliation"). `status` carries the three axes SEPARATELY
 * (FR-029/030) — it is `entry.statusAxes` verbatim, so it has EXACTLY the
 * three axis fields and nothing else; this response never adds a collapsed
 * `overallStatus`/`summaryStatus`/`state`/`health`/`condition` field.
 *
 * `artifacts`, `governance`, and `reconciliation` are C5 facets this type
 * deliberately does NOT declare: `FleetEntry` (T050) carries no data for
 * them — they are sourced from bounded SNAPSHOT PAYLOADS (event.ts §
 * SnapshotPayload) once that pipeline lands, mirroring T050's own
 * documented omission of the `compass`/`model`/`git` Fleet-instance facets
 * for the identical no-fallback reason. Any artifact reference a future
 * producer of the `artifacts` facet surfaces here MUST first pass
 * `validateArtifactRef` (src/fleet/artifact.ts, T049, PT-009).
 */
export interface PerRunResponse {
  readonly runId: string;
  readonly status: StatusAxes;
  readonly overview: PerRunOverview;
  readonly execution: PerRunExecution;
  readonly timings: PerRunTimings;
}

/**
 * Project one `FleetEntry` into its per-run detail response (C5). Pure and
 * synchronous — everything this projection needs already lives on the
 * in-memory registry entry (C7).
 */
export function perRunDetail(entry: FleetEntry): PerRunResponse {
  return {
    runId: entry.runId,
    status: entry.statusAxes,
    overview: {
      installationId: entry.installationId,
      invocationId: entry.invocationId,
    },
    execution: {
      progress: entry.progress,
      availableActions: entry.availableActions,
    },
    timings: {
      firstObserved: entry.firstObserved,
      lastObserved: entry.lastObserved,
    },
  };
}
