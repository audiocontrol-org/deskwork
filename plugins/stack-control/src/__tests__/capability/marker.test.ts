// 026 T007 — RED tests for the front-door marker (data-model § FrontDoorMarker, D1).
// The marker is a session-keyed file under <installation>/.stack-control/state/
// front-door/<session>.json holding a STACK of active entries, so nested/concurrent
// front-door drives isolate (one exit cannot clear another — FR-014a), stale entries
// are pruned (a crashed `enter` can't leak a permanent marker), and one session's
// marker never grants another's (session-keying, FR-014).

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeCapabilities, enterFrontDoor, exitFrontDoor } from '../../capability/marker.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

describe('front-door marker (026 T007)', () => {
  it('enter makes the capability active; exit clears it', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set());
      const token = enterFrontDoor(fx.root, 's1', 'backlog');
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set(['backlog']));
      exitFrontDoor(fx.root, 's1', token);
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set());
    } finally {
      fx.cleanup();
    }
  });

  it('writes an atomic marker at the session-keyed path', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 'sess-A', 'spec-execution');
      const p = fx.sessionMarkerPath('sess-A');
      expect(existsSync(p)).toBe(true);
      const marker = JSON.parse(readFileSync(p, 'utf8'));
      expect(marker.sessionId).toBe('sess-A');
      expect(marker.active[0].capability).toBe('spec-execution');
      expect(typeof marker.active[0].token).toBe('string');
      expect(typeof marker.active[0].writtenAt).toBe('string');
    } finally {
      fx.cleanup();
    }
  });

  it('is session-keyed: one session’s marker does not grant another’s', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's1', 'backlog');
      expect(activeCapabilities(fx.root, 's2')).toEqual(new Set());
    } finally {
      fx.cleanup();
    }
  });

  it('nested entries isolate: one exit cannot clear another (FR-014a)', () => {
    const fx = makeCapabilityFixture();
    try {
      const t1 = enterFrontDoor(fx.root, 's1', 'backlog');
      const t2 = enterFrontDoor(fx.root, 's1', 'backlog');
      expect(t1).not.toBe(t2);
      exitFrontDoor(fx.root, 's1', t1);
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set(['backlog'])); // t2 still active
      exitFrontDoor(fx.root, 's1', t2);
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set());
    } finally {
      fx.cleanup();
    }
  });

  it('tracks distinct capabilities independently', () => {
    const fx = makeCapabilityFixture();
    try {
      const t1 = enterFrontDoor(fx.root, 's1', 'backlog');
      enterFrontDoor(fx.root, 's1', 'spec-execution');
      exitFrontDoor(fx.root, 's1', t1);
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set(['spec-execution']));
    } finally {
      fx.cleanup();
    }
  });

  it('exit is a safe no-op after a crash (missing file / unknown token)', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(() => exitFrontDoor(fx.root, 's1', 'no-such-token')).not.toThrow();
      enterFrontDoor(fx.root, 's1', 'backlog');
      expect(() => exitFrontDoor(fx.root, 's1', 'unknown')).not.toThrow();
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set(['backlog'])); // unknown didn't clear it
    } finally {
      fx.cleanup();
    }
  });

  it('releases the per-session lock after enter and exit (no leftover .lock)', () => {
    const fx = makeCapabilityFixture();
    try {
      const token = enterFrontDoor(fx.root, 's1', 'backlog');
      expect(existsSync(`${fx.sessionMarkerPath('s1')}.lock`)).toBe(false);
      exitFrontDoor(fx.root, 's1', token);
      expect(existsSync(`${fx.sessionMarkerPath('s1')}.lock`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('rejects a non-filename-safe session id at the marker boundary (codex-01 path traversal)', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(() => enterFrontDoor(fx.root, '../evil', 'backlog')).toThrow(/filename-safe/);
      expect(() => activeCapabilities(fx.root, 'a/b')).toThrow(/filename-safe/);
      expect(() => exitFrontDoor(fx.root, '../../etc/x', 'tok')).toThrow(/filename-safe/);
    } finally {
      fx.cleanup();
    }
  });

  it('prunes stale entries older than the staleness bound', () => {
    const fx = makeCapabilityFixture();
    try {
      const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
      fx.write(
        '.stack-control/state/front-door/s1.json',
        JSON.stringify({
          sessionId: 's1',
          active: [{ capability: 'backlog', token: 'old', writtenAt: stale }],
        }),
      );
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set()); // stale entry ignored
    } finally {
      fx.cleanup();
    }
  });
});
