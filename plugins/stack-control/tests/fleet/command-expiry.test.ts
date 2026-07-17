// specs/036-fleet-control-plane — T059 (RED), pairs with T067 impl
// (src/fleet/command.ts). This test pins the EXPIRY CONTRACT (FR-055).
//
// FR-055 states: "Expiry is a visible terminal state (FR-055) — it announces
// itself rather than vanishing." This means:
//   1. 'expired' is a named CommandState value
//   2. 'expired' is terminal — no transition out of it
//   3. A command can be explicitly expired via the 'expire' event
//   4. Expiry is not a silent loss — the state announces the fact
//
// A command never vanishes without announcing its terminal state. This
// contrasts with a command that would "go missing" — expiry is the VISIBLE
// announcement of that finality.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { nextCommandState, type CommandState } from '../../src/fleet/command.js';

describe('command expiry is a visible terminal state (T059, FR-055)', () => {
  it("'expired' is a valid CommandState", () => {
    const state: CommandState = 'expired';
    expect(state).toBe('expired');
  });

  it('accepts transition delivered → expired via the expire event', () => {
    const next = nextCommandState('delivered', 'expire');
    expect(next).toBe('expired');
  });

  it('rejects any transition out of expired (terminal)', () => {
    expect(() => nextCommandState('expired', 'deliver')).toThrow();
    expect(() => nextCommandState('expired', 'receive')).toThrow();
    expect(() => nextCommandState('expired', 'apply')).toThrow();
    expect(() => nextCommandState('expired', 'fail')).toThrow();
    expect(() => nextCommandState('expired', 'reject')).toThrow();
    expect(() => nextCommandState('expired', 'expire')).toThrow();
    expect(() => nextCommandState('expired', 'supersede')).toThrow();
  });

  it('does not permit expiry from non-delivered states', () => {
    // Only delivered → expired is legal; expiry is not reachable from other states
    expect(() => nextCommandState('accepted', 'expire')).toThrow();
    expect(() => nextCommandState('received', 'expire')).toThrow();
    expect(() => nextCommandState('applied', 'expire')).toThrow();
    expect(() => nextCommandState('rejected', 'expire')).toThrow();
    expect(() => nextCommandState('failed', 'expire')).toThrow();
    expect(() => nextCommandState('superseded', 'expire')).toThrow();
  });
});
