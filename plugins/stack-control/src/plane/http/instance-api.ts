// specs/037-instance-observability — T021/T022 [US1] (impl), pairs with
// tests/instance/api-instances-snapshot.test.ts (T021).
//
// Projects src/plane/instance-registry.ts's (T018) derived `InstanceRegistry` onto the
// client-facing shapes contracts/instance-query-api.md defines:
//
//   - `instanceSnapshot(registry, opts?)` → GET /v1/instances (T022)
//   - `instanceDetail(registry, id)` → GET /v1/instances/:id (T022)
//
// This module is deliberately BELOW the HTTP transport (no server.ts wiring here —
// that is T022's concern). It pins the shape-level contract those routes must serve:
// pure, synchronous, transport-independent projections over `InstanceState`.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports under
// node16 resolution (no `@/` alias — this plugin has none).

import type { InstanceRegistry, InstanceState } from '../instance-registry.js';
import { buildRegistry, type ClassifiedEvent, type FleetEntry } from '../registry.js';

// ---------------------------------------------------------------------------
// Snapshot (T022, GET /v1/instances).
// ---------------------------------------------------------------------------

export interface InstanceSnapshotOptions {
  readonly include?: 'all';
}

export interface InstanceSnapshot {
  readonly instances: readonly InstanceState[];
}

/**
 * Project an InstanceRegistry into an InstanceSnapshot — the current instance
 * state, optionally filtered. Synchronous: the registry holds everything in
 * memory (FR-023/SC-007 — zero durable-store reads), so there is nothing to
 * await.
 *
 * - Default (no `include`) → only instances with connection: 'attached' OR
 *   liveness ∈ {live, stale} (the "connected/recent" view).
 * - `include: 'all'` → also disconnected/gone instances.
 */
export function instanceSnapshot(
  registry: InstanceRegistry,
  opts?: InstanceSnapshotOptions,
): InstanceSnapshot {
  const all = registry.instances();
  if (opts?.include === 'all') {
    return { instances: all };
  }
  const connectedOrRecent = all.filter(
    (instance) =>
      instance.connection === 'attached' ||
      instance.liveness === 'live' ||
      instance.liveness === 'stale',
  );
  return { instances: connectedOrRecent };
}

// ---------------------------------------------------------------------------
// Per-instance detail (T022, GET /v1/instances/:id).
// ---------------------------------------------------------------------------

export interface InstanceDetailSuccess {
  readonly found: true;
  readonly instance: InstanceState;
  readonly recentActivity: readonly unknown[]; // Event[]
}

export interface InstanceDetailNotFound {
  readonly found: false;
  readonly id: string;
}

export type InstanceDetail = InstanceDetailSuccess | InstanceDetailNotFound;

/**
 * Return the full instance state for a given id (host:path), URL-decoded.
 * Unknown id → { found: false, id } (no fabrication, no 404 HTTP layer here —
 * the transport handler builds the 404).
 */
export function instanceDetail(registry: InstanceRegistry, id: string): InstanceDetail {
  const instance = registry.instance(id);
  if (instance === undefined) {
    return { found: false, id };
  }
  return { found: true, instance, recentActivity: instance.recentActivity };
}

// ---------------------------------------------------------------------------
// Per-instance runs facet (T037, GET /v1/instances/:id/runs).
// ---------------------------------------------------------------------------

export interface InstanceRunsResponse {
  readonly runs: readonly FleetEntry[];
}

/**
 * The 036 run registry (`buildRegistry`), FILTERED to the runs OWNED by one
 * instance (`host:path`). A run is owned by the instance whose events carry
 * that run's `host:path` (envelopes carry host/path — T007); this correlates
 * `runId → host:path` off the same in-memory event stream WITHOUT reworking the
 * run registry, keeping `FleetEntry`'s shape unchanged (036 contract). The
 * cross-instance `/v1/fleet` view (`fleetSnapshot`) is untouched — this is the
 * same registry, projected through an ownership filter.
 *
 * Pure and synchronous: everything is in memory (FR-023/SC-007, zero durable
 * reads). `id` is the already-URL-decoded `host:path` the transport handler
 * resolves.
 */
export function instanceRuns(events: readonly ClassifiedEvent[], id: string): InstanceRunsResponse {
  // Runs this instance owns: every runId observed on an event carrying this
  // instance's host:path. Short verbs (runId === null) are never runs.
  const ownedRunIds = new Set<string>();
  for (const { envelope } of events) {
    if (envelope.runId !== null && `${envelope.host}:${envelope.path}` === id) {
      ownedRunIds.add(envelope.runId);
    }
  }
  const runs = buildRegistry([...events]).entries().filter((entry) => ownedRunIds.has(entry.runId));
  return { runs };
}

// ---------------------------------------------------------------------------
// Instance stream deltas (T036, GET /v1/instances/stream).
// ---------------------------------------------------------------------------

/**
 * The instance-stream delta vocabulary (contracts/instance-query-api.md § SSE).
 * REUSES the fleet stream's `instance-upserted` / `instance-removed` terms
 * (`api.ts`'s `computeFleetDeltas`), keyed by the instance `id` (`host:path`)
 * and carrying the full `InstanceState` on an upsert. Deltas only — never a
 * full re-push per event (FR-081-style bound).
 */
export type InstanceDelta =
  | { readonly kind: 'instance-upserted'; readonly instance: InstanceState }
  | { readonly kind: 'instance-removed'; readonly id: string };

/**
 * Value-equality over two `InstanceState` instances. `InstanceState`
 * (toInstanceState) is plain, cycle-free, insertion-ordered data built through
 * one construction path, so `JSON.stringify` comparison is a faithful,
 * dependency-free structural check (mirrors `fleetEntriesEqual` in `api.ts`).
 */
function instanceStatesEqual(a: InstanceState, b: InstanceState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff two `InstanceState` snapshots (successive `buildInstanceRegistry(...)
 * .instances()` reads) into the BOUNDED set of deltas that changed — mirrors
 * `computeFleetDeltas` (api.ts), keyed by `id`:
 * - present in `next` but absent-from/changed-since `previous` → one
 *   `instance-upserted` naming only that instance.
 * - present in `previous` but absent from `next` → one `instance-removed`.
 * - unchanged → NO delta (bounded to what changed, never fleet size).
 * Upserts are ordered before removals (mirrors the fleet delta order).
 */
export function computeInstanceDeltas(
  previous: readonly InstanceState[],
  next: readonly InstanceState[],
): readonly InstanceDelta[] {
  const previousById = new Map(previous.map((instance) => [instance.id, instance] as const));
  const nextIds = new Set(next.map((instance) => instance.id));

  const deltas: InstanceDelta[] = [];
  for (const instance of next) {
    const before = previousById.get(instance.id);
    if (before === undefined || !instanceStatesEqual(before, instance)) {
      deltas.push({ kind: 'instance-upserted', instance });
    }
  }
  for (const instance of previous) {
    if (!nextIds.has(instance.id)) {
      deltas.push({ kind: 'instance-removed', id: instance.id });
    }
  }
  return deltas;
}
