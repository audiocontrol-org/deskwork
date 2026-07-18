// specs/036-fleet-control-plane — T058 (RED), pairs with T070 impl
// (src/plane/commands/dispatch.ts) and reuses T069's durable store
// (src/plane/commands/store.ts).
//
// THE CONTRACT UNDER TEST — contracts/sidecar-plane-protocol.md § C7
// (line ~69, FR-050…FR-062, SC-007):
//
//   "The plane holds a command until delivered-and-acknowledged, expired,
//    or superseded, and replays unexpired commands on reconnect — so a
//    `cancel` survives a network blip, which on a WAN is routine rather
//    than exceptional."
//
// `cancel` is named explicitly in the task as "the one destructive
// command; a silent no-op here is the worst failure in the design"
// (T058). This is the second of the two DURABILITY honesty tests for
// Phase 5: a `cancel` that the operator was told was `accepted`, but that
// silently evaporates because the sidecar happened to be mid-reconnect
// when the plane tried to deliver it, is a broken promise no dashboard
// surface can paper over.
//
// EXPECTED SURFACE (src/plane/commands/dispatch.ts, T070 — restated here
// so the impl task matches this test byte-for-byte). The REPLAY SEAM is
// imported from `dispatch.js`, not `store.js`: durability (T069, "was this
// command ever durably accepted") and delivery/replay/expiry/fan-out
// (T070, "who still needs this command delivered right now") are separate
// concerns per the task list ("Implement buffer / replay / expiry /
// fan-out ... in src/plane/commands/dispatch.ts"). `store.js` is still
// imported here too, because a `CommandDispatch` is constructed OVER a
// `CommandStore` — dispatch is the runtime delivery buffer; the store
// underneath it is what makes an accepted command durable in the first
// place (T057's contract). Both are real dependencies of this test, not
// substitutable for each other.
//
//   export interface HeldCommand {
//     readonly commandId: string;
//     readonly kind: CommandKind;
//     readonly installationId: string;
//     readonly runId: string | null;
//     readonly expiresAt: string | null; // ISO-8601, or null = no expiry
//   }
//
//   export interface CommandDispatch {
//     /** Register a durably-accepted command for delivery to a target
//      * installation. Held until delivered+acknowledged, expired, or
//      * superseded. */
//     hold(command: HeldCommand): void;
//     /** The sidecar for `installationId` disconnected (SSE stream died)
//      * before delivery/ack completed for some held command(s). */
//     onDisconnect(installationId: string): void;
//     /** The sidecar for `installationId` (re)connected. Returns the
//      * commands that MUST be (re)delivered on this connection: held,
//      * unexpired, not yet delivered+acknowledged, not superseded. Never
//      * silently drops a still-live hold — that is the FR-050…062 / C7
//      * promise this function exists to keep. */
//     replayOnReconnect(installationId: string): readonly HeldCommand[];
//     /** The sidecar acknowledged a command's delivery/application state
//      * (telemetry, per C7 "acknowledgement travels back as telemetry").
//      * A command acknowledged as a terminal state (`applied`, `failed`,
//      * `rejected`, `expired`, `superseded`) is no longer held — it must
//      * not be replayed on a LATER reconnect. */
//     acknowledge(commandId: string, installationId: string, state: CommandState): void;
//   }
//
//   export function createCommandDispatch(store: CommandStore): CommandDispatch;
//
// This module is PLANE-side, not machine-local identity — the T009
// `_machine-state-harness` redirect does not apply (same reasoning as
// command-durable-accept.test.ts / plane-server.test.ts). A real tmp dir
// backs the durable store underneath dispatch; never a mocked filesystem
// (.claude/rules/testing.md).
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias in this plugin). No `any`, no `as`, no `@ts-ignore`.
//
// RED-CONFIRMED SHAPE: `createCommandDispatch` is a VALUE import from
// `../../src/plane/commands/dispatch.js`, which does not exist yet (T070 is
// unimplemented) — so this file fails at module load with a module-not-found
// error, before any `it()` body runs. `createCommandStore` from
// `../../src/plane/commands/store.js` (T069, also unimplemented) fails the
// same way; either import alone is sufficient for RED, and both are present
// because both are genuinely exercised once the impl lands.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandKind } from '../../src/fleet/command.js';
import { createCommandStore } from '../../src/plane/commands/store.js';
import { createCommandDispatch } from '../../src/plane/commands/dispatch.js';

const IS_WIN = process.platform === 'win32';

function makeStoreDir(prefix = 'scf-cmddispatch-'): string {
  const base = IS_WIN ? tmpdir() : '/tmp';
  return mkdtempSync(join(base, prefix));
}

describe('command dispatch: cancel during a network blip is applied on reconnect (T058, SC-007 / C7)', () => {
  it('an accepted-but-undelivered cancel is REPLAYED (not dropped) when the sidecar reconnects after a blip', async () => {
    const dir = makeStoreDir();
    try {
      const installationId = '33333333-3333-4333-8333-333333333333';
      const runId = '01912345-0000-7000-8000-000000000002';

      const store = createCommandStore(dir);
      const kind: CommandKind = 'cancel';
      const { commandId } = await store.accept({ kind, installationId, runId });

      const dispatch = createCommandDispatch(store);
      dispatch.hold({
        commandId,
        kind,
        installationId,
        runId,
        expiresAt: null,
      });

      // The network blip: the sidecar's SSE stream dies BEFORE the cancel
      // was delivered and acknowledged. No `acknowledge()` call happens —
      // this is exactly the "held, not yet delivered+acked" state C7
      // describes as routine on a WAN.
      dispatch.onDisconnect(installationId);

      // Reconnect: the plane MUST replay the still-held, unexpired cancel.
      // A silent no-op (empty array) here is the worst failure the design
      // names — the operator was told `accepted` and the command evaporates.
      const replayed = dispatch.replayOnReconnect(installationId);
      expect(replayed.length).toBeGreaterThan(0);
      expect(replayed.some((held) => held.commandId === commandId)).toBe(true);
      const replayedCommand = replayed.find((held) => held.commandId === commandId);
      expect(replayedCommand?.kind).toBe<CommandKind>('cancel');
      expect(replayedCommand?.installationId).toBe(installationId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('once delivered-and-acknowledged as applied, the SAME cancel is NOT replayed on a later reconnect', async () => {
    const dir = makeStoreDir();
    try {
      const installationId = '44444444-4444-4444-8444-444444444444';
      const runId = '01912345-0000-7000-8000-000000000003';

      const store = createCommandStore(dir);
      const kind: CommandKind = 'cancel';
      const { commandId } = await store.accept({ kind, installationId, runId });

      const dispatch = createCommandDispatch(store);
      dispatch.hold({
        commandId,
        kind,
        installationId,
        runId,
        expiresAt: null,
      });

      // First blip + reconnect: delivered on this pass, and the sidecar
      // acknowledges application (telemetry travels the ack back, per C7).
      dispatch.onDisconnect(installationId);
      const firstReplay = dispatch.replayOnReconnect(installationId);
      expect(firstReplay.some((held) => held.commandId === commandId)).toBe(true);
      dispatch.acknowledge(commandId, installationId, 'applied');

      // A SECOND blip + reconnect for the same installation must NOT
      // replay the now-applied cancel — an already-terminal command
      // reappearing forever would be its own (quieter) honesty failure,
      // masking whether replay is actually driven by real delivery state.
      dispatch.onDisconnect(installationId);
      const secondReplay = dispatch.replayOnReconnect(installationId);
      expect(secondReplay.some((held) => held.commandId === commandId)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
