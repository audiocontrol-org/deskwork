// specs/036-fleet-control-plane — T071 [US3] RED test for command endpoints
// (src/plane/http/api.ts): issue, status by commandId, fleet-wide issue.
//
// THE CONTRACT UNDER TEST — contracts/plane-client-api.md C6 (FR-050…FR-062)
// + test obligations 6 and 10:
//
//   "The promise: the operator can always tell what happened to a command
//    they issued. 'Sent' is never reported as 'applied.'"
//   "Fan-out is never atomic (FR-062) — the response reports targets /
//    accepted / unavailable; per-instance state individually observable."
//
// Three assertions, matching the task's REQUIRED SURFACE:
//   (a) issueCommand returns 'accepted' (durable via a real tmp-dir store),
//       never 'applied'.
//   (b) commandStatus by commandId returns the command's lifecycle state,
//       and a not-found id returns a clean not-found result — never a
//       throw that would leak an "unknown command" as a 500.
//   (c) issueFleetCommand returns separate targets/accepted/unavailable,
//       never a single atomic verdict.
//
// Real tmp dir via node:fs + node:os.tmpdir() — never a mocked filesystem
// (.claude/rules/testing.md). Relative `.js` imports under node16
// resolution (no `@/` alias in this plugin). No `any`, no `as`, no
// `@ts-ignore`.
//
// RED-CONFIRMED SHAPE: `issueCommand` / `commandStatus` / `issueFleetCommand`
// are named VALUE imports from `../../src/plane/http/api.js` that do not
// exist yet (T071 is unimplemented) — this file fails to compile/load
// (TS2305 "has no exported member") before any `it()` body runs. That is
// the correct RED for this task.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommandStore } from '../../src/plane/commands/store.js';
import { createCommandDispatch } from '../../src/plane/commands/dispatch.js';
import { commandStatus, issueCommand, issueFleetCommand } from '../../src/plane/http/api.js';

const IS_WIN = process.platform === 'win32';

/** A real, disposable directory on disk for the durable command store. */
function makeStoreDir(prefix = 'scf-cmdapi-'): string {
  const base = IS_WIN ? tmpdir() : '/tmp';
  return mkdtempSync(join(base, prefix));
}

describe('command endpoints (T071, C6, FR-050…FR-062)', () => {
  it('issueCommand durably accepts and reports state "accepted" — NEVER "applied" on issue', async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store);

      const result = await issueCommand(store, dispatch, {
        kind: 'cancel',
        installationId: '11111111-1111-4111-8111-111111111111',
        runId: '01912345-0000-7000-8000-000000000001',
      });

      expect(result.state).toBe('accepted');
      // The honesty guarantee, spelled out as its own assertion: 'sent' is
      // never reported as 'applied' (FR-059).
      expect(result.state).not.toBe('applied');
      expect(typeof result.commandId).toBe('string');
      expect(result.commandId.length).toBeGreaterThan(0);

      // Durable, not merely in-memory: a FRESH store over the same dir
      // recovers the accepted record (mirrors T057's durability contract).
      const reopened = createCommandStore(dir);
      const recovered = reopened.get(result.commandId);
      expect(recovered).toBeDefined();
      expect(recovered?.state).toBe('accepted');
      expect(recovered?.kind).toBe('cancel');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('commandStatus returns the full lifecycle state by commandId, and a clean not-found result for an unknown id (no throw)', async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store);

      const { commandId } = await issueCommand(store, dispatch, {
        kind: 'pause',
        installationId: '22222222-2222-4222-8222-222222222222',
        runId: null,
      });

      const found = commandStatus(store, commandId);
      expect(found.found).toBe(true);
      expect(found.commandId).toBe(commandId);
      expect(found.command?.commandId).toBe(commandId);
      expect(found.command?.kind).toBe('pause');
      expect(found.command?.state).toBe('accepted');

      const unknownId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      // Must not throw — a lookup of an unknown commandId is a clean, typed
      // result, never a thrown "unknown command" that would leak as a 500.
      expect(() => commandStatus(store, unknownId)).not.toThrow();
      const notFound = commandStatus(store, unknownId);
      expect(notFound.found).toBe(false);
      expect(notFound.commandId).toBe(unknownId);
      expect(notFound.command).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('issueFleetCommand reports targets/accepted/unavailable separately — NEVER a single atomic verdict (FR-062)', async () => {
    const dir = makeStoreDir();
    try {
      const store = createCommandStore(dir);
      const dispatch = createCommandDispatch(store);
      const targets = ['inst-a', 'inst-b', 'inst-c'];
      const reachable = new Set(['inst-a', 'inst-c']);

      const result = await issueFleetCommand(
        store,
        dispatch,
        { kind: 'reconcile', installationId: 'fleet', runId: null },
        targets,
        (target) => reachable.has(target),
      );

      expect(typeof result.commandId).toBe('string');
      expect(result.commandId.length).toBeGreaterThan(0);
      expect(result.targets).toEqual(targets);
      expect([...result.accepted].sort()).toEqual(['inst-a', 'inst-c']);
      expect(result.unavailable).toEqual(['inst-b']);

      // Not even total unavailability collapses to a single failure verdict
      // — the structured partition is returned regardless (FR-062).
      const allDown = await issueFleetCommand(
        store,
        dispatch,
        { kind: 'reconcile', installationId: 'fleet', runId: null },
        targets,
        () => false,
      );
      expect(allDown.accepted).toEqual([]);
      expect(allDown.unavailable).toEqual(targets);
      expect(allDown.targets).toEqual(targets);

      // The result shape has exactly these four fields — no collapsed
      // success/failure field a caller could mistake for an atomic verdict.
      expect(Object.keys(result).sort()).toEqual(
        ['accepted', 'commandId', 'targets', 'unavailable'].sort(),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
