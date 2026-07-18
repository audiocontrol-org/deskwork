// specs/036-fleet-control-plane — T064, corrected under AUDIT-20260718-13.
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
// AUDIT-20260718-13: the prior version of this suite was PLACEHOLDERS — it only
// checked a local string array or that `buildPauseCommand()` returns
// `{ kind: 'pause', commandId }`, with explicit "would assert / for now" prose
// standing in for the real transitions. With those green, an implementation
// could collapse `accepted` / `delivered` / `received` / `applied` into one
// state and still pass. This version DRIVES the real command state machine
// (`nextCommandState`) AND the durable command-status API (`CommandStore` +
// `transition` + `commandStatus`) through requested → delivered → received →
// applied and supersession, asserting DISTINCT observable/queryable states:
//   - a received-but-not-applied pause is observably ≠ applied,
//   - a resume supersedes an UN-applied pause but NOT an applied one.
//
// Real tmp dir via node:fs — never a mocked filesystem (.claude/rules/testing.md).
// Relative `.js` imports under node16 resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPauseCommand,
  nextCommandState,
  type CommandState,
} from '../../src/fleet/command.js';
import { createCommandStore } from '../../src/plane/commands/store.js';
import { commandStatus } from '../../src/plane/http/api.js';

const IS_WIN = process.platform === 'win32';

function makeStoreDir(prefix = 'scf-pause-coop-'): string {
  const base = IS_WIN ? tmpdir() : '/tmp';
  return mkdtempSync(join(base, prefix));
}

describe('pause is cooperative: requested-vs-applied OBSERVABLE (T064, FR-059, AUDIT-20260718-13)', () => {
  it('the state machine advances accepted → delivered → received → applied, each a DISTINCT state', () => {
    // Each step is a real, individually-legal transition — no state is skipped
    // or collapsed. This is the granularity FR-059 rests on.
    const delivered = nextCommandState('accepted', 'deliver');
    expect(delivered).toBe('delivered');

    const received = nextCommandState(delivered, 'receive');
    expect(received).toBe('received');

    const applied = nextCommandState(received, 'apply');
    expect(applied).toBe('applied');

    // The four are genuinely distinct values (an implementation that collapsed
    // them would fail this).
    expect(new Set<CommandState>(['accepted', delivered, received, applied]).size).toBe(4);
  });

  it("a pause's received-but-not-applied state is queryable and distinct from applied (durable command status)", async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);
      const pause = buildPauseCommand('00000000-0000-4000-8000-0000000000aa');
      expect(pause.kind).toBe('pause');

      // Accept the pause durably — the plane records `accepted` before it is
      // returned (FR-056). The command-status API observes that.
      const { commandId } = await store.accept({
        kind: pause.kind,
        installationId: '88888888-8888-4888-8888-888888888888',
        runId: '01912345-0000-7000-8000-0000000000aa',
      });
      expect(commandStatus(store, commandId).command?.state).toBe('accepted');

      // Drive the durable record through the real transitions, asserting the
      // command-status API reflects each DISTINCT observable state.
      store.transition(commandId, nextCommandState('accepted', 'deliver'));
      expect(commandStatus(store, commandId).command?.state).toBe('delivered');

      store.transition(commandId, nextCommandState('delivered', 'receive'));
      const received = commandStatus(store, commandId);
      // The observable waiting state: delivered to the run, RECEIVED, but the
      // run has not yet paused at a task boundary — 'received' ≠ 'applied'.
      expect(received.command?.state).toBe('received');
      expect(received.command?.state).not.toBe('applied');

      store.transition(commandId, nextCommandState('received', 'apply'));
      expect(commandStatus(store, commandId).command?.state).toBe('applied');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a resume supersedes an UN-applied pause, but NOT an applied one', () => {
    // While the pause is still un-applied (accepted, waiting to be delivered),
    // a resume can supersede it — `supersede` is a legal edge out of `accepted`.
    const superseded = nextCommandState('accepted', 'supersede');
    expect(superseded).toBe('superseded');

    // Once the run has actually paused (the pause reached `applied`, terminal),
    // a resume can start execution afresh, but it can NOT supersede the pause
    // command itself — `applied` is terminal, so `supersede` from it throws.
    // This is the line between "requested" and "took effect": an applied pause
    // is done, not retractable via supersession.
    expect(() => nextCommandState('applied', 'supersede')).toThrow();
  });

  it('delivered (in-flight) is distinct from received (reached the run) is distinct from applied', () => {
    // Two distinct steps before applied make pause honest:
    //   delivered — the sidecar sent it to the run
    //   received  — the run acknowledged receipt (still not paused)
    // Neither `deliver` re-applied nor `apply` skipping `received` is legal.
    expect(nextCommandState('accepted', 'deliver')).toBe('delivered');
    expect(nextCommandState('delivered', 'receive')).toBe('received');
    // apply cannot skip received:
    expect(() => nextCommandState('delivered', 'apply')).toThrow();
    // deliver is not a re-entrant edge on received:
    expect(() => nextCommandState('received', 'deliver')).toThrow();
  });
});
