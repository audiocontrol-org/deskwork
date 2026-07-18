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
import {
  nextCommandState,
  observeCommandReplay,
  type CommandState,
} from '../../src/fleet/command.js';

// Re-delivering an already-applied command is HARMLESS (the header, lines 6-8):
// at-least-once delivery means the plane may replay a command on reconnect
// (C7), so the replay seam MUST OBSERVE the existing terminal state and return
// it WITHOUT throwing and WITHOUT repeating any side effect. Treating a normal
// replay as an error would surface false command failures to operators under
// ordinary retry conditions (AUDIT-20260717-05). These tests assert the
// idempotent-replay contract via `observeCommandReplay`, NOT rejection.
describe('command idempotence — re-delivery is harmless (T062, FR-054)', () => {
  it('a command already applied stays applied (re-deliver → same state, no throw)', () => {
    const state: CommandState = 'applied';

    // The retry re-delivers the same, already-applied command. Replay is a
    // NO-OP that returns the existing terminal state — it does NOT throw.
    let observed: CommandState = state;
    expect(() => {
      observed = observeCommandReplay(state, 'deliver');
    }).not.toThrow();

    // The invariant: the command stayed applied. No double-effect, no error.
    expect(observed).toBe('applied');
  });

  it('idempotence — replay onto any terminal state observes that same state (never throws)', () => {
    const terminals: CommandState[] = ['applied', 'failed', 'expired', 'rejected', 'superseded'];

    for (const terminal of terminals) {
      // Every replay onto a terminal state returns that terminal state
      // unchanged — the harmless-replay contract, at every terminal.
      expect(observeCommandReplay(terminal, 'deliver')).toBe(terminal);
      expect(observeCommandReplay(terminal, 'receive')).toBe(terminal);
      expect(observeCommandReplay(terminal, 'apply')).toBe(terminal);
    }
  });

  it('a command in flight does not double-apply on re-delivery', () => {
    // Scenario: command is 'delivered' but not yet received/applied. Live
    // (non-terminal) transitions still advance via the real state machine.
    let state: CommandState = 'delivered';
    state = observeCommandReplay(state, 'receive');
    expect(state).toBe('received');

    state = observeCommandReplay(state, 'apply');
    expect(state).toBe('applied');

    // Later, a retry packet arrives with the same command. Re-applying an
    // already-applied command is idempotent: replay observes 'applied' again
    // — no second apply, no throw.
    const replayed = observeCommandReplay(state, 'apply');
    expect(replayed).toBe('applied');
    expect(state).toBe('applied');
  });

  it('at-least-once delivery survives command replay on reconnect (harmless, not an error)', () => {
    // Scenario: sidecar disconnects while processing a command. On reconnect,
    // the plane replays it (sidecar-plane-protocol C7). The sidecar's handler
    // sees the same commandId twice and must treat the replay as harmless.
    let attempt1State: CommandState = 'accepted';
    attempt1State = observeCommandReplay(attempt1State, 'deliver');
    attempt1State = observeCommandReplay(attempt1State, 'receive');
    attempt1State = observeCommandReplay(attempt1State, 'apply');
    expect(attempt1State).toBe('applied');

    // Reconnect: plane replays the command (at-least-once). The replay is a
    // no-op that returns the settled state — NOT a thrown false failure.
    let afterReplay: CommandState = attempt1State;
    expect(() => {
      afterReplay = observeCommandReplay(attempt1State, 'deliver');
    }).not.toThrow();
    expect(afterReplay).toBe('applied');

    // A genuinely illegal LIVE transition still throws (replay-harmless does
    // not weaken the state machine's real protocol guard) — e.g. apply from
    // 'accepted' skips delivered/received.
    expect(() => nextCommandState('accepted', 'apply')).toThrow();
  });
});
