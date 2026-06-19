// 028 T083 (US3) — RED: marker recovery primitives `listMarker` + `clearMarker`
// (FR-021/022/023; data-model §3; contract T3).
//
// `listMarker` is a TOLERANT read: each active entry carries a `fresh` flag, and an
// unparseable file is reported as `corrupt: true` (NOT thrown — the recovery surface
// must inspect a corrupt file without crashing). `clearMarker` deletes the marker file
// BY PATH WITHOUT parsing — so a corrupt file the strict read path rejects is still
// recoverable in one command. Both honor `assertSafeSession` (path-traversal guard).

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clearMarker, enterFrontDoor, listMarker } from '../../capability/marker.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

describe('listMarker (028 T083 — tolerant read)', () => {
  it('reports no marker when absent (not corrupt, no entries)', () => {
    const fx = makeCapabilityFixture();
    try {
      const r = listMarker(fx.root, 's1');
      expect(r.corrupt).toBe(false);
      expect(r.entries).toEqual([]);
    } finally {
      fx.cleanup();
    }
  });

  it('lists each active entry with a fresh flag', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's1', 'backlog');
      const r = listMarker(fx.root, 's1');
      expect(r.corrupt).toBe(false);
      expect(r.entries).toHaveLength(1);
      expect(r.entries[0]!.capability).toBe('backlog');
      expect(r.entries[0]!.fresh).toBe(true);
      expect(typeof r.entries[0]!.token).toBe('string');
      expect(typeof r.entries[0]!.writtenAt).toBe('string');
    } finally {
      fx.cleanup();
    }
  });

  it('flags a stale entry as fresh:false (does not drop it from the listing)', () => {
    const fx = makeCapabilityFixture();
    try {
      const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      fx.write(
        '.stack-control/state/front-door/s1.json',
        JSON.stringify({ sessionId: 's1', active: [{ capability: 'backlog', token: 'old', writtenAt: stale }] }),
      );
      const r = listMarker(fx.root, 's1');
      expect(r.corrupt).toBe(false);
      expect(r.entries).toHaveLength(1);
      expect(r.entries[0]!.fresh).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('reports corrupt:true for an unparseable file — does NOT throw (FR-021)', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('.stack-control/state/front-door/s1.json', 'this is not json {{{');
      let r: ReturnType<typeof listMarker>;
      expect(() => {
        r = listMarker(fx.root, 's1');
      }).not.toThrow();
      expect(r!.corrupt).toBe(true);
      expect(r!.entries).toEqual([]);
    } finally {
      fx.cleanup();
    }
  });

  it('rejects a non-filename-safe session id', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(() => listMarker(fx.root, '../evil')).toThrow(/filename-safe/);
    } finally {
      fx.cleanup();
    }
  });
});

describe('clearMarker (028 T083 — delete by path, no parse)', () => {
  it('deletes a valid marker file (exit-style no-op success on a missing file)', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's1', 'backlog');
      expect(existsSync(fx.sessionMarkerPath('s1'))).toBe(true);
      const cleared = clearMarker(fx.root, 's1');
      expect(cleared).toBe(true);
      expect(existsSync(fx.sessionMarkerPath('s1'))).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('recovers a CORRUPT marker (the strict read path rejects it; clear deletes by path)', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('.stack-control/state/front-door/s1.json', 'corrupt {{{');
      expect(() => clearMarker(fx.root, 's1')).not.toThrow();
      expect(existsSync(fx.sessionMarkerPath('s1'))).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('is a no-op success when no marker file exists', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(clearMarker(fx.root, 's1')).toBe(false); // nothing to clear
    } finally {
      fx.cleanup();
    }
  });

  it('rejects a non-filename-safe session id (before touching the filesystem)', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(() => clearMarker(fx.root, '../../etc/x')).toThrow(/filename-safe/);
    } finally {
      fx.cleanup();
    }
  });
});
