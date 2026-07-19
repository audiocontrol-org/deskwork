// specs/036-fleet-control-plane — T072 (RED), pairs with impl at
// ../../src/execute/cancellation.ts.
//
// data-model.md § `cancel` semantics (PT-011):
//   "Cooperative, task-boundary scoped. Sets a flag the run observes at its
//    next task boundary; does not interrupt mid-task. Ends the run, not the
//    invocation. Child processes are not force-terminated — that is the
//    future `terminate` verb's job... Does not time out: a run that never
//    reaches a boundary stays `cancelling` visibly, which is honest rather
//    than silently escalating to a kill."
//
// This test pins the primitive's state machine in isolation (no live run
// loop wired here — that is a later concern, per the task's framing). It
// asserts the five behaviors enumerated in the task:
//   (a) fresh cancellation is 'running', shouldStopAtBoundary() false
//   (b) after requestCancel(), status is 'cancelling', shouldStopAtBoundary() true
//   (c) status STAYS 'cancelling' across arbitrarily many checks — no timeout,
//       no auto-escalation to 'cancelled' or anything else
//   (d) reaching a boundary (markStoppedAtBoundary()) moves to 'cancelled' (terminal)
//   (e) a second requestCancel() is idempotent (no throw, no state churn)
//
// Real state machine, no fakes/mocks. Relative `.js` imports under node16
// module resolution (no `@/` alias configured in this plugin).

import { describe, expect, it } from 'vitest';
import { createRunCancellation } from '../../src/execute/cancellation.js';

describe('cooperative cancel is task-boundary scoped (T072, PT-011)', () => {
  it('(a) a fresh cancellation starts running, with no stop requested', () => {
    const cancellation = createRunCancellation();

    expect(cancellation.status).toBe('running');
    expect(cancellation.shouldStopAtBoundary()).toBe(false);
  });

  it('(b) requestCancel() moves status to cancelling and shouldStopAtBoundary() becomes true', () => {
    const cancellation = createRunCancellation();

    cancellation.requestCancel();

    expect(cancellation.status).toBe('cancelling');
    expect(cancellation.shouldStopAtBoundary()).toBe(true);
  });

  it('(c) status stays cancelling across arbitrarily many boundary checks — no timeout, no auto-escalation', () => {
    const cancellation = createRunCancellation();
    cancellation.requestCancel();

    for (let i = 0; i < 500; i += 1) {
      expect(cancellation.shouldStopAtBoundary()).toBe(true);
      expect(cancellation.status).toBe('cancelling');
    }

    // Still cancelling — never silently escalated to 'cancelled' on its own.
    expect(cancellation.status).toBe('cancelling');
  });

  it('(d) markStoppedAtBoundary() moves status to cancelled, which is terminal', () => {
    const cancellation = createRunCancellation();
    cancellation.requestCancel();

    cancellation.markStoppedAtBoundary();

    expect(cancellation.status).toBe('cancelled');
  });

  it('(d-terminal) a cancelled cancellation cannot be re-requested or re-stopped', () => {
    const cancellation = createRunCancellation();
    cancellation.requestCancel();
    cancellation.markStoppedAtBoundary();

    expect(() => cancellation.markStoppedAtBoundary()).toThrow();
  });

  it('(e) a second requestCancel() is idempotent — no throw, status unchanged', () => {
    const cancellation = createRunCancellation();
    cancellation.requestCancel();

    expect(() => cancellation.requestCancel()).not.toThrow();
    expect(cancellation.status).toBe('cancelling');
    expect(cancellation.shouldStopAtBoundary()).toBe(true);
  });

  it('markStoppedAtBoundary() without a prior requestCancel() is an illegal transition — throws descriptively', () => {
    const cancellation = createRunCancellation();

    expect(() => cancellation.markStoppedAtBoundary()).toThrow(/cancel/i);
    expect(cancellation.status).toBe('running');
  });

  it('requestCancel() after cancelled is also a no-op, not a resurrection', () => {
    const cancellation = createRunCancellation();
    cancellation.requestCancel();
    cancellation.markStoppedAtBoundary();

    expect(() => cancellation.requestCancel()).not.toThrow();
    expect(cancellation.status).toBe('cancelled');
  });
});
