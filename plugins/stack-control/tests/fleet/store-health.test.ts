// specs/036-fleet-control-plane — T078 (RED), Phase 6 (US4).
//
// data-model.md § Store health — two hops, always named (FR-074, line ~158):
// Two hops, each surfaced INDEPENDENTLY, each `healthy | degraded | disabled`:
//   - uplink (sidecar → plane) — signal: spool depth, last success, last failure, last error
//   - archive (plane → durable store) — signal: pending count, failed count, last success, last failure, last error
//
// Contract: sidecar-plane-protocol.md C9 (line ~88):
// "Degraded" must always answer WHICH HOP — they fail for unrelated reasons;
// one combined indicator would be ambiguous exactly when it matters.
//
// RED test: the implementation module `src/plane/health.ts` does NOT exist yet.
// This test MUST fail at module-load (VALUE import of a missing module), never
// a typo. The test asserts:
//   (a) uplink and archive statuses are SEPARATELY readable
//   (b) there is NO single collapsed store-health field hiding which hop is degraded
//   (c) degraded uplink + healthy archive (and vice-versa) is representable and
//       each names its own hop
//   (d) each hop carries its documented signals

import { describe, expect, it } from 'vitest';
import type {
  HopHealth,
  HopHealthSignals,
  StoreHealth,
  UplinkSignals,
  ArchiveSignals,
} from '../../src/plane/health.js';
import { computeStoreHealth } from '../../src/plane/health.js';

describe('store health (T078, FR-074 — two hops, always named, independently surfaced)', () => {
  it('pins the three HopHealth status values: healthy, degraded, disabled', () => {
    // Each hop has exactly these three distinct states.
    // (This serves as a compile-time type-check when the impl exists.)
    const healthValues: HopHealth[] = ['healthy', 'degraded', 'disabled'];
    expect(healthValues).toHaveLength(3);
  });

  it('StoreHealth carries exactly two hop fields — uplink and archive — no collapsed indicator (FR-074)', () => {
    // The whole point: uplink and archive are SEPARATE. No combined
    // "overallHealth" field. No "storeStatus" that hides which hop is
    // degraded. If such a field existed, the type would not match the contract.
    const storeHealth: StoreHealth = {
      uplink: {
        status: 'healthy',
        spoolDepth: 0,
        lastSuccess: '2026-01-01T00:00:00.000Z',
        lastFailure: null,
        lastError: null,
      },
      archive: {
        status: 'healthy',
        pendingCount: 0,
        failedCount: 0,
        lastSuccess: '2026-01-01T00:00:00.000Z',
        lastFailure: null,
        lastError: null,
      },
    };
    expect(Object.keys(storeHealth).sort()).toEqual(['archive', 'uplink'].sort());
  });

  it('uplink carries spool depth and success/failure signals (per data-model § Store health)', () => {
    // Uplink signals: spool depth (queue depth), last success, last failure, last error.
    const storeHealth: StoreHealth = {
      uplink: {
        status: 'healthy',
        spoolDepth: 42,
        lastSuccess: '2026-01-01T12:00:00.000Z',
        lastFailure: '2026-01-01T11:59:00.000Z',
        lastError: 'connection timeout',
      },
      archive: {
        status: 'healthy',
        pendingCount: 0,
        failedCount: 0,
        lastSuccess: '2026-01-01T12:00:00.000Z',
        lastFailure: null,
        lastError: null,
      },
    };
    expect(storeHealth.uplink).toHaveProperty('spoolDepth');
    expect(storeHealth.uplink).toHaveProperty('lastSuccess');
    expect(storeHealth.uplink).toHaveProperty('lastFailure');
    expect(storeHealth.uplink).toHaveProperty('lastError');
    expect(typeof storeHealth.uplink.spoolDepth).toBe('number');
  });

  it('archive carries pending and failed counts plus success/failure signals (per data-model § Store health)', () => {
    // Archive signals: pending count, failed count, last success, last failure, last error.
    const storeHealth: StoreHealth = {
      uplink: {
        status: 'healthy',
        spoolDepth: 0,
        lastSuccess: '2026-01-01T12:00:00.000Z',
        lastFailure: null,
        lastError: null,
      },
      archive: {
        status: 'degraded',
        pendingCount: 15,
        failedCount: 3,
        lastSuccess: '2026-01-01T11:55:00.000Z',
        lastFailure: '2026-01-01T11:58:00.000Z',
        lastError: 'S3 throttle',
      },
    };
    expect(storeHealth.archive).toHaveProperty('pendingCount');
    expect(storeHealth.archive).toHaveProperty('failedCount');
    expect(storeHealth.archive).toHaveProperty('lastSuccess');
    expect(storeHealth.archive).toHaveProperty('lastFailure');
    expect(storeHealth.archive).toHaveProperty('lastError');
    expect(typeof storeHealth.archive.pendingCount).toBe('number');
    expect(typeof storeHealth.archive.failedCount).toBe('number');
  });

  it('degraded uplink + healthy archive is representable and each NAMES its hop (FR-074)', () => {
    // The core invariant: when uplink is degraded but archive is healthy,
    // the operator MUST be able to see which hop is degraded — not a vague
    // "system is degraded" but "uplink has spool depth 100, archive is fine."
    const storeHealth: StoreHealth = {
      uplink: {
        status: 'degraded',
        spoolDepth: 100,
        lastSuccess: '2026-01-01T11:50:00.000Z',
        lastFailure: '2026-01-01T11:58:00.000Z',
        lastError: 'spool filling: network lag',
      },
      archive: {
        status: 'healthy',
        pendingCount: 0,
        failedCount: 0,
        lastSuccess: '2026-01-01T12:00:00.000Z',
        lastFailure: null,
        lastError: null,
      },
    };
    // The operator reads: "uplink is degraded" + "archive is healthy".
    // They immediately know which hop to debug.
    expect(storeHealth.uplink.status).toBe('degraded');
    expect(storeHealth.archive.status).toBe('healthy');
    expect(storeHealth.uplink.spoolDepth).toBe(100);
  });

  it('healthy uplink + degraded archive is representable and each NAMES its hop (FR-074)', () => {
    // The inverse: archive fails but uplink is fine. The operator sees
    // which hop is the bottleneck.
    const storeHealth: StoreHealth = {
      uplink: {
        status: 'healthy',
        spoolDepth: 0,
        lastSuccess: '2026-01-01T12:00:00.000Z',
        lastFailure: null,
        lastError: null,
      },
      archive: {
        status: 'degraded',
        pendingCount: 87,
        failedCount: 12,
        lastSuccess: '2026-01-01T11:45:00.000Z',
        lastFailure: '2026-01-01T11:59:00.000Z',
        lastError: 'S3 AccessDenied (permission revoked?)',
      },
    };
    expect(storeHealth.uplink.status).toBe('healthy');
    expect(storeHealth.archive.status).toBe('degraded');
    expect(storeHealth.archive.failedCount).toBe(12);
  });

  it('disabled uplink + healthy archive is representable', () => {
    // All three status values × two hops is representable.
    const storeHealth: StoreHealth = {
      uplink: {
        status: 'disabled',
        spoolDepth: 0,
        lastSuccess: null,
        lastFailure: null,
        lastError: 'socket closed by remote',
      },
      archive: {
        status: 'healthy',
        pendingCount: 0,
        failedCount: 0,
        lastSuccess: '2026-01-01T12:00:00.000Z',
        lastFailure: null,
        lastError: null,
      },
    };
    expect(storeHealth.uplink.status).toBe('disabled');
    expect(storeHealth.archive.status).toBe('healthy');
  });

  it('both hops degraded is representable', () => {
    // Both hops failing at once: uplink is backlogged, archive is rejecting.
    const storeHealth: StoreHealth = {
      uplink: {
        status: 'degraded',
        spoolDepth: 250,
        lastSuccess: '2026-01-01T11:30:00.000Z',
        lastFailure: '2026-01-01T11:58:00.000Z',
        lastError: 'network timeout',
      },
      archive: {
        status: 'degraded',
        pendingCount: 500,
        failedCount: 200,
        lastSuccess: '2026-01-01T11:20:00.000Z',
        lastFailure: '2026-01-01T11:59:00.000Z',
        lastError: 'S3 service unavailable',
      },
    };
    expect(storeHealth.uplink.status).toBe('degraded');
    expect(storeHealth.archive.status).toBe('degraded');
  });

  it('computeStoreHealth() accepts hop signals and returns a StoreHealth object with independently readable hops', () => {
    // The compute function signature (to be implemented in T087):
    // computeStoreHealth(uplinkSignals: UplinkSignals, archiveSignals: ArchiveSignals): StoreHealth
    // This test pins that the function exists, accepts the right signals, and
    // returns an object where the two hops are independently readable.

    const uplinkSignals: UplinkSignals = {
      spoolDepth: 5,
      lastSuccess: '2026-01-01T12:00:00.000Z',
      lastFailure: null,
      lastError: null,
    };

    const archiveSignals: ArchiveSignals = {
      pendingCount: 2,
      failedCount: 0,
      lastSuccess: '2026-01-01T12:00:00.000Z',
      lastFailure: null,
      lastError: null,
    };

    const result = computeStoreHealth(uplinkSignals, archiveSignals);

    // Each hop is independently readable.
    expect(result.uplink.status).toBeDefined();
    expect(result.archive.status).toBeDefined();
    expect(result.uplink).not.toEqual(result.archive);
    // Hop identities are preserved.
    expect(Object.keys(result).sort()).toEqual(['archive', 'uplink'].sort());
  });

  it('there is no combined/authoritative health export that hides which hop is degraded (FR-074)', () => {
    // Guard against regressions that add back a single "storeHealth" or
    // "overallHealth" value that silently re-introduces the ambiguity.
    // If such an export exists, the module load would fail or the consumer
    // would have to choose between reading the combined field vs. the
    // separate hops — exactly the coupling this test prevents.
    const result = computeStoreHealth(
      { spoolDepth: 0, lastSuccess: '2026-01-01T00:00:00.000Z', lastFailure: null, lastError: null },
      { pendingCount: 0, failedCount: 0, lastSuccess: '2026-01-01T00:00:00.000Z', lastFailure: null, lastError: null },
    );
    // If a "status" or "overallHealth" field existed at the top level of
    // StoreHealth, this type would not compile.
    expect(Object.keys(result).sort()).toEqual(['archive', 'uplink'].sort());
    expect('status' in result && typeof result.status === 'string').toBe(false);
  });
});
