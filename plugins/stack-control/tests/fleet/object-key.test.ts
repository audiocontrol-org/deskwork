/**
 * specs/036-fleet-control-plane — T089 (RED), pairs with T097 impl
 * (`src/plane/archive/writer.ts`).
 *
 * data-model.md § Storage layout (line ~134-152) — "Amended from FR-063 per
 * R-01 — two independent defects in the specified key":
 *
 *   1. `eventId` in the filename **forecloses sequence probing** (the plane
 *      cannot build the URL without already knowing the id it is
 *      discovering).
 *   2. Unpadded sequence **does not sort** — `10-` precedes `2-`
 *      lexicographically.
 *
 * Fix (research.md R-01): the object key becomes
 * `{invocationSequence zero-padded fixed-width}.json`, with `eventId`
 * carried INSIDE the object rather than in the key.
 *
 * This test pins BOTH defects fixed, independently:
 *
 *   (a) sequence probing is constructible — the key-construction function
 *       takes only installationId + runId + invocationSequence (NOT
 *       eventId); two different eventIds at the same sequence produce the
 *       IDENTICAL key, proving eventId plays no role in the key at all.
 *   (b) keys sort lexicographically — `...0000000002.json` sorts BEFORE
 *       `...0000000010.json` (plain string `<` comparison), matching
 *       numeric order across a digit-count boundary that would break an
 *       unpadded scheme (`10` vs `2` would sort the other way).
 *
 * Key-shape precedent (prefix `runs/{installationId}/{runId}/events/`,
 * 10-digit zero-padded sequence, `.json` suffix) is already established by
 * the T008 port test (`tests/fleet/storage-port.test.ts`), which exercises
 * this exact shape against the vendor-free `ObjectStorePort`. This test
 * pins the same shape at its actual SOURCE — the key-construction function
 * `src/plane/archive/writer.ts` is expected to own (T097) — rather than a
 * literal re-typed by every caller.
 *
 * RED: `src/plane/archive/writer.ts` does not exist yet — the VALUE import
 * below fails at module-load (module-not-found), the correct failing-first
 * signal, never a typo.
 *
 * Relative `.js` imports (node16 module resolution, no `@/` alias). No
 * `any`, no `as`, no `@ts-ignore`.
 */

import { describe, expect, it } from 'vitest';
import { eventObjectKey } from '../../src/plane/archive/writer.js';

describe('event object key (T089, data-model § Storage layout, research § R-01)', () => {
  it('(a) the key is constructible from installationId + runId + invocationSequence ALONE — no eventId required (sequence probing restored)', () => {
    // The function signature itself is the proof: it accepts no eventId
    // field. Two events with DIFFERENT eventIds landing at the SAME
    // sequence must resolve to the SAME key — eventId plays no role.
    const key = eventObjectKey({
      installationId: 'installation-1',
      runId: 'run-1',
      invocationSequence: 7,
    });

    expect(key).toBe('runs/installation-1/run-1/events/0000000007.json');

    // The plane can build this URL by counting alone, 0, 1, 2, … — never
    // needing to already know an id it is trying to discover.
    const probed = [0, 1, 2, 3].map((invocationSequence) =>
      eventObjectKey({ installationId: 'installation-1', runId: 'run-1', invocationSequence }),
    );
    expect(probed).toEqual([
      'runs/installation-1/run-1/events/0000000000.json',
      'runs/installation-1/run-1/events/0000000001.json',
      'runs/installation-1/run-1/events/0000000002.json',
      'runs/installation-1/run-1/events/0000000003.json',
    ]);
  });

  it('(b) keys sort lexicographically in numeric order — sequence 2 sorts BEFORE sequence 10 (the defect an unpadded key would exhibit)', () => {
    const keyTwo = eventObjectKey({ installationId: 'installation-1', runId: 'run-1', invocationSequence: 2 });
    const keyTen = eventObjectKey({ installationId: 'installation-1', runId: 'run-1', invocationSequence: 10 });

    // Plain string comparison — no numeric parsing — is exactly what a
    // bucket LIST response / directory sort applies. An unpadded key would
    // have `10-...` precede `2-...` here (R-01 defect 2); zero-padding
    // fixes it.
    expect(keyTwo < keyTen).toBe(true);
    expect([keyTen, keyTwo].sort()).toEqual([keyTwo, keyTen]);

    // Cross a second digit-count boundary (99 -> 100) to prove this isn't
    // a lucky one-off at the 2-vs-10 boundary.
    const keyNinetyNine = eventObjectKey({
      installationId: 'installation-1',
      runId: 'run-1',
      invocationSequence: 99,
    });
    const keyOneHundred = eventObjectKey({
      installationId: 'installation-1',
      runId: 'run-1',
      invocationSequence: 100,
    });
    expect(keyNinetyNine < keyOneHundred).toBe(true);
  });

  it('different runs / installations never collide on the same padded sequence', () => {
    const keyA = eventObjectKey({ installationId: 'installation-1', runId: 'run-1', invocationSequence: 1 });
    const keyB = eventObjectKey({ installationId: 'installation-2', runId: 'run-1', invocationSequence: 1 });
    const keyC = eventObjectKey({ installationId: 'installation-1', runId: 'run-2', invocationSequence: 1 });

    expect(new Set([keyA, keyB, keyC]).size).toBe(3);
  });
});
