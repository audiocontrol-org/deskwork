// specs/036-fleet-control-plane — regression for AUDIT-20260717-09
// (command expiry never plumbed through the HTTP command-issue API — held
// commands can never expire, only grow unbounded).
//
// THE DEFECT: `dispatch.ts`'s `isExpired`/`replayOnReconnect` honor a real
// `expiresAt`, but `issueCommand`/`issueFleetCommand` (api.ts) hardcoded
// `expiresAt: null`, and neither `AcceptCommandInput` nor `CommandRecord`
// (store.ts) carried an `expiresAt` field for a caller to supply one. So every
// command issued through the plane's operator-facing surface "never expires"
// and sits in the in-memory `held` map forever — unbounded growth, and the
// C7 promise ("held until delivered-and-acknowledged, EXPIRED, or superseded")
// is unkeepable.
//
// THE CONTRACT (contracts/sidecar-plane-protocol.md § C7, FR-055): expiry is a
// visible terminal state — a held, never-acknowledged command that passes its
// `expiresAt` is no longer replayed on reconnect. This test issues a command
// with a short TTL, advances an INJECTED clock past it, and asserts the
// command is no longer replayable (it has expired), while a control command
// with no TTL is still replayable at the same instant.
//
// Real tmp dir via node:fs — never a mocked filesystem (.claude/rules/testing.md).
// Relative `.js` imports under node16. No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommandStore } from '../../src/plane/commands/store.js';
import { createCommandDispatch } from '../../src/plane/commands/dispatch.js';
import { issueCommand } from '../../src/plane/http/api.js';

const IS_WIN = process.platform === 'win32';

function makeStoreDir(prefix = 'scf-cmd-expiry-'): string {
  const base = IS_WIN ? tmpdir() : '/tmp';
  return mkdtempSync(join(base, prefix));
}

describe('command expiry is plumbed end-to-end (AUDIT-20260717-09, FR-055/C7)', () => {
  it('a command issued with a short TTL is no longer replayable after the clock advances past it', async () => {
    const dir = makeStoreDir();
    try {
      // Injected clock, controllable per-test — starts at a fixed instant.
      const base = Date.parse('2026-07-17T00:00:00.000Z');
      let clockMs = base;
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store, { now: () => clockMs });

      const installationId = '55555555-5555-4555-8555-555555555555';
      // TTL: expires 1000ms after the base instant.
      const expiresAt = new Date(base + 1000).toISOString();

      const { commandId } = await issueCommand(store, dispatch, {
        kind: 'cancel',
        installationId,
        runId: null,
        expiresAt,
      });

      // Before expiry (clock at base): the held command IS replayable.
      const beforeExpiry = dispatch.replayOnReconnect(installationId);
      expect(beforeExpiry.some((h) => h.commandId === commandId)).toBe(true);
      // The TTL actually reached the held delivery state (not dropped to null).
      expect(beforeExpiry.find((h) => h.commandId === commandId)?.expiresAt).toBe(expiresAt);

      // Before expiry the durable status is still `accepted`.
      expect(store.get(commandId)?.state).toBe('accepted');

      // Advance the clock past the TTL.
      clockMs = base + 2000;

      // After expiry: the command is a VISIBLE terminal 'expired' — no longer
      // replayed on reconnect. This keeps held state bounded.
      const afterExpiry = dispatch.replayOnReconnect(installationId);
      expect(afterExpiry.some((h) => h.commandId === commandId)).toBe(false);

      // AUDIT-20260718-23: "not replayed" is not enough — the durable/queryable
      // status must ANNOUNCE the expiry, not silently stay `accepted`. This
      // command was accepted with a TTL and never delivered; on expiry its
      // durable record transitions to `expired` so `commandStatus` /
      // `GET /v1/commands/:id` report the terminal state honestly.
      expect(store.get(commandId)?.state).toBe('expired');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the durable record carries the expiresAt across a store reopen (recoverable, not just in-memory)', async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store);
      const expiresAt = '2026-07-17T00:00:05.000Z';

      const { commandId } = await issueCommand(store, dispatch, {
        kind: 'pause',
        installationId: '66666666-6666-4666-8666-666666666666',
        runId: null,
        expiresAt,
      });

      // A fresh store over the same dir recovers the persisted expiresAt.
      const reopened = createCommandStore(dir);
      expect(reopened.get(commandId)?.expiresAt).toBe(expiresAt);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a command issued with no TTL never expires (control — still replayable at any clock)', async () => {
    const dir = makeStoreDir();
    try {
      let clockMs = Date.parse('2030-01-01T00:00:00.000Z');
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store, { now: () => clockMs });
      const installationId = '77777777-7777-4777-8777-777777777777';

      const { commandId } = await issueCommand(store, dispatch, {
        kind: 'cancel',
        installationId,
        runId: null,
        // no expiresAt → never expires
      });

      clockMs = Date.parse('2099-01-01T00:00:00.000Z');
      const replay = dispatch.replayOnReconnect(installationId);
      expect(replay.some((h) => h.commandId === commandId)).toBe(true);
      expect(replay.find((h) => h.commandId === commandId)?.expiresAt).toBe(null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
