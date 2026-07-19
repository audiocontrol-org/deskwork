/**
 * specs/036-fleet-control-plane — T087 (impl), pairs with T078's RED test
 * (tests/fleet/store-health.test.ts).
 *
 * TWO-HOP STORE HEALTH (data-model.md § Store health — two hops, always
 * named, FR-074; contracts/sidecar-plane-protocol.md C9):
 *
 *   - uplink  (sidecar → plane)          — signal: spool depth, last
 *     success, last failure, last error.
 *   - archive (plane → durable store)    — signal: pending count, failed
 *     count, last success, last failure, last error.
 *
 * Each hop is `healthy | degraded | disabled`, surfaced INDEPENDENTLY.
 * "Degraded" must always answer WHICH hop — they fail for unrelated
 * reasons (a spool backing up at the sidecar vs. a durable-store write
 * rejecting), so a single combined indicator would be ambiguous exactly
 * when it matters most. `StoreHealth` therefore carries exactly the two
 * hop fields and NOTHING at the top level that collapses them — no
 * `overallHealth`, no `status`. Consumers read `storeHealth.uplink.status`
 * and `storeHealth.archive.status` separately, always.
 */

/** The three states a single hop can report — never a fourth. */
export type HopHealth = 'healthy' | 'degraded' | 'disabled';

/**
 * Signals shared by both hops: the last time the hop succeeded, the last
 * time it failed, and the last error message observed (if any). Each hop
 * layers its own hop-specific backlog signal on top of this shared base.
 */
export interface HopHealthSignals {
  lastSuccess: string | null;
  lastFailure: string | null;
  lastError: string | null;
}

/** uplink (sidecar → plane) signals — data-model.md § Store health. */
export interface UplinkSignals extends HopHealthSignals {
  /** Spool depth: events buffered at the sidecar awaiting delivery. */
  spoolDepth: number;
}

/** archive (plane → durable store) signals — data-model.md § Store health. */
export interface ArchiveSignals extends HopHealthSignals {
  /** Writes queued for the durable store but not yet confirmed. */
  pendingCount: number;
  /** Writes that failed against the durable store. */
  failedCount: number;
}

/**
 * The two hops, always both present, always independently readable. No
 * collapsed/combined field — see the module header (FR-074).
 */
export interface StoreHealth {
  uplink: UplinkSignals & { status: HopHealth };
  archive: ArchiveSignals & { status: HopHealth };
}

// Backlog thresholds above which a hop is considered degraded even absent
// a fresh error — the spec names the signals but not numeric thresholds,
// so these are the implementation's judgment call for "backing up enough
// to warrant operator attention," kept as named constants so a future
// tuning pass has one place to change.
const UPLINK_SPOOL_DEGRADED_THRESHOLD = 50;
const ARCHIVE_PENDING_DEGRADED_THRESHOLD = 50;

/** True when `a` is strictly more recent than `b` (both ISO timestamps). */
function isMoreRecentThan(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime();
}

/**
 * True when the most recent activity recorded for the hop was a failure —
 * i.e. `lastError` is set AND either nothing has ever succeeded, or the
 * last failure is newer than the last success. A stale failure that has
 * since been superseded by a fresh success does not, by itself, degrade
 * the hop.
 */
function mostRecentActivityIsFailure(signals: HopHealthSignals): boolean {
  if (signals.lastError === null) {
    return false;
  }
  if (signals.lastFailure === null) {
    // An error was recorded but no failure timestamp — treat conservatively
    // as a live failure signal.
    return true;
  }
  if (signals.lastSuccess === null) {
    return true;
  }
  return isMoreRecentThan(signals.lastFailure, signals.lastSuccess);
}

/** A hop that has never seen any activity at all — not yet configured. */
function isUnconfigured(signals: HopHealthSignals): boolean {
  return signals.lastSuccess === null && signals.lastFailure === null && signals.lastError === null;
}

function computeUplinkStatus(signals: UplinkSignals): HopHealth {
  if (isUnconfigured(signals) && signals.spoolDepth === 0) {
    return 'disabled';
  }
  if (mostRecentActivityIsFailure(signals) || signals.spoolDepth >= UPLINK_SPOOL_DEGRADED_THRESHOLD) {
    return 'degraded';
  }
  return 'healthy';
}

function computeArchiveStatus(signals: ArchiveSignals): HopHealth {
  if (isUnconfigured(signals) && signals.pendingCount === 0 && signals.failedCount === 0) {
    return 'disabled';
  }
  if (
    signals.failedCount > 0 ||
    signals.pendingCount >= ARCHIVE_PENDING_DEGRADED_THRESHOLD ||
    mostRecentActivityIsFailure(signals)
  ) {
    return 'degraded';
  }
  return 'healthy';
}

/**
 * Compute two-hop store health from each hop's own signals. Each hop's
 * status is derived from ONLY that hop's own signals — the hops never
 * influence each other's status, which is what makes "which hop is
 * degraded" always answerable (FR-074, C9).
 */
export function computeStoreHealth(uplinkSignals: UplinkSignals, archiveSignals: ArchiveSignals): StoreHealth {
  return {
    uplink: { ...uplinkSignals, status: computeUplinkStatus(uplinkSignals) },
    archive: { ...archiveSignals, status: computeArchiveStatus(archiveSignals) },
  };
}
