// specs/036-fleet-control-plane — T056 (RED), pairs with T067 impl
// (src/fleet/command.ts). This test pins the COMMAND STATE MACHINE and the
// state-transition validation function (FR-050).
//
// State machine (data-model.md § Command → State machine):
//
//     ┌──────────────► rejected   (terminal)
//     │
// accepted ──► delivered ──► received ──► applied   (terminal)
//     │            │             │
//     │            │             └──────► failed    (terminal)
//     │            │
//     │            └────────────────────► expired   (terminal)
//     └──────────────────────────────────► superseded (terminal)
//
// Legal transitions:
//   - accepted → delivered (by 'deliver' event)
//   - accepted → rejected (by 'reject' event)
//   - accepted → superseded (by 'supersede' event)
//   - delivered → received (by 'receive' event)
//   - delivered → failed (by 'fail' event)
//   - delivered → expired (by 'expire' event)
//   - received → applied (by 'apply' event)
//
// Terminal states (no transitions out): accepted, rejected, delivered,
// received, failed, expired, superseded.
//
// Wait, re-reading the spec: "applied" is terminal, as is rejected, failed,
// expired, superseded. But accepted and delivered are not terminal. Let me
// re-read the diagram...
//
// Looking at the diagram:
//   accepted → rejected (terminal)
//   accepted → delivered (non-terminal)
//   accepted → superseded (terminal)
//   delivered → received (non-terminal)
//   delivered → failed (terminal)
//   delivered → expired (terminal)
//   received → applied (terminal)
//
// So the terminals are: rejected, superseded, failed, expired, applied.
//
// Illegal transitions (must throw):
//   - any transition OUT OF a terminal state
//   - any transition not listed above
//   - transitions that skip intermediate states (e.g. accepted → applied)
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { nextCommandState, type CommandState, type CommandEvent } from '../../src/fleet/command.js';

describe('command state machine transitions (T056, FR-050)', () => {
  it('accepts legal transition accepted → delivered', () => {
    const next = nextCommandState('accepted', 'deliver');
    expect(next).toBe('delivered');
  });

  it('accepts legal transition accepted → rejected (terminal)', () => {
    const next = nextCommandState('accepted', 'reject');
    expect(next).toBe('rejected');
  });

  it('accepts legal transition accepted → superseded (terminal)', () => {
    const next = nextCommandState('accepted', 'supersede');
    expect(next).toBe('superseded');
  });

  it('accepts legal transition delivered → received', () => {
    const next = nextCommandState('delivered', 'receive');
    expect(next).toBe('received');
  });

  it('accepts legal transition delivered → failed (terminal)', () => {
    const next = nextCommandState('delivered', 'fail');
    expect(next).toBe('failed');
  });

  it('accepts legal transition delivered → expired (terminal)', () => {
    const next = nextCommandState('delivered', 'expire');
    expect(next).toBe('expired');
  });

  it('accepts legal transition received → applied (terminal)', () => {
    const next = nextCommandState('received', 'apply');
    expect(next).toBe('applied');
  });

  // AUDIT-20260718-27: supersession.ts's supersedes() treats ANY non-terminal
  // existing command as eligible for supersession (its only guard is
  // isTerminalCommandState), which per data-model.md § Supersession spans
  // `accepted`, `delivered`, AND `received` ("a newer revision supersedes an
  // older un-applied one" -- FR-060). The state machine must agree: a
  // `delivered` or `received` command superseded by a racing newer command
  // (e.g. a second config-push arriving while the first is in flight to the
  // sidecar) must be able to legally transition via 'supersede', or a caller
  // that validates via nextCommandState before persisting throws even though
  // supersedes() already said true.
  it('accepts legal transition delivered → superseded (AUDIT-20260718-27, agrees with supersedes())', () => {
    const next = nextCommandState('delivered', 'supersede');
    expect(next).toBe('superseded');
  });

  it('accepts legal transition received → superseded (AUDIT-20260718-27, agrees with supersedes())', () => {
    const next = nextCommandState('received', 'supersede');
    expect(next).toBe('superseded');
  });

  it('rejects illegal transition accepted → applied (skip intermediate)', () => {
    expect(() => nextCommandState('accepted', 'apply')).toThrow();
  });

  it('rejects illegal transition applied → failed (out of terminal)', () => {
    expect(() => nextCommandState('applied', 'fail')).toThrow();
  });

  it('rejects illegal transition rejected → deliver (out of terminal)', () => {
    expect(() => nextCommandState('rejected', 'deliver')).toThrow();
  });

  it('rejects illegal transition failed → apply (out of terminal)', () => {
    expect(() => nextCommandState('failed', 'apply')).toThrow();
  });

  it('rejects illegal transition expired → deliver (out of terminal)', () => {
    expect(() => nextCommandState('expired', 'deliver')).toThrow();
  });

  it('rejects illegal transition superseded → deliver (out of terminal)', () => {
    expect(() => nextCommandState('superseded', 'deliver')).toThrow();
  });

  it('rejects illegal transition delivered → applied (skip received)', () => {
    expect(() => nextCommandState('delivered', 'apply')).toThrow();
  });

  it('rejects illegal transition accepted → failed (wrong event for state)', () => {
    expect(() => nextCommandState('accepted', 'fail')).toThrow();
  });

  it('rejects illegal transition received → expired (wrong event for state)', () => {
    expect(() => nextCommandState('received', 'expire')).toThrow();
  });
});
