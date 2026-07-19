// specs/037-instance-observability — T003 (impl), pairs with T002's RED test
// (tests/instance/constants.test.ts).
//
// CONTRACT (data-model.md D1):
// - HEARTBEAT_INTERVAL_MS reuses 036's DEFAULT_LIVENESS_INTERVAL_MS
//   (src/sidecar/daemon.ts) rather than restating an independent 45_000 —
//   one source of truth for the heartbeat cadence.
// - LIVENESS_WINDOW_MS = 90_000 (live -> stale boundary; 2x heartbeat).
// - RECONCILIATION_GRACE_MS = 600_000 (stale -> gone boundary; 10 min).
// - RECENT_ACTIVITY_CAP = 50 (N; eviction asserted at N+1 elsewhere).
// - deriveLiveness classifies a last-signal age against the two boundaries
//   above: 'live' when age <= LIVENESS_WINDOW_MS, 'stale' when age is
//   between LIVENESS_WINDOW_MS (exclusive) and RECONCILIATION_GRACE_MS
//   (inclusive), 'gone' when age > RECONCILIATION_GRACE_MS.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

import { DEFAULT_LIVENESS_INTERVAL_MS } from '../sidecar/daemon.js';

/** Heartbeat cadence — derived from 036's DEFAULT_LIVENESS_INTERVAL_MS. */
export const HEARTBEAT_INTERVAL_MS = DEFAULT_LIVENESS_INTERVAL_MS;

/** live -> stale boundary; 2x the heartbeat interval. */
export const LIVENESS_WINDOW_MS = HEARTBEAT_INTERVAL_MS * 2;

/** stale -> gone boundary; 10 minutes. */
export const RECONCILIATION_GRACE_MS = 600_000;

/** Recent-activity ring cap; eviction is asserted at N+1 elsewhere. */
export const RECENT_ACTIVITY_CAP = 50;

/** Instance liveness classification derived from a last-signal age. */
export type Liveness = 'live' | 'stale' | 'gone';

/**
 * Classify a last-signal age against the liveness/reconciliation
 * boundaries: 'live' at or below LIVENESS_WINDOW_MS, 'stale' strictly
 * above LIVENESS_WINDOW_MS and at or below RECONCILIATION_GRACE_MS,
 * 'gone' strictly above RECONCILIATION_GRACE_MS.
 */
export function deriveLiveness(lastSignalAgeMs: number): Liveness {
  if (lastSignalAgeMs <= LIVENESS_WINDOW_MS) return 'live';
  if (lastSignalAgeMs <= RECONCILIATION_GRACE_MS) return 'stale';
  return 'gone';
}
