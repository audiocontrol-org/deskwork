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
