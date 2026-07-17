// specs/036-fleet-control-plane — T065 (RED), pairs with T070 impl
// (src/plane/commands/dispatch.ts — reconcile lifecycle lives alongside the
// buffer/replay/expiry/fan-out logic it shares a delivery path with; there
// is no dedicated `reconcile.ts` task in tasks.md, so this test targets
// dispatch.ts, same as T063/fanout and T066/config-push).
//
// data-model.md § Supersession table (line ~112):
//   "reconcile | own long-running lifecycle: received → started →
//    completed/failed, results linked by commandId (FR-061)"
// contracts/plane-client-api.md § C6 (line ~51):
//   "`reconcile` has its own received/started/completed/failed lifecycle;
//    results linked by `commandId`. A single acknowledgement does not
//    represent it (FR-061)."
//
// This test pins TWO things:
//   1. `reconcile` has its OWN four-state lifecycle (received → started →
//      completed | failed) that is DISTINCT from and advances INDEPENDENTLY
//      of the generic Command state machine's ack (accepted → delivered →
//      received → applied, src/fleet/command.ts). Reaching the generic
//      'applied' ack does NOT imply the reconcile work itself completed —
//      a single ack does not represent the reconcile lifecycle (FR-061).
//   2. Every reconcile result carries its originating `commandId`, and that
//      `commandId` is stable across every lifecycle advance — that is the
//      "results linked by commandId" half of the contract.
//
// The exact seam under test:
//
//   type ReconcileLifecycleState = 'received' | 'started' | 'completed' | 'failed';
//
//   interface ReconcileResult {
//     commandId: string;
//     state: ReconcileLifecycleState;
//   }
//
//   startReconcileLifecycle(commandId: string): ReconcileResult
//   advanceReconcileLifecycle(result: ReconcileResult, next: ReconcileLifecycleState): ReconcileResult
//
// `advanceReconcileLifecycle` enforces the own-lifecycle ORDER
// (received → started → completed|failed only) — it is a state machine in
// its own right, structurally parallel to (but never conflated with)
// src/fleet/command.ts's `nextCommandState`.
//
// SCOPE: the reconcile lifecycle state machine only. Does not exercise the
// durable store (T069), the HTTP status-by-commandId endpoint (T071), or
// the generic command ack path beyond the one test proving independence.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import {
  startReconcileLifecycle,
  advanceReconcileLifecycle,
  type ReconcileResult,
  type ReconcileLifecycleState,
} from '../../src/plane/commands/dispatch.js';
import { nextCommandState, type CommandState } from '../../src/fleet/command.js';
import { mintUuidV7 } from '../../src/fleet/types.js';

describe('reconcile own lifecycle (T065, FR-061)', () => {
  it('starts in "received" and carries the originating commandId', () => {
    const commandId = mintUuidV7();

    const result: ReconcileResult = startReconcileLifecycle(commandId);

    const expectedInitial: ReconcileLifecycleState = 'received';
    expect(result.commandId).toBe(commandId);
    expect(result.state).toBe(expectedInitial);
  });

  it('advances received → started (legal)', () => {
    const commandId = mintUuidV7();
    const received = startReconcileLifecycle(commandId);

    const started = advanceReconcileLifecycle(received, 'started');

    expect(started.state).toBe('started');
    expect(started.commandId).toBe(commandId);
  });

  it('advances started → completed on the success path', () => {
    const commandId = mintUuidV7();
    const received = startReconcileLifecycle(commandId);
    const started = advanceReconcileLifecycle(received, 'started');

    const completed = advanceReconcileLifecycle(started, 'completed');

    expect(completed.state).toBe('completed');
    expect(completed.commandId).toBe(commandId);
  });

  it('advances started → failed on the failure path', () => {
    const commandId = mintUuidV7();
    const received = startReconcileLifecycle(commandId);
    const started = advanceReconcileLifecycle(received, 'started');

    const failed = advanceReconcileLifecycle(started, 'failed');

    expect(failed.state).toBe('failed');
    expect(failed.commandId).toBe(commandId);
  });

  it('rejects a jump from received straight to completed — a single ack does not represent the lifecycle', () => {
    const commandId = mintUuidV7();
    const received = startReconcileLifecycle(commandId);

    expect(() => advanceReconcileLifecycle(received, 'completed')).toThrow();
  });

  it('rejects any advance out of a terminal state (completed and failed are terminal)', () => {
    const commandId = mintUuidV7();
    const received = startReconcileLifecycle(commandId);
    const started = advanceReconcileLifecycle(received, 'started');
    const completed = advanceReconcileLifecycle(started, 'completed');

    expect(() => advanceReconcileLifecycle(completed, 'started')).toThrow();
    expect(() => advanceReconcileLifecycle(completed, 'failed')).toThrow();
  });

  it('the reconcile lifecycle advances INDEPENDENTLY of the generic command ack reaching "applied"', () => {
    // The generic Command state machine (src/fleet/command.ts) can reach its
    // terminal 'applied' ack — meaning the *reconcile command itself* was
    // delivered and acknowledged by the sidecar — while the reconcile WORK
    // it kicked off is still only 'started', not 'completed'. FR-061: "a
    // single acknowledgement does not represent it."
    const commandId = mintUuidV7();

    let ack: CommandState = 'accepted';
    ack = nextCommandState(ack, 'deliver');
    ack = nextCommandState(ack, 'receive');
    ack = nextCommandState(ack, 'apply');
    expect(ack).toBe('applied');

    const received = startReconcileLifecycle(commandId);
    const reconcile = advanceReconcileLifecycle(received, 'started');

    // The generic ack is fully terminal ('applied'), but the reconcile
    // lifecycle this same commandId names is still mid-flight ('started').
    // They are two SEPARATE state surfaces, not one collapsed into the other.
    expect(ack).toBe('applied');
    expect(reconcile.state).toBe('started');
    expect(reconcile.commandId).toBe(commandId);
  });

  it('every advance preserves commandId — results stay linked to the command that started them', () => {
    const commandId = mintUuidV7();
    const received = startReconcileLifecycle(commandId);
    const started = advanceReconcileLifecycle(received, 'started');
    const completed = advanceReconcileLifecycle(started, 'completed');

    for (const result of [received, started, completed]) {
      expect(result.commandId).toBe(commandId);
    }
  });
});
