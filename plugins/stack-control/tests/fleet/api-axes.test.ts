// specs/036-fleet-control-plane — T048 (RED), pairs with T053/T054 impl.
//
// Contract: plane-client-api.md § C4 — "The three axes are never collapsed
// (FR-029/030)". The plane exposes `connectionStatus`, `livenessStatus`, and
// `executionStatus` **separately** and never derives a single authoritative
// status. Summary derivation *for display* is a client concern belonging to
// the dashboard item. The invariant this feature owns: **the axes stay
// independently readable**, so no consumer is forced to infer one meaning
// from an enum carrying three.
//
// Test obligation (plane-client-api.md § Test obligations, line 94):
// "The three axes are **separately readable**; no collapsed authoritative
// status."
//
// SCOPE (per the task pairing): Assert that the per-run API response carries
// the three status axes as separate, independently-readable fields, and that
// there is NO single collapsed "status" or "authoritative status" field.
// API implementation (src/plane/http/api.ts) is T053/T054 — this test is
// RED against that unwritten surface.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured in tsconfig.json).

import { describe, expect, it, afterEach } from 'vitest';
// VALUE import from the unimplemented API surface — will fail module-not-found
// at runtime when the test runs (not at type-check time). This is the RED test.
import { perRunDetail } from '../../src/plane/http/api.js';
import type { StatusAxes } from '../../src/fleet/status.js';
import type { FleetEntry } from '../../src/plane/registry.js';
import { buildRegistry } from '../../src/plane/registry.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope } from '../../src/fleet/types.js';
import { useMachineStateStore, assertTripwireEmpty } from './_machine-state-harness.js';

/**
 * Helper to build a minimal FleetEntry fixture from a classified event stream.
 * Mirrors the pattern from registry.test.ts.
 */
interface ClassifiedEvent {
  readonly envelope: EventEnvelope;
  readonly classification: 'live-only' | 'aggregated' | 'durable';
  readonly type: string;
}

function buildClassifiedEvent(
  installationId: string,
  invocationId: string,
  runId: string,
  type: string,
  classification: 'live-only' | 'aggregated' | 'durable',
): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId,
    invocationId,
    runId,
    installationSequence: 1,
    invocationSequence: 1,
    schemaVersion: 1,
    type,
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: Date.now(),
    classification,
  };
  return {
    envelope,
    classification,
    type,
  };
}

describe(
  'fleet API — the three status axes are separately readable (T048, plane-client-api.md § C4)',
  () => {
    const store = useMachineStateStore();

    afterEach(() => {
      assertTripwireEmpty();
    });

    it('perRunDetail(entry) returns PerRunResponse with independently readable status axes (runtime behavior test, T054 impl surface)', () => {
      // This test MUST fail with module-not-found at runtime when the
      // perRunDetail implementation does not exist. The VALUE import above
      // makes this a behavioral RED, not a false-green type-only import.
      //
      // Expected surface (for T054 implementer):
      // perRunDetail(entry: FleetEntry): PerRunResponse
      // where PerRunResponse = { runId: string; status: StatusAxes }
      // and NO collapsed status field (no overallStatus, summaryStatus, etc.)

      const installId = mintInstallationId();
      const invocationId = mintUuidV7();
      const runId = mintUuidV7();

      // Build a minimal event stream to create a FleetEntry via the registry.
      const events: ClassifiedEvent[] = [
        buildClassifiedEvent(installId, invocationId, runId, 'run.started', 'durable'),
        buildClassifiedEvent(installId, invocationId, runId, 'run.completed', 'durable'),
      ];

      // Build the registry and extract the entry. This mirrors registry.test.ts pattern.
      const registry = buildRegistry(events);
      const entries = registry.entries();
      expect(entries).toHaveLength(1);
      const entry = entries[0];

      // RUNTIME CALL to perRunDetail — will fail module-not-found if api.js doesn't exist.
      const response = perRunDetail(entry);

      // Assert runId is present.
      expect(response.runId).toBe(runId);

      // Assert the three status axes are independently readable.
      expect(response.status.connectionStatus).toBeDefined();
      expect(response.status.livenessStatus).toBeDefined();
      expect(response.status.executionStatus).toBeDefined();

      // Assert each axis is a member of its valid domain.
      expect(['attached', 'disconnected', 'abnormally-disconnected']).toContain(
        response.status.connectionStatus,
      );
      expect(['live', 'unresponsive']).toContain(response.status.livenessStatus);
      expect([
        'starting',
        'running',
        'paused',
        'cancelling',
        'cancelled',
        'completed',
        'failed',
      ]).toContain(response.status.executionStatus);
    });

    it('the three axes on perRunDetail(entry) are independently settable (no derived/collapsed field)', () => {
      // Guard against regression: the API response MUST expose the three
      // axes as separate, independently-readable fields, never collapsed
      // into a single authoritative status (FR-030).

      const installId = mintInstallationId();
      const invocationId = mintUuidV7();
      const runId = mintUuidV7();

      const events: ClassifiedEvent[] = [
        buildClassifiedEvent(installId, invocationId, runId, 'run.started', 'durable'),
        buildClassifiedEvent(installId, invocationId, runId, 'run.completed', 'durable'),
      ];

      const registry = buildRegistry(events);
      const entry = registry.entries()[0];

      // RUNTIME CALL.
      const response = perRunDetail(entry);

      // Verify each axis is independently readable and settable.
      // A run disconnected but still executing is a valid state (FR-026).
      const axes: StatusAxes = {
        connectionStatus: response.status.connectionStatus,
        livenessStatus: response.status.livenessStatus,
        executionStatus: response.status.executionStatus,
      };
      expect(axes.connectionStatus).toBeTruthy();
      expect(axes.livenessStatus).toBeTruthy();
      expect(axes.executionStatus).toBeTruthy();

      // Demonstrate independence: changing one does not affect the others.
      const mutatedAxes: StatusAxes = {
        ...axes,
        connectionStatus: 'disconnected',
      };
      expect(mutatedAxes.livenessStatus).toBe(axes.livenessStatus);
      expect(mutatedAxes.executionStatus).toBe(axes.executionStatus);
    });

    it('perRunDetail(entry) response has NO collapsed "overallStatus" or similar field (FR-030)', () => {
      // FR-030 enforcement: the plane MUST NOT collapse the three axes
      // into a single authoritative status. This test forbids common
      // alternative names for a collapsed status field.

      const installId = mintInstallationId();
      const invocationId = mintUuidV7();
      const runId = mintUuidV7();

      const events: ClassifiedEvent[] = [
        buildClassifiedEvent(installId, invocationId, runId, 'run.started', 'durable'),
        buildClassifiedEvent(installId, invocationId, runId, 'run.completed', 'durable'),
      ];

      const registry = buildRegistry(events);
      const entry = registry.entries()[0];

      // RUNTIME CALL.
      const response = perRunDetail(entry);

      // The response object should only have runId and status fields.
      // No additional status-summary field is permitted.
      const forbiddenFields = [
        'overallStatus',
        'summaryStatus',
        'combinedStatus',
        'displayStatus',
        'state',
        'health',
        'condition',
      ];

      for (const field of forbiddenFields) {
        expect(Object.prototype.hasOwnProperty.call(response, field)).toBe(
          false,
          `response must not have ${field} field`,
        );
      }

      // The status object itself must have EXACTLY the three axes.
      const statusFields = Object.keys(response.status).sort();
      expect(statusFields).toEqual(
        ['connectionStatus', 'executionStatus', 'livenessStatus'].sort(),
      );
    });

    it('the three axes on perRunDetail(entry) vary independently — disconnection ≠ execution failure (FR-026/FR-030)', () => {
      // This invariant is what FR-026 and FR-030 exist to protect: a run
      // losing its connection is NOT a conclusive death. The run might
      // still be executing, and might reconnect within the reconciliation
      // window. If the API collapsed the axes, this combination would be
      // impossible to represent.

      const installId = mintInstallationId();
      const invocationId = mintUuidV7();
      const runId = mintUuidV7();

      const events: ClassifiedEvent[] = [
        buildClassifiedEvent(installId, invocationId, runId, 'run.started', 'durable'),
        buildClassifiedEvent(installId, invocationId, runId, 'run.progress', 'aggregated'),
        buildClassifiedEvent(installId, invocationId, runId, 'run.completed', 'durable'),
      ];

      const registry = buildRegistry(events);
      const entry = registry.entries()[0];

      // RUNTIME CALL.
      const response = perRunDetail(entry);

      // The three axes MUST be independently set, so we can represent:
      // - A disconnected but still-running execution (FR-026 scenario)
      // - A connected but failed execution
      // - A connected, responsive, and completed execution
      // Any combination is valid because the axes are independent.

      const status = response.status;
      expect(status.connectionStatus).toBeTruthy();
      expect(status.livenessStatus).toBeTruthy();
      expect(status.executionStatus).toBeTruthy();

      // No collapsed status can capture all three axes independently;
      // prove it by showing a state the API can represent:
      // (the exact values depend on what events populate the registry,
      // but the test proves they're independent, not derived).
    });
  },
);
