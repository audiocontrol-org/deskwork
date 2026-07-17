// specs/036-fleet-control-plane — T066 (RED), pairs with T073 impl
// (src/plane/commands/dispatch.ts — "Implement `config-push` application
// with compare-and-set").
//
// data-model.md § Supersession table (line ~111):
//   "config-push | a newer revision supersedes an older un-applied one;
//    compare-and-set prevents lost updates (FR-060)"
// spec.md FR-060 (config-push): schema-versioned payload, validated against
// an allowed-key set, applied via compare-and-set against the currently
// persisted revision so a stale push cannot silently clobber a newer one.
//
// This test pins the APPLY seam (T073's target):
//
//   interface ConfigPushPayload {
//     schemaVersion: number;
//     revision: number;
//     config: Record<string, unknown>;
//   }
//
//   interface ConfigPushState {
//     revision: number;
//     config: Record<string, unknown>;
//   }
//
//   type ConfigPushApplyResult =
//     | { outcome: 'applied'; state: ConfigPushState }
//     | { outcome: 'rejected'; reason: string }
//     | { outcome: 'superseded'; currentRevision: number };
//
//   applyConfigPush(
//     payload: ConfigPushPayload,
//     current: ConfigPushState | undefined,
//     allowedKeys: readonly string[],
//   ): ConfigPushApplyResult
//
// `current` is the persisted state the caller (T069's durable store) hands
// in — the compare-and-set check is `payload.revision > (current?.revision
// ?? -1)`; anything else is 'superseded'. `allowedKeys` is the injected
// schema allow-list (same "inject the boundary" shape as fanout.test.ts's
// `isReachable` predicate), so the ALLOWED-KEY-SET rule is testable without
// depending on where the schema itself is sourced from.
//
// Five things this test covers, per T066's brief:
//   1. schema version present (missing/wrong-typed schemaVersion ⇒ rejected)
//   2. validation of the payload (malformed config ⇒ rejected)
//   3. an ALLOWED-KEY set (unknown keys rejected)
//   4. apply-timing / persistence (a valid, newer push is 'applied' and the
//      returned state IS the payload's config+revision — that returned
//      state is what the caller persists)
//   5. compare-and-set prevents lost updates (a stale-revision push is
//      'superseded', not silently applied over a newer one)
//
// SCOPE: the apply/compare-and-set decision function only. Does not
// exercise the durable store's actual disk persistence (T069) or the HTTP
// endpoint (T071) — those call this function, not the reverse.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import {
  applyConfigPush,
  type ConfigPushPayload,
  type ConfigPushState,
  type ConfigPushApplyResult,
} from '../../src/plane/commands/dispatch.js';

const ALLOWED_KEYS = ['pollIntervalMs', 'logLevel', 'maxConcurrency'] as const;

function payload(overrides: Partial<ConfigPushPayload> = {}): ConfigPushPayload {
  return {
    schemaVersion: 1,
    revision: 1,
    config: { logLevel: 'info' },
    ...overrides,
  };
}

describe('applyConfigPush (T066, FR-060)', () => {
  it('applies a valid first push (no prior state) and returns the persisted state', () => {
    const push = payload({ revision: 1, config: { logLevel: 'debug' } });

    const result: ConfigPushApplyResult = applyConfigPush(push, undefined, ALLOWED_KEYS);

    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      expect(result.state.revision).toBe(1);
      expect(result.state.config).toEqual({ logLevel: 'debug' });
    }
  });

  it('rejects a payload missing a schema version', () => {
    // Deliberately NOT typed as ConfigPushPayload — this literal omits
    // `schemaVersion` on purpose, to prove the apply function itself
    // validates presence rather than relying on the type system to have
    // already excluded the malformed shape.
    const pushWithoutVersion = {
      revision: 1,
      config: { logLevel: 'info' },
    };

    const result = applyConfigPush(pushWithoutVersion, undefined, ALLOWED_KEYS);

    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason.toLowerCase()).toContain('schema');
    }
  });

  it('rejects a payload whose schema version is not a positive integer', () => {
    const push = payload({ schemaVersion: -1 });

    const result = applyConfigPush(push, undefined, ALLOWED_KEYS);

    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason.toLowerCase()).toContain('schema');
    }
  });

  it('rejects a payload carrying a key outside the allowed-key set', () => {
    const push = payload({
      config: { logLevel: 'info', notAllowedKey: 'sneaky' },
    });

    const result = applyConfigPush(push, undefined, ALLOWED_KEYS);

    expect(result.outcome).toBe('rejected');
    if (result.outcome === 'rejected') {
      expect(result.reason.toLowerCase()).toContain('notallowedkey');
    }
  });

  it('accepts a payload whose keys are a strict subset of the allowed-key set', () => {
    const push = payload({
      config: { pollIntervalMs: 5000, maxConcurrency: 4 },
    });

    const result = applyConfigPush(push, undefined, ALLOWED_KEYS);

    expect(result.outcome).toBe('applied');
  });

  it('compare-and-set: a NEWER revision supersedes the currently persisted one and applies', () => {
    const current: ConfigPushState = { revision: 3, config: { logLevel: 'info' } };
    const push = payload({ revision: 4, config: { logLevel: 'warn' } });

    const result = applyConfigPush(push, current, ALLOWED_KEYS);

    expect(result.outcome).toBe('applied');
    if (result.outcome === 'applied') {
      expect(result.state.revision).toBe(4);
      expect(result.state.config).toEqual({ logLevel: 'warn' });
    }
  });

  it('compare-and-set: a STALE revision is superseded, NEVER silently applied over a newer one (prevents lost updates)', () => {
    const current: ConfigPushState = { revision: 5, config: { logLevel: 'warn' } };
    const stalePush = payload({ revision: 2, config: { logLevel: 'debug' } });

    const result = applyConfigPush(stalePush, current, ALLOWED_KEYS);

    expect(result.outcome).toBe('superseded');
    if (result.outcome === 'superseded') {
      expect(result.currentRevision).toBe(5);
    }
  });

  it('compare-and-set: an EQUAL revision (racing push) is also superseded, not re-applied', () => {
    const current: ConfigPushState = { revision: 7, config: { logLevel: 'info' } };
    const samePush = payload({ revision: 7, config: { logLevel: 'debug' } });

    const result = applyConfigPush(samePush, current, ALLOWED_KEYS);

    expect(result.outcome).toBe('superseded');
    if (result.outcome === 'superseded') {
      expect(result.currentRevision).toBe(7);
    }
  });

  it('a superseded push does not mutate the currently persisted state', () => {
    const current: ConfigPushState = { revision: 5, config: { logLevel: 'warn' } };
    const staleConfig = { logLevel: 'debug' };
    const stalePush = payload({ revision: 1, config: staleConfig });

    applyConfigPush(stalePush, current, ALLOWED_KEYS);

    // `current` is a plain object the caller owns; the apply function must
    // not have reached in and mutated it in place on the rejected path.
    expect(current.revision).toBe(5);
    expect(current.config).toEqual({ logLevel: 'warn' });
  });
});
