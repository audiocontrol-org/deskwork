// specs/036-fleet-control-plane — regression for AUDIT-20260717-10
// (fleet-wide commands overwrite all but one accepted target).
//
// THE DEFECT: `issueFleetCommand()` accepts one durable command, then calls
// `dispatch.hold()` once per reachable target with the SAME `commandId`. The
// dispatch buffer keyed its `held` map by `commandId` alone, so each target's
// hold OVERWROTE the previous one — only the LAST accepted target remained
// replayable, even though the response reports all targets accepted. That
// silently breaks FR-062 / C7: an operator sees several targets accepted, but
// all-but-one never receive the command on reconnect.
//
// THE CONTRACT (contracts/plane-client-api.md § C6 / sidecar-plane-protocol
// § C7, FR-062): fan-out is never atomic — per-instance delivery state is
// individually observable, and a held, unexpired command is replayed to its
// target on reconnect. With N reachable targets, EACH target must be able to
// replay the command independently on its own reconnect.
//
// Real tmp dir via node:fs — never a mocked filesystem (.claude/rules/testing.md).
// Relative `.js` imports under node16. No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommandStore } from '../../src/plane/commands/store.js';
import { createCommandDispatch } from '../../src/plane/commands/dispatch.js';
import { issueFleetCommand } from '../../src/plane/http/api.js';

const IS_WIN = process.platform === 'win32';

function makeStoreDir(prefix = 'scf-fleet-replay-'): string {
  const base = IS_WIN ? tmpdir() : '/tmp';
  return mkdtempSync(join(base, prefix));
}

describe('fleet-wide command holds every reachable target independently (AUDIT-20260717-10, FR-062/C7)', () => {
  it('issueFleetCommand with two reachable targets → replayOnReconnect returns the command for EACH target', async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store);

      const targetA = 'inst-a';
      const targetC = 'inst-c';
      const targets = [targetA, 'inst-b', targetC];
      const reachable = new Set([targetA, targetC]);

      const result = await issueFleetCommand(
        store,
        dispatch,
        { kind: 'cancel', installationId: 'fleet', runId: null },
        targets,
        (target) => reachable.has(target),
      );

      // The response reports BOTH reachable targets accepted.
      expect([...result.accepted].sort()).toEqual([targetA, targetC]);

      // Each accepted target must independently replay the SAME command on its
      // own reconnect. Before the fix, only the LAST-held target (inst-c)
      // survived in the buffer; inst-a's hold had been overwritten.
      const replayA = dispatch.replayOnReconnect(targetA);
      const replayC = dispatch.replayOnReconnect(targetC);

      expect(replayA.some((h) => h.commandId === result.commandId)).toBe(true);
      expect(replayC.some((h) => h.commandId === result.commandId)).toBe(true);

      // Each replayed hold carries its OWN installationId (not a shared one).
      expect(replayA.find((h) => h.commandId === result.commandId)?.installationId).toBe(targetA);
      expect(replayC.find((h) => h.commandId === result.commandId)?.installationId).toBe(targetC);

      // The unreachable target holds nothing.
      expect(dispatch.replayOnReconnect('inst-b').some((h) => h.commandId === result.commandId)).toBe(
        false,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a terminal ack on ONE fleet target settles only that target — the other still replays (AUDIT-20260718-18/-20/-22, FR-062)', async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store);

      const targetA = 'inst-a';
      const targetB = 'inst-b';

      const result = await issueFleetCommand(
        store,
        dispatch,
        { kind: 'cancel', installationId: 'fleet', runId: null },
        [targetA, targetB],
        () => true,
      );

      // Both targets hold the fan-out command before any ack.
      expect(dispatch.replayOnReconnect(targetA).some((h) => h.commandId === result.commandId)).toBe(
        true,
      );
      expect(dispatch.replayOnReconnect(targetB).some((h) => h.commandId === result.commandId)).toBe(
        true,
      );

      // Target A acknowledges terminally. Fan-out is NEVER atomic (FR-062): A's
      // ack settles ONLY A's hold. B — still offline, having never received the
      // cancel — MUST still replay it on its own reconnect. Before the
      // target-scoped ack (AUDIT-20260718-18/-22) A's ack silently cleared B's
      // hold too, so B would never receive the cancel (the worst failure the
      // design names for a `cancel`).
      dispatch.acknowledge(result.commandId, targetA, 'applied');

      expect(dispatch.replayOnReconnect(targetA).some((h) => h.commandId === result.commandId)).toBe(
        false,
      );
      expect(dispatch.replayOnReconnect(targetB).some((h) => h.commandId === result.commandId)).toBe(
        true,
      );
      // B's still-live hold carries B's OWN installationId — independent state.
      expect(
        dispatch.replayOnReconnect(targetB).find((h) => h.commandId === result.commandId)
          ?.installationId,
      ).toBe(targetB);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
