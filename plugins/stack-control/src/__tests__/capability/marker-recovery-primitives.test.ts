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

  // TOCTOU (claude-05): a concurrent clearMarker (which holds the lock) can delete the
  // file between listMarker's existsSync check and its read. An ENOENT from that race is
  // "the marker is gone" (no marker), NOT "the marker is corrupt". A real filesystem cannot
  // reproduce the race deterministically, so the read is driven through the `readFile`
  // injectable seam (the same pattern as `now`) — the file tree itself stays a real fixture.
  describe('TOCTOU — concurrent delete after existsSync', () => {
    it('classifies an ENOENT read as "no marker" (corrupt:false), not corrupt:true', () => {
      const fx = makeCapabilityFixture();
      try {
        enterFrontDoor(fx.root, 's1', 'backlog'); // a real, valid marker exists at check-time
        const enoent: NodeJS.ErrnoException = new Error('ENOENT: no such file');
        enoent.code = 'ENOENT';
        const r = listMarker(fx.root, 's1', {
          readFile: () => {
            throw enoent; // the concurrent delete landed between existsSync and the read
          },
        });
        expect(r.corrupt).toBe(false);
        expect(r.entries).toEqual([]);
      } finally {
        fx.cleanup();
      }
    });

    it('STILL reports corrupt:true for a non-ENOENT read failure (genuine corruption)', () => {
      const fx = makeCapabilityFixture();
      try {
        fx.write('.stack-control/state/front-door/s1.json', 'not json {{{');
        const r = listMarker(fx.root, 's1'); // a real unparseable file
        expect(r.corrupt).toBe(true);
      } finally {
        fx.cleanup();
      }
    });
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
