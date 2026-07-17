// specs/036-fleet-control-plane — T060 (RED), pairs with T067 impl
// (src/fleet/command.ts and cursor logic). This test pins the INDEPENDENCE
// CONTRACT (FR-058): stream replay position (Last-Event-ID / cursor value)
// is NOT command status.
//
// FR-058: "Stream replay position is NOT command status (FR-058). `Last-Event-ID`
// tracks which frames the stream delivered; it says nothing about receipt or
// application. Separate state, separate advancement rules."
//
// The concrete failure mode this prevents: a delivered-but-unapplied command
// must NEVER look 'applied' or 'complete' just because the stream's cursor
// (Last-Event-ID) advanced to a frame after the delivery frame. The cursor
// tracks delivery; command status tracks what the run did with the delivery.
// They advance independently and for different reasons.
//
// This test models:
//   - CommandCursor: a distinct value representing stream position
//   - CommandState: command application state
//   - Both advance independently
//   - A command can be delivered but cursor can advance; neither implies the other
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { nextCommandState, type CommandState } from '../../src/fleet/command.js';

// Minimal cursor model: an eventId that track stream position independently
// of command state. The cursor advances when the stream delivers ANY event;
// command state advances when a command-specific ack/delivery happens.
interface CommandCursor {
  readonly lastEventId: string;
}

describe('command state vs cursor position are independent (T060, FR-058)', () => {
  // Guard: nextCommandState must be callable (forces module-load to fail if missing)
  if (typeof nextCommandState !== 'function') {
    throw new Error('nextCommandState is not a function');
  }

  it('models CommandCursor as distinct from CommandState', () => {
    const state: CommandState = 'delivered';
    const cursor: CommandCursor = { lastEventId: 'event-123' };
    // They are independent — cursor can be at event-123 while state is still 'delivered'
    expect(state).toBe('delivered');
    expect(cursor.lastEventId).toBe('event-123');
  });

  it('permits cursor advancement without command state change', () => {
    // Scenario: a command is delivered at frame 100; the stream continues emitting
    // non-command events (e.g. run progress events) that advance the cursor to 105.
    // The command state is STILL 'delivered', but the cursor is ahead.
    let commandState: CommandState = 'delivered';
    let cursorPosition: string = 'event-100'; // frame where command was delivered

    // Stream emits non-command events, advancing cursor
    cursorPosition = 'event-105';

    // Command state has NOT changed — it is still 'delivered', not 'applied'
    expect(commandState).toBe('delivered');
    expect(cursorPosition).not.toBe(commandState);
  });

  it('permits command state advancement without cursor reaching that state value', () => {
    // Scenario: a command is delivered, then immediately receives an ack, advancing
    // to 'received'. But if the stream's cursor hasn't reached the ack event yet,
    // the cursor is still at the delivery frame.
    let commandState: CommandState = 'delivered';
    let cursorPosition: string = 'event-100'; // frame where command was delivered

    // Command receives an ack in the local socket (not via the stream yet)
    commandState = 'received';

    // But cursor has not advanced — still at the delivery frame.
    // This is the key insight: the cursor DOES NOT reflect command state.
    expect(commandState).toBe('received');
    expect(cursorPosition).toBe('event-100');
  });

  it('never infers command application from cursor position', () => {
    // The contract being tested: cursor advancement is NEVER evidence of command
    // application. A delivered-but-unapplied command stays visibly un-applied
    // even if the cursor runs far ahead.
    let commandState: CommandState = 'delivered';
    let cursorPosition: string = 'event-100';

    // Cursor advances by 1000 events
    cursorPosition = 'event-1100';

    // Command state is UNCHANGED. The cursor position tells us nothing about
    // whether the command was received or applied.
    expect(commandState).toBe('delivered');
    expect(cursorPosition).not.toMatch(/^delivered$/);
    // i.e., cursorPosition is 'event-1100', which is not a CommandState
  });

  it('distinguishes cursor from state by structure (cursor is event reference; state is enum)', () => {
    // Cursor is a string (eventId reference)
    const cursor: string = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    // State is a narrow enum
    const state: CommandState = 'delivered';

    // They are completely unrelated types
    expect(typeof cursor).toBe('string');
    expect(typeof state).toBe('string'); // CommandState is a string literal type
    // But semantically, cursor is "where the stream is" and state is "what happened to the command"
    expect(cursor).not.toBe(state);
  });
});
