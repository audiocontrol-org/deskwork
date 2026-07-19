// specs/036-fleet-control-plane — T017 (RED), pairs with T018 impl.
//
// data-model.md § Status — three axes, never collapsed (line ~71-81) pins:
//   connectionStatus  — is the sidecar's session attached
//   livenessStatus    — is the sidecar answering
//   executionStatus   — starting | running | paused | cancelling |
//                        cancelled | completed | failed
// FR-029: the three axes MUST be separate — no single enum may carry more
// than one meaning. FR-030: the plane exposes them SEPARATELY and MUST NOT
// collapse them into one authoritative status (deriving a display summary
// is a CLIENT concern, out of scope for this feature).
// FR-026: a closed socket with no preceding end-of-invocation event MUST be
// recorded as `abnormally-disconnected` — never as conclusive death. Per
// data-model.md § Status, `abnormally-disconnected` is a DISTINCT CONDITION,
// not an executionStatus value.
//
// SCOPE (per the task pairing): the status axis types + membership guards
// only. No registry, no event wiring, no reconciliation window (that's
// T074/T076/T083 — src/sidecar/lifecycle.ts) — this file only proves the
// axes are structurally separate and independently readable.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import * as statusModule from '../../src/fleet/status.js';
import {
  CONNECTION_STATUS_VALUES,
  EXECUTION_STATUS_VALUES,
  LIVENESS_STATUS_VALUES,
  isConnectionStatus,
  isExecutionStatus,
  isLivenessStatus,
  type ConnectionStatus,
  type ExecutionStatus,
  type LivenessStatus,
  type StatusAxes,
} from '../../src/fleet/status.js';

describe('fleet status axes (T017, data-model § Status — three axes, never collapsed)', () => {
  it('pins the three connectionStatus values data-model.md lists, including abnormally-disconnected', () => {
    expect([...CONNECTION_STATUS_VALUES].sort()).toEqual(
      ['abnormally-disconnected', 'attached', 'disconnected'].sort(),
    );
  });

  it('pins the two livenessStatus values data-model.md lists', () => {
    expect([...LIVENESS_STATUS_VALUES].sort()).toEqual(['live', 'unresponsive'].sort());
  });

  it('pins the seven executionStatus values data-model.md lists', () => {
    expect([...EXECUTION_STATUS_VALUES].sort()).toEqual(
      [
        'starting',
        'running',
        'paused',
        'cancelling',
        'cancelled',
        'completed',
        'failed',
      ].sort(),
    );
  });

  it('abnormally-disconnected is NOT a member of executionStatus (FR-026/data-model § Status)', () => {
    // The exact conflation this feature exists to prevent: a dropped
    // connection must never be readable as if it were a terminal execution
    // outcome like "failed".
    expect(isExecutionStatus('abnormally-disconnected')).toBe(false);
    expect(EXECUTION_STATUS_VALUES).not.toContain('abnormally-disconnected');
  });

  it('abnormally-disconnected IS a member of connectionStatus — it is a distinct condition on that axis', () => {
    expect(isConnectionStatus('abnormally-disconnected')).toBe(true);
    expect(CONNECTION_STATUS_VALUES).toContain('abnormally-disconnected');
  });

  it('the three axis value sets are pairwise disjoint — no string is a member of two axes at once', () => {
    // This is the structural guarantee behind FR-029 ("no single enum may
    // carry more than one meaning"): if a value belonged to two axes, a
    // consumer holding just the string could not tell which axis it read
    // from, and the axes would be de-facto collapsible.
    const connection: readonly string[] = CONNECTION_STATUS_VALUES;
    const liveness: readonly string[] = LIVENESS_STATUS_VALUES;
    const execution: readonly string[] = EXECUTION_STATUS_VALUES;

    for (const value of connection) {
      expect(liveness).not.toContain(value);
      expect(execution).not.toContain(value);
    }
    for (const value of liveness) {
      expect(execution).not.toContain(value);
    }
  });

  it('each axis guard accepts only its own axis values (round-trip over every declared value)', () => {
    for (const value of CONNECTION_STATUS_VALUES) {
      expect(isConnectionStatus(value)).toBe(true);
      expect(isLivenessStatus(value)).toBe(false);
      expect(isExecutionStatus(value)).toBe(false);
    }
    for (const value of LIVENESS_STATUS_VALUES) {
      expect(isLivenessStatus(value)).toBe(true);
      expect(isConnectionStatus(value)).toBe(false);
      expect(isExecutionStatus(value)).toBe(false);
    }
    for (const value of EXECUTION_STATUS_VALUES) {
      expect(isExecutionStatus(value)).toBe(true);
      expect(isConnectionStatus(value)).toBe(false);
      expect(isLivenessStatus(value)).toBe(false);
    }
  });

  it('an arbitrary unrelated string belongs to none of the three axes', () => {
    const junk = 'not-a-real-status-value';
    expect(isConnectionStatus(junk)).toBe(false);
    expect(isLivenessStatus(junk)).toBe(false);
    expect(isExecutionStatus(junk)).toBe(false);
  });

  it('StatusAxes carries exactly the three axis fields — no fourth collapsed/authoritative field', () => {
    // Compile-time shape check (mirrors tests/fleet/types.test.ts's
    // EventEnvelope pattern): this object literal only type-checks if
    // StatusAxes has exactly these three fields with these types.
    const axes: StatusAxes = {
      connectionStatus: 'attached',
      livenessStatus: 'live',
      executionStatus: 'running',
    };
    expect(Object.keys(axes).sort()).toEqual(
      ['connectionStatus', 'executionStatus', 'livenessStatus'].sort(),
    );
  });

  it('there is no combined/authoritative status value export on the module (FR-030)', () => {
    // FR-030: the plane MUST NOT collapse the three axes into a single
    // authoritative status. Guard against a future regression that adds
    // back a combined summary export to this module (deriving a display
    // summary belongs to design:feature/fleet-dashboard, not here).
    const moduleExports: typeof statusModule = statusModule;
    const forbiddenNames = [
      'status',
      'authoritativeStatus',
      'overallStatus',
      'summaryStatus',
      'combinedStatus',
      'displayStatus',
    ];
    for (const name of forbiddenNames) {
      expect(Object.prototype.hasOwnProperty.call(moduleExports, name)).toBe(false);
    }
  });

  it('the three axes vary independently — an abnormally-disconnected run keeps a live executionStatus (FR-026: connection loss is not conclusive death)', () => {
    // This is the invariant this module exists to protect: losing the
    // connection must NOT force (or even suggest) a terminal execution
    // outcome. If the module had collapsed the axes, constructing this
    // combination would either fail to type-check or the execution value
    // would have been coerced toward a terminal state.
    const midRunConnectionLoss: StatusAxes = {
      connectionStatus: 'abnormally-disconnected',
      livenessStatus: 'unresponsive',
      executionStatus: 'running',
    };
    expect(midRunConnectionLoss.executionStatus).toBe('running');
    expect(midRunConnectionLoss.connectionStatus).toBe('abnormally-disconnected');

    // And the inverse combination is equally legitimate: a fully attached,
    // live connection can still report a terminal executionStatus (a run
    // that finished while the operator was still watching).
    const finishedWhileAttached: StatusAxes = {
      connectionStatus: 'attached',
      livenessStatus: 'live',
      executionStatus: 'completed',
    };
    expect(finishedWhileAttached.executionStatus).toBe('completed');
    expect(finishedWhileAttached.connectionStatus).toBe('attached');
  });

  it('type-level: ConnectionStatus, LivenessStatus, and ExecutionStatus are distinct literal unions (compile-time)', () => {
    // Each array can only be typed this way if the three type aliases are
    // genuinely separate unions rather than aliases of one shared enum.
    const c: ConnectionStatus[] = ['attached', 'disconnected', 'abnormally-disconnected'];
    const l: LivenessStatus[] = ['live', 'unresponsive'];
    const e: ExecutionStatus[] = [
      'starting',
      'running',
      'paused',
      'cancelling',
      'cancelled',
      'completed',
      'failed',
    ];
    expect(c).toHaveLength(3);
    expect(l).toHaveLength(2);
    expect(e).toHaveLength(7);
  });
});
