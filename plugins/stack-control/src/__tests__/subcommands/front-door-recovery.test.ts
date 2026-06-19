// 028 T085 (US3) — RED: front-door recovery sub-actions `mediate-list` + `mediate-recover`
// (alias `reset`) (FR-021/022; contract T3; SC-005).
//
// `mediate-list --session <id>`   — read-only: prints active entries (or `(no marker)` /
//                                    `corrupt (unparseable)`). Exit 0.
// `mediate-recover --session <id>` (alias `reset`) — mutating: clears the session marker.
//                                    Exit 0. Recoverable in ONE sanctioned verb (SC-005).
// Missing/unsafe `--session` → exit 2.

import { describe, expect, it } from 'vitest';
import { activeCapabilities, clearMarker, enterFrontDoor, listMarker } from '../../capability/marker.js';
import { findInstallation } from '../../config/installation.js';
import { frontDoor, type FrontDoorDeps } from '../../subcommands/front-door.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

function realDeps(): FrontDoorDeps {
  return {
    resolveRoot: (at) => findInstallation(at)?.root ?? null,
    enter: enterFrontDoor,
    exit: (root, session, token) => {
      void root;
      void session;
      void token;
    },
    list: listMarker,
    clear: clearMarker,
  };
}

describe('front-door mediate-list (028 T085 — read-only)', () => {
  it('prints (no marker) for an absent marker → exit 0', () => {
    const fx = makeCapabilityFixture();
    try {
      const r = frontDoor(['mediate-list', '--session', 's1', '--at', fx.root], realDeps());
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('(no marker)');
    } finally {
      fx.cleanup();
    }
  });

  it('prints active entries (capability + token) → exit 0', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's1', 'backlog');
      const r = frontDoor(['mediate-list', '--session', 's1', '--at', fx.root], realDeps());
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('backlog');
    } finally {
      fx.cleanup();
    }
  });

  it('reports a corrupt marker as `corrupt (unparseable)` rather than throwing → exit 0', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('.stack-control/state/front-door/s1.json', 'not json {{{');
      const r = frontDoor(['mediate-list', '--session', 's1', '--at', fx.root], realDeps());
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('corrupt (unparseable)');
    } finally {
      fx.cleanup();
    }
  });

  it('missing --session → exit 2', () => {
    expect(frontDoor(['mediate-list'], realDeps()).code).toBe(2);
  });

  it('unsafe --session → exit 2', () => {
    expect(frontDoor(['mediate-list', '--session', '../evil'], realDeps()).code).toBe(2);
  });
});

describe('front-door mediate-recover / reset (028 T085 — mutating)', () => {
  it('clears the session marker → exit 0 (SC-005: single sanctioned verb)', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's1', 'backlog');
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set(['backlog']));
      const r = frontDoor(['mediate-recover', '--session', 's1', '--at', fx.root], realDeps());
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('cleared marker for session s1');
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set());
    } finally {
      fx.cleanup();
    }
  });

  it('recovers a CORRUPT marker in one command (clears by path, no parse)', () => {
    const fx = makeCapabilityFixture();
    try {
      fx.write('.stack-control/state/front-door/s1.json', 'corrupt {{{');
      const r = frontDoor(['mediate-recover', '--session', 's1', '--at', fx.root], realDeps());
      expect(r.code).toBe(0);
      // listMarker now reports no marker (cleared)
      expect(listMarker(fx.root, 's1').corrupt).toBe(false);
      expect(listMarker(fx.root, 's1').entries).toEqual([]);
    } finally {
      fx.cleanup();
    }
  });

  it('alias `reset` behaves identically', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's1', 'backlog');
      const r = frontDoor(['reset', '--session', 's1', '--at', fx.root], realDeps());
      expect(r.code).toBe(0);
      expect(activeCapabilities(fx.root, 's1')).toEqual(new Set());
    } finally {
      fx.cleanup();
    }
  });

  it('with no installation, mediate-recover is a safe no-op success (exit 0)', () => {
    const r = frontDoor(['mediate-recover', '--session', 's1'], {
      resolveRoot: () => null,
      enter: () => 'X',
      exit: () => {},
      list: () => ({ corrupt: false, entries: [] }),
      clear: () => {
        throw new Error('clear must not be called when there is no installation');
      },
    });
    expect(r.code).toBe(0);
  });

  it('missing --session → exit 2', () => {
    expect(frontDoor(['mediate-recover'], realDeps()).code).toBe(2);
  });

  it('unsafe --session → exit 2', () => {
    expect(frontDoor(['reset', '--session', 'a/b'], realDeps()).code).toBe(2);
  });
});
