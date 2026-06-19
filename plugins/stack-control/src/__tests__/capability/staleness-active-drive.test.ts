// 028 T093 (US3) — RED: staleness must not prune an ACTIVE drive (FR-025; contract T6).
//
// `STALE_AGE_MS` (12h) prunes a LEAKED marker (a crashed `enter` that never `exit`ed),
// but it must NOT drop an entry that is still inside its bound — an `enter`-bracketed
// drive within the window stays active end-to-end. This pins the `isFresh` boundary
// (no mechanism change unless it fails).

import { describe, expect, it } from 'vitest';
import { activeCapabilities, enterFrontDoor } from '../../capability/marker.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

describe('staleness does not prune an active bracketed drive (028 T093)', () => {
  it('an entry written just now is active', () => {
    const fx = makeCapabilityFixture();
    try {
      const now = Date.now();
      enterFrontDoor(fx.root, 's1', 'backlog', { now });
      expect(activeCapabilities(fx.root, 's1', { now })).toEqual(new Set(['backlog']));
    } finally {
      fx.cleanup();
    }
  });

  it('an entry 11h59m old (within the 12h bound) is still active mid-drive', () => {
    const fx = makeCapabilityFixture();
    try {
      const enteredAt = Date.now();
      enterFrontDoor(fx.root, 's1', 'spec-execution', { now: enteredAt });
      const almostStale = enteredAt + (12 * 60 * 60 * 1000 - 60 * 1000); // 11h59m later
      expect(activeCapabilities(fx.root, 's1', { now: almostStale })).toEqual(new Set(['spec-execution']));
    } finally {
      fx.cleanup();
    }
  });

  it('an entry exactly at the 12h bound is still active (inclusive bound)', () => {
    const fx = makeCapabilityFixture();
    try {
      const enteredAt = Date.now();
      enterFrontDoor(fx.root, 's1', 'backlog', { now: enteredAt });
      const atBound = enteredAt + 12 * 60 * 60 * 1000;
      expect(activeCapabilities(fx.root, 's1', { now: atBound })).toEqual(new Set(['backlog']));
    } finally {
      fx.cleanup();
    }
  });

  it('an entry PAST the bound (leaked) is pruned — the leak self-heals', () => {
    const fx = makeCapabilityFixture();
    try {
      const enteredAt = Date.now();
      enterFrontDoor(fx.root, 's1', 'backlog', { now: enteredAt });
      const pastBound = enteredAt + 12 * 60 * 60 * 1000 + 1;
      expect(activeCapabilities(fx.root, 's1', { now: pastBound })).toEqual(new Set());
    } finally {
      fx.cleanup();
    }
  });
});
