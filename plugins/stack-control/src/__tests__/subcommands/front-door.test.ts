// 026 T013 — RED tests for the front-door marker-writer verbs (contracts/cli-verbs.md):
// `enter` returns a token + writes atomically; `exit` is safe after a crash (missing
// token / no installation = no-op success); `enter` refuses with no enclosing
// installation (installation-anchor). Unit tests inject the seams; one integration test
// wires the real marker + installation resolver against a fixture.

import { describe, expect, it } from 'vitest';
import { activeCapabilities, clearMarker, enterFrontDoor, exitFrontDoor, listMarker } from '../../capability/marker.js';
import { findInstallation } from '../../config/installation.js';
import { frontDoor, type FrontDoorDeps } from '../../subcommands/front-door.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

const stub = (root: string | null): FrontDoorDeps => ({
  resolveRoot: () => root,
  enter: () => 'TOKEN',
  exit: () => {},
  list: () => ({ corrupt: false, entries: [] }),
  clear: () => false,
});

describe('front-door verb (026 T013)', () => {
  it('enter prints the issued token (exit 0)', () => {
    const r = frontDoor(['enter', '--capability', 'backlog', '--session', 's'], stub('/root'));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('TOKEN');
  });

  it('enter refuses with no enclosing installation (anchor refusal → exit 2)', () => {
    const r = frontDoor(['enter', '--capability', 'backlog', '--session', 's'], stub(null));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('installation');
  });

  it('exit rejects an empty --token (codex-01 — would silently leak the marker)', () => {
    const r = frontDoor(['exit', '--token', '', '--session', 's'], stub('/r'));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('non-empty --token');
  });

  it('exit is safe after a crash: no installation → no-op success (exit 0)', () => {
    const r = frontDoor(['exit', '--token', 't', '--session', 's'], {
      resolveRoot: () => null,
      enter: () => 'X',
      exit: () => {
        throw new Error('exit dep must not be called when there is no installation');
      },
      list: () => ({ corrupt: false, entries: [] }),
      clear: () => false,
    });
    expect(r.code).toBe(0);
  });

  it('rejects an unknown subaction or flag (exit 2)', () => {
    expect(frontDoor(['frobnicate', '--session', 's'], stub('/r')).code).toBe(2);
    expect(frontDoor(['enter', '--capability', 'backlog', '--session', 's', '--bad'], stub('/r')).code).toBe(2);
  });

  it('enter requires --capability; exit requires --token (exit 2)', () => {
    expect(frontDoor(['enter', '--session', 's'], stub('/r')).code).toBe(2);
    expect(frontDoor(['exit', '--session', 's'], stub('/r')).code).toBe(2);
  });

  it('enter rejects an unknown capability id (codex-04 — exit 2, names the known ids)', () => {
    const r = frontDoor(['enter', '--capability', 'spec-definiton', '--session', 's'], stub('/r'));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('unknown --capability');
  });

  it('enter rejects an empty --session (codex-02 — exit 2)', () => {
    expect(frontDoor(['enter', '--capability', 'backlog', '--session', ''], stub('/r')).code).toBe(2);
  });

  it('rejects a path-traversal --session (codex-01 — exit 2, before any write)', () => {
    const r = frontDoor(['enter', '--capability', 'backlog', '--session', '../evil'], stub('/r'));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('filename-safe');
  });

  it('enter → exit round-trips the marker against a real installation', () => {
    const fx = makeCapabilityFixture();
    try {
      const deps: FrontDoorDeps = {
        resolveRoot: (at) => findInstallation(at)?.root ?? null,
        enter: enterFrontDoor,
        exit: exitFrontDoor,
        list: listMarker,
        clear: clearMarker,
      };
      const entered = frontDoor(['enter', '--capability', 'backlog', '--session', 's', '--at', fx.root], deps);
      expect(entered.code).toBe(0);
      const token = entered.stdout.trim();
      expect(activeCapabilities(fx.root, 's')).toEqual(new Set(['backlog']));

      const exited = frontDoor(['exit', '--token', token, '--session', 's', '--at', fx.root], deps);
      expect(exited.code).toBe(0);
      expect(activeCapabilities(fx.root, 's')).toEqual(new Set());
    } finally {
      fx.cleanup();
    }
  });
});
