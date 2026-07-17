// specs/036-fleet-control-plane — T063 (RED), pairs with T070 impl
// (src/plane/commands/dispatch.ts — "Implement buffer / replay / expiry /
// fan-out").
//
// contracts/plane-client-api.md § C6 (line ~52):
//   "Fan-out is never atomic (FR-062) — the response reports targets /
//    accepted / unavailable; per-instance state individually observable."
// contracts/sidecar-plane-protocol.md § C7 (line ~78) restates the same
// contract verbatim from the sidecar side.
//
// This test pins the SEAM: a fan-out dispatch function that issues one
// command to N targets and reports a PER-TARGET result set — never a single
// atomic success/fail boolean. The exact shape under test:
//
//   dispatchFanOut(params: {
//     commandId: string;
//     kind: CommandKind;
//     targets: string[];
//     isReachable: (target: string) => boolean;
//   }): FanOutResult
//
//   interface FanOutResult {
//     targets: string[];
//     accepted: string[];
//     unavailable: string[];
//   }
//
// `isReachable` stands in for the real registry reachability check (T070
// owns wiring the real registry; this seam takes the predicate as an
// injected dependency so the fan-out PARTITIONING logic is testable without
// a live sidecar fleet — same "inject the boundary" shape as clock.ts's
// Clock and event.ts's Clock-injected envelope construction).
//
// SCOPE: fan-out partitioning only. Does not exercise the durable command
// store (T069), buffering/replay (also T070, other tests), or the HTTP
// endpoint (T071) — those import or sit alongside this module, not the
// reverse.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { dispatchFanOut, type FanOutResult } from '../../src/plane/commands/dispatch.js';
import type { CommandKind } from '../../src/fleet/supersession.js';
import { mintUuidV7 } from '../../src/fleet/types.js';

const KIND: CommandKind = 'pause';

function alwaysReachable(): boolean {
  return true;
}

describe('dispatchFanOut (T063, FR-062: fan-out is never atomic)', () => {
  it('all targets reachable — every target lands in accepted, none in unavailable', () => {
    const targets = ['instance-a', 'instance-b', 'instance-c'];

    const result: FanOutResult = dispatchFanOut({
      commandId: mintUuidV7(),
      kind: KIND,
      targets,
      isReachable: alwaysReachable,
    });

    expect(result.accepted).toEqual(['instance-a', 'instance-b', 'instance-c']);
    expect(result.unavailable).toEqual([]);
  });

  it('a MIX of reachable and unreachable targets is reported as a PARTITION, never a single pass/fail', () => {
    const targets = ['instance-a', 'instance-b', 'instance-c', 'instance-d'];
    const unreachable = new Set(['instance-b', 'instance-d']);

    const result: FanOutResult = dispatchFanOut({
      commandId: mintUuidV7(),
      kind: KIND,
      targets,
      isReachable: (target: string) => !unreachable.has(target),
    });

    // Per-instance state individually observable — NOT collapsed into one
    // atomic outcome. Accepted and unavailable are reported SEPARATELY.
    expect(result.accepted).toEqual(['instance-a', 'instance-c']);
    expect(result.unavailable).toEqual(['instance-b', 'instance-d']);
  });

  it('EVERY target unreachable still returns a partial result — it does NOT throw as an atomic failure', () => {
    const targets = ['instance-a', 'instance-b'];

    const result: FanOutResult = dispatchFanOut({
      commandId: mintUuidV7(),
      kind: KIND,
      targets,
      isReachable: () => false,
    });

    // The whole point of FR-062: even total unavailability is reported as a
    // structured per-target result, never a thrown all-or-nothing error.
    expect(result.accepted).toEqual([]);
    expect(result.unavailable).toEqual(['instance-a', 'instance-b']);
    expect(result.targets).toEqual(['instance-a', 'instance-b']);
  });

  it('targets === accepted ∪ unavailable, with no target missing or duplicated', () => {
    const targets = ['instance-a', 'instance-b', 'instance-c', 'instance-d', 'instance-e'];
    const unreachable = new Set(['instance-c']);

    const result: FanOutResult = dispatchFanOut({
      commandId: mintUuidV7(),
      kind: KIND,
      targets,
      isReachable: (target: string) => !unreachable.has(target),
    });

    const union = [...result.accepted, ...result.unavailable].sort();
    expect(union).toEqual([...targets].sort());
    expect(result.targets).toEqual(targets);
  });

  it('the response shape is a structured per-target result — never a single boolean/string outcome field', () => {
    const targets = ['instance-a'];

    const result: FanOutResult = dispatchFanOut({
      commandId: mintUuidV7(),
      kind: KIND,
      targets,
      isReachable: alwaysReachable,
    });

    // Guards against a regression to `{ success: boolean }` or similar
    // atomic-looking shape — the contract requires targets/accepted/
    // unavailable to each be independently inspectable arrays.
    expect(Array.isArray(result.targets)).toBe(true);
    expect(Array.isArray(result.accepted)).toBe(true);
    expect(Array.isArray(result.unavailable)).toBe(true);
    expect(result).not.toHaveProperty('success');
    expect(result).not.toHaveProperty('ok');
  });
});
