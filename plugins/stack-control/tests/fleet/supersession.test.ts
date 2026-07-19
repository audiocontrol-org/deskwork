// specs/036-fleet-control-plane — T061 (RED), pairs with impl.
//
// data-model.md § Supersession — per-command, never generic (FR-057) pins
// the table (line ~104-113):
//   pause:       superseded by a later `resume` while un-applied
//   resume:      supersedes a pending un-applied `pause`
//   cancel:      two `cancel`s deduplicate, never queue
//   config-push: a newer revision supersedes an older un-applied one
//   reconcile:   own long-running lifecycle: received → started → completed/failed
//
// This test asserts the core rule: supersession is decided PER COMMAND KIND.
// A generic "last command wins" model is insufficient because the rules
// differ by kind (cancel deduplicates; config-push has revision semantics;
// pause/resume are bidirectional). This test pins the exact decision surface:
//
//   supersedes(existing: Command, incoming: Command): boolean
//
// Per the spec, this is PER-COMMAND semantics, not a generic rule — that
// is the load-bearing fact this test verifies.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { supersedes, type Command, type CommandKind } from '../../src/fleet/supersession.js';
import { nextCommandState, type CommandState } from '../../src/fleet/command.js';
import { mintUuidV7 } from '../../src/fleet/types.js';

function makeCommand(kind: CommandKind, opts?: { revision?: number; state?: CommandState }): Command {
  const base: Command =
    opts?.state !== undefined
      ? { commandId: mintUuidV7(), kind, state: opts.state }
      : { commandId: mintUuidV7(), kind };
  if (kind === 'config-push' && opts?.revision !== undefined) {
    return { ...base, revision: opts.revision };
  }
  return base;
}

describe('supersedes (T061, data-model § Supersession — per-command, never generic)', () => {
  it('(a) a later `resume` supersedes a pending un-applied `pause`', () => {
    const pause = makeCommand('pause');
    const resume = makeCommand('resume');

    expect(supersedes(pause, resume)).toBe(true);
  });

  it('(b) two `cancel`s deduplicate — the second does not queue (cancelled is terminal)', () => {
    const cancel1 = makeCommand('cancel');
    const cancel2 = makeCommand('cancel');

    // Both represent the same action; the second should be coalesced into the first
    expect(supersedes(cancel1, cancel2)).toBe(true);
  });

  it('(c) a newer `config-push` revision supersedes an older un-applied one', () => {
    const olderConfig = makeCommand('config-push', { revision: 1 });
    const newerConfig = makeCommand('config-push', { revision: 2 });

    expect(supersedes(olderConfig, newerConfig)).toBe(true);
  });

  it('(c2) an older `config-push` revision does NOT supersede a newer un-applied one', () => {
    const newerConfig = makeCommand('config-push', { revision: 2 });
    const olderConfig = makeCommand('config-push', { revision: 1 });

    expect(supersedes(newerConfig, olderConfig)).toBe(false);
  });

  it('(d) supersession is decided PER KIND, not generically — a `pause` does not supersede an unrelated `config-push`', () => {
    const pause = makeCommand('pause');
    const config = makeCommand('config-push', { revision: 1 });

    expect(supersedes(pause, config)).toBe(false);
  });

  it('(d2) a `cancel` does not supersede a `pause` (each kind has its own semantics)', () => {
    const pause = makeCommand('pause');
    const cancel = makeCommand('cancel');

    expect(supersedes(pause, cancel)).toBe(false);
  });

  it('(d3) a `resume` does NOT supersede a `config-push` (different kinds, different rules)', () => {
    const config = makeCommand('config-push', { revision: 1 });
    const resume = makeCommand('resume');

    expect(supersedes(config, resume)).toBe(false);
  });

  it('(d4) `reconcile` has its own lifecycle and does not participate in simple supersession', () => {
    const reconcile = makeCommand('reconcile');
    const pause = makeCommand('pause');

    // reconcile is long-running (received → started → completed/failed);
    // it is not superseded by pause or vice versa.
    expect(supersedes(reconcile, pause)).toBe(false);
    expect(supersedes(pause, reconcile)).toBe(false);
  });

  it('a `resume` does NOT supersede a `pause` when the pause is already applied (terminal)', () => {
    // data-model.md § Supersession scopes pause/resume supersession to "while
    // un-applied" (FR-057). The applied boundary is load-bearing: an
    // already-applied pause is settled and a later resume must NOT supersede it
    // (superseding a done command would erase a real, honest terminal state).
    const appliedPause = makeCommand('pause', { state: 'applied' });
    const resume = makeCommand('resume');

    expect(supersedes(appliedPause, resume)).toBe(false);

    // Control: the SAME resume DOES supersede an un-applied pause — so the
    // false above is caused by the applied boundary, not by resume never
    // superseding pause at all.
    const unappliedPause = makeCommand('pause');
    expect(supersedes(unappliedPause, resume)).toBe(true);
  });

  // AUDIT-20260718-27: supersedes()'s only guard is isTerminalCommandState,
  // so it treats `delivered` and `received` config-push commands as eligible
  // for supersession just like `accepted` ones (data-model.md § Supersession,
  // FR-060 -- "un-applied" spans all three live states). This must agree with
  // command.ts's TRANSITIONS table: a caller that gets supersedes()===true
  // for a `delivered`/`received` command and then validates the transition
  // via nextCommandState before persisting must NOT throw. This test ties
  // both modules together so a future edit to either one that reintroduces
  // the contradiction fails here, not just in command-machine.test.ts.
  describe('cross-module agreement with command.ts (AUDIT-20260718-27)', () => {
    it('a newer config-push supersedes a `delivered` older one, AND the delivered → superseded transition is legal', () => {
      const olderConfig = makeCommand('config-push', { revision: 1, state: 'delivered' });
      const newerConfig = makeCommand('config-push', { revision: 2 });

      expect(supersedes(olderConfig, newerConfig)).toBe(true);
      expect(() => nextCommandState('delivered', 'supersede')).not.toThrow();
      expect(nextCommandState('delivered', 'supersede')).toBe('superseded');
    });

    it('a newer config-push supersedes a `received` older one, AND the received → superseded transition is legal', () => {
      const olderConfig = makeCommand('config-push', { revision: 1, state: 'received' });
      const newerConfig = makeCommand('config-push', { revision: 2 });

      expect(supersedes(olderConfig, newerConfig)).toBe(true);
      expect(() => nextCommandState('received', 'supersede')).not.toThrow();
      expect(nextCommandState('received', 'supersede')).toBe('superseded');
    });

    it('an `applied` (terminal) config-push is NOT superseded — the applied boundary still holds regardless of the delivered/received fix', () => {
      const appliedConfig = makeCommand('config-push', { revision: 1, state: 'applied' });
      const newerConfig = makeCommand('config-push', { revision: 2 });

      expect(supersedes(appliedConfig, newerConfig)).toBe(false);
      // The state machine agrees from the other direction too: `applied` is
      // terminal, so `supersede` is illegal from it regardless of this fix.
      expect(() => nextCommandState('applied', 'supersede')).toThrow();
    });
  });
});
