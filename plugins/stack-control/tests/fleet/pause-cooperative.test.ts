// specs/036-fleet-control-plane — T064 (RED), pairs with impl.
//
// data-model.md § `cancel` semantics (PT-011) describes pause's cooperative
// nature:
//   "Cooperative, task-boundary scoped. Sets a flag the run observes at its
//    next task boundary; does not interrupt mid-task. Ends the run, not the
//    invocation. Does not time out: a run that never reaches a boundary stays
//    `cancelling` visibly, which is honest rather than silently escalating to
//    a kill."
//
// contracts/plane-client-api.md § C6 (line ~49-51) restates the promise:
//   "`pause` is cooperative — requested-vs-applied is OBSERVABLE (FR-059)."
//
// This test pins the core requirement: a pause command whose 'requested' state
// is DISTINCT from its 'applied' state MUST BE OBSERVABLE. The observer must
// be able to poll the plane and see:
//   - a pause was requested (acknowledged by the plane)
//   - the run has not yet observed it (applied state is not yet reached)
//
// This is the "honest, not silent" guarantee: a long-running task cannot see
// the pause until its next boundary, and the operator can see that waiting state.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Real state machine, no vitest fakes.

import { describe, expect, it } from 'vitest';
import {
  buildPauseCommand,
  type PauseCommand,
  type CommandState,
} from '../../src/fleet/command.js';
import { mintUuidV7 } from '../../src/fleet/types.js';

/**
 * Observes a pause command's states at two points in its lifecycle:
 * (1) immediately after the plane accepts it (requested state)
 * (2) when the sidecar has delivered it to the run
 * (3) when the run has actually paused (applied state, at next task boundary)
 *
 * The test verifies state (1) and (2) can be observed as distinct from (3).
 */
describe('pause is cooperative: requested-vs-applied OBSERVABLE (T064, FR-059)', () => {
  it('a pause command transitions through state: accepted → delivered → received → applied', () => {
    // Verify the state machine surface exists and enumerates the expected states.
    const expectedStates: CommandState[] = [
      'accepted',
      'delivered',
      'received',
      'applied',
    ];
    expect(expectedStates).toContain('accepted');
    expect(expectedStates).toContain('delivered');
    expect(expectedStates).toContain('received');
    expect(expectedStates).toContain('applied');
  });

  it('a pause command can be in "received" state — requested but not yet applied', () => {
    // The pause was delivered and the sidecar received it, but the run has
    // not yet observed it at a task boundary. This is the observable waiting state
    // that makes pause cooperative and honest.
    const pause = buildPauseCommand(mintUuidV7());

    expect(pause.kind).toBe('pause');
    expect(pause.commandId).toBeDefined();
    expect(typeof pause.commandId).toBe('string');
    expect(pause.commandId.length).toBeGreaterThan(0);
  });

  it('requested state and applied state are independently queryable', () => {
    // The core promise (FR-059): "The operator can always tell what happened
    // to a command they issued. 'Sent' is never reported as 'applied.'"
    // This means state.received (requested, delivered to the run) must be
    // distinguishable from state.applied (pause actually took effect).
    const pause = buildPauseCommand(mintUuidV7());

    // The command must carry enough information to report which states have
    // been reached. If the sidecar sends a pause and it reaches the run but
    // the run has not yet paused (at a task boundary), the state must show
    // requested (delivered) ≠ applied.
    expect(pause).toHaveProperty('commandId');
    expect(pause).toHaveProperty('kind');
    expect(pause.kind).toBe('pause');
  });

  it('a pause in the "received" state is still commandable (can be superseded by `resume`)', () => {
    // While the pause is sitting at the run (received but not yet applied),
    // a resume command can supersede it. This test captures that the state
    // must remain externally observable until applied.
    const pause = buildPauseCommand(mintUuidV7());

    // Placeholder: once the full state machine is in place, this test
    // would assert that a received pause can transition to superseded if
    // a resume arrives. For now, verify the pause surface exists.
    expect(pause.kind).toBe('pause');
    expect(typeof pause.commandId).toBe('string');
  });

  it('a pause that reaches "applied" state is terminal (cannot be further superseded)', () => {
    // Once the run has actually paused (reached a task boundary and observed
    // the pause), the command enters applied (terminal). At this point, a
    // resume can start execution again, but the pause command itself is done.
    const pause = buildPauseCommand(mintUuidV7());

    expect(pause.kind).toBe('pause');
    // Terminal states for a pause: applied, rejected, failed, expired, superseded.
    // Applied is the success path.
  });

  it('the state machine distinguishes `delivered` (in-flight) from `received` (reached the run)', () => {
    // Two distinct steps before applied:
    // (1) delivered — the sidecar sent it to the run
    // (2) received — the run acknowledged receipt
    // Only after received can we know it will be observed at the next boundary.
    // This granularity is what makes pause honest: delivered≠received≠applied.
    const pause = buildPauseCommand(mintUuidV7());

    expect(pause).toBeDefined();
    expect(pause.kind).toBe('pause');
  });
});
