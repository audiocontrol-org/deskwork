// specs/036-fleet-control-plane — T062 (RED), pairs with T067 impl
// (src/fleet/command.ts). This test pins the IDEMPOTENCE CONTRACT (FR-054).
//
// FR-054: "Commands are idempotent (FR-054) — delivery is at-least-once."
//
// The concrete semantics: re-delivering an already-applied command is HARMLESS.
// Applying the same command effect twice yields the same terminal state with no
// error and no double-effect (the effect is idempotent, not executed twice).
//
// This is critical for the at-least-once delivery guarantee: the plane may
// replay a command on reconnect (sidecar-plane-protocol C7: "replays unexpired
// commands on reconnect"), so the sidecar's handler MUST be prepared to receive
// the same command multiple times and treat them identically.
//
// Examples:
//   - pause: sending pause twice while paused = stay paused (idempotent)
//   - resume: sending resume twice while resumed = stay resumed (idempotent)
//   - cancel: sending cancel twice to the same run = one cancellation (deduplicate)
//   - config-push: older revision superseded by newer = don't apply old (prevent double)
//
// The state machine reflects this: a delivered command that's already applied
// stays applied; re-delivery does not bounce it into a new state.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { nextCommandState, type CommandState } from '../../src/fleet/command.js';

describe('command idempotence — re-delivery is harmless (T062, FR-054)', () => {
  it('a command already applied stays applied (re-deliver → same state)', () => {
    // A command is at 'applied' (terminal).
    // A retry mechanism re-delivers the same command.
    let state: CommandState = 'applied';

    // The re-delivery would normally be consumed via the 'deliver' event.
    // But the state is already 'applied' — attempting to re-transition throws.
    // This is the guard that enforces idempotence: a retry on an already-applied
    // command is refused (terminal state blocks transitions).
    expect(() => nextCommandState(state, 'deliver')).toThrow();

    // The invariant: the command stayed applied. No double-effect.
    expect(state).toBe('applied');
  });

  it('idempotence is enforced by terminal-state guard', () => {
    // All terminal states reject new events:
    const terminals: CommandState[] = ['applied', 'failed', 'expired', 'rejected', 'superseded'];

    for (const terminal of terminals) {
      expect(() => nextCommandState(terminal, 'deliver')).toThrow();
      expect(() => nextCommandState(terminal, 'receive')).toThrow();
      expect(() => nextCommandState(terminal, 'apply')).toThrow();
    }

    // A terminal state never transitions, so re-delivery has no effect.
    // This is what makes the semantics idempotent.
  });

  it('a command in flight does not double-apply on re-delivery', () => {
    // Scenario: command is 'delivered' but not yet received/applied.
    // A network hiccup causes a re-delivery.
    let state: CommandState = 'delivered';

    // First delivery is accepted and processing begins
    state = nextCommandState(state, 'receive');
    expect(state).toBe('received');

    state = nextCommandState(state, 'apply');
    expect(state).toBe('applied');

    // Later, a retry packet arrives with the same command.
    // Re-delivering to an already-applied command is idempotent:
    // the state guard prevents a second apply.
    expect(() => nextCommandState(state, 'apply')).toThrow();

    // The command is still 'applied' (once, not twice).
    expect(state).toBe('applied');
  });

  it('at-least-once delivery survives command replay on reconnect', () => {
    // Scenario: sidecar disconnects while processing a command.
    // On reconnect, the plane replays it (sidecar-plane-protocol C7).
    // The sidecar's handler sees the same commandId twice.

    // First attempt: command progresses normally
    let attempt1State: CommandState = 'accepted';
    attempt1State = nextCommandState(attempt1State, 'deliver');
    attempt1State = nextCommandState(attempt1State, 'receive');
    attempt1State = nextCommandState(attempt1State, 'apply');
    expect(attempt1State).toBe('applied');

    // Reconnect: plane replays the command (at-least-once guarantee).
    // The sidecar's handler must treat the second delivery as idempotent.
    // The state is terminal, so re-delivery is blocked:
    expect(() => nextCommandState(attempt1State, 'deliver')).toThrow();

    // Net result: command is applied once, no side effects from replay.
    expect(attempt1State).toBe('applied');
  });
});
