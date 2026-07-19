// specs/036-fleet-control-plane — T057 (RED), pairs with T069 impl
// (src/plane/commands/store.ts).
//
// THE CONTRACT UNDER TEST — data-model.md § Command (line ~98, FR-056):
//
//   "`accepted` is durable before it is returned — the plane records the
//   command durably *before* answering `accepted`, and the durable record
//   is authoritative across plane restart. Without this, a `cancel`
//   accepted a second before a restart vanishes silently, which is exactly
//   the case the operator promise exists for."
//
// This is one of the two DURABILITY honesty tests for Phase 5 (US3
// commands) — the plane's whole "the operator can always tell what
// happened to a command they issued" promise (plane-client-api.md C6)
// collapses if `accepted` is a lie that a restart can erase.
//
// Two things are asserted, not one:
//   1. RECOVERY — a `cancel` accepted into a store rooted at a real tmp dir
//      is recovered, with its accepted-or-later state, by a FRESH store
//      instance constructed over the SAME dir (simulating plane restart:
//      the in-memory `CommandStore` object is gone; only the directory
//      survives).
//   2. ORDERING — the durable record exists on disk by the time `accept()`
//      resolves, not merely "eventually" after some later flush. A store
//      that answers `accepted` and writes asynchronously afterward would
//      pass a recovery-only test (if nothing crashes between the two) while
//      still violating FR-056 the instant a restart lands in that window.
//
// EXPECTED SURFACE (src/plane/commands/store.ts, T069 — restated here so
// the impl task matches this test byte-for-byte; see also T058's
// companion note in command-blip.test.ts):
//
//   export interface AcceptCommandInput {
//     readonly kind: CommandKind;
//     readonly installationId: string;
//     readonly runId: string | null;
//     readonly payload?: Readonly<Record<string, unknown>>;
//   }
//
//   export interface CommandRecord extends AcceptCommandInput {
//     readonly commandId: string;
//     readonly state: CommandState;
//     readonly acceptedAt: string; // ISO-8601
//   }
//
//   export interface CommandStore {
//     accept(input: AcceptCommandInput): Promise<{
//       readonly commandId: string;
//       readonly state: 'accepted';
//     }>;
//     get(commandId: string): CommandRecord | undefined;
//     list(): readonly CommandRecord[];
//   }
//
//   export function createCommandStore(dir: string): CommandStore;
//
// This module is PLANE-side durable storage, not machine-local identity —
// it has no relationship to installationId/token/high-water-mark minting,
// so the T009 `_machine-state-harness` redirect does not apply here (same
// reasoning `plane-server.test.ts` documents for the router test). A real
// tmp dir via `node:fs` + `node:os.tmpdir()` is the whole fixture; never a
// mocked filesystem (.claude/rules/testing.md).
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias in this plugin). No `any`, no `as`, no `@ts-ignore`.
//
// RED-CONFIRMED SHAPE: `createCommandStore` is a VALUE import from
// `../../src/plane/commands/store.js`, which does not exist yet (T069 is
// unimplemented) — so this file fails at module load with a module-not-found
// error, before any `it()` body runs. That is the correct RED for this task.

import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandKind, CommandState } from '../../src/fleet/command.js';
import { createCommandStore } from '../../src/plane/commands/store.js';

const IS_WIN = process.platform === 'win32';

/** A real, disposable directory on disk for the durable command store. */
function makeStoreDir(prefix = 'scf-cmdstore-'): string {
  const base = IS_WIN ? tmpdir() : '/tmp';
  return mkdtempSync(join(base, prefix));
}

describe('durable command store: accepted survives a simulated plane restart (T057, FR-056)', () => {
  it('a cancel accepted a moment before restart is recovered by a FRESH store over the SAME dir', async () => {
    const dir = makeStoreDir();
    try {
      const installationId = '11111111-1111-4111-8111-111111111111';
      const runId = '01912345-0000-7000-8000-000000000001';

      // "Before restart": one store instance accepts the command.
      const before = createCommandStore(dir);
      const kind: CommandKind = 'cancel';
      const { commandId, state } = await before.accept({
        kind,
        installationId,
        runId,
      });
      expect(state).toBe('accepted');
      expect(typeof commandId).toBe('string');
      expect(commandId.length).toBeGreaterThan(0);

      // Ground truth: it is actually recoverable from the SAME store
      // instance before we even simulate a restart.
      const recordBeforeRestart = before.get(commandId);
      expect(recordBeforeRestart).toBeDefined();
      expect(recordBeforeRestart?.state).toBe('accepted');

      // "Restart": the in-memory `before` object is deliberately discarded
      // (never reused below) and a BRAND NEW store is constructed over the
      // identical directory — the only thing a real plane restart leaves
      // behind is what made it to disk.
      const after = createCommandStore(dir);

      const recovered = after.get(commandId);
      expect(recovered).toBeDefined();
      expect(recovered?.commandId).toBe(commandId);
      expect(recovered?.kind).toBe<CommandKind>('cancel');
      expect(recovered?.installationId).toBe(installationId);
      expect(recovered?.runId).toBe(runId);
      // "with its accepted-or-later state" — the durable record must not
      // have silently regressed to some absent/undefined state, and must
      // not have been demoted below `accepted` by the mere act of a
      // restart (a fresh store re-reading a durable record is not itself a
      // state transition).
      const nonVanishedStates: readonly CommandState[] = [
        'accepted',
        'delivered',
        'received',
        'applied',
      ];
      expect(nonVanishedStates).toContain(recovered?.state);

      // list() on the reopened store must also surface it — a `get`-only
      // recovery that silently drops the record from `list()` is still a
      // partial vanish.
      const listed = after.list();
      expect(listed.some((record) => record.commandId === commandId)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the durable record exists on disk by the time accept() resolves — not merely "eventually" (FR-056 ordering)', async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);

      // Before accept(): the store dir is empty (nothing written yet).
      expect(readdirSync(dir).length).toBe(0);

      const { commandId } = await store.accept({
        kind: 'cancel',
        installationId: '22222222-2222-4222-8222-222222222222',
        runId: null,
      });

      // The instant accept() resolves — no setTimeout, no next-tick wait,
      // no flush call — the durable record must already be present on
      // disk. A store that answers `accepted` synchronously but persists
      // asynchronously afterward would fail exactly here: this assertion
      // runs in the same microtask turn the awaited promise resolved in.
      const entriesRightAfterResolve = readdirSync(dir, { recursive: true });
      expect(entriesRightAfterResolve.length).toBeGreaterThan(0);

      // The on-disk artifact must be discoverable by identity, not merely
      // "some file appeared" — the commandId itself must be locatable
      // in the directory tree (as a filename, a path segment, or inside a
      // file's contents), so this isn't satisfied by an unrelated stray
      // write. Search filenames first (the common case); this is
      // deliberately layout-agnostic since T069 owns the exact naming.
      const nameMatch = entriesRightAfterResolve.some((entry) =>
        typeof entry === 'string' && entry.includes(commandId),
      );
      if (!nameMatch) {
        // Fall back to "at least the dir/some file physically exists and
        // is non-empty" as a minimal durability signal if naming doesn't
        // embed the id — but require re-opening a store to prove identity
        // is actually recoverable, not just that bytes landed somewhere.
        const reopened = createCommandStore(dir);
        expect(reopened.get(commandId)).toBeDefined();
      }
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
