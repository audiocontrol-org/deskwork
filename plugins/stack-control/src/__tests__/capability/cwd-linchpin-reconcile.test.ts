// 028 T087 (US3) — RED: cwd/session linchpin reconcile (FR-023; contract T4).
//
// The marker is keyed by (resolved installation-root, session), NOT raw cwd. So:
//  - A sanctioned drive whose cwd DRIFTS WITHIN the same installation right after a
//    successful `enter` is permitted (both enter + mediate resolve the same root).
//  - A cwd that LEFT the installation resolves no installation → permit via the T1
//    short-circuit, never a silent refuse.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeCapabilities, enterFrontDoor } from '../../capability/marker.js';
import { findInstallation } from '../../config/installation.js';
import { mediateCheck } from '../../subcommands/mediate-check.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

// The production resolver pair that mediate-check uses, exercised against a real fixture.
function liveDeps() {
  return {
    resolveInstalled: (at: string) => findInstallation(at) !== null,
    resolveActive: (at: string, session: string) => {
      const inst = findInstallation(at);
      return inst === null ? new Set<string>() : activeCapabilities(inst.root, session);
    },
  };
}

describe('cwd/session linchpin reconcile (028 T087)', () => {
  it('permits a drive from a SUBDIR of the installation after enter at the root (FR-023)', () => {
    const fx = makeCapabilityFixture();
    try {
      const subdir = join(fx.root, 'deep', 'nested');
      mkdirSync(subdir, { recursive: true });

      // enter resolves the installation root from the root cwd
      enterFrontDoor(fx.root, 'sess', 'backlog');

      // mediate-check from the SUBDIR — different raw cwd, SAME resolved installation
      const r = mediateCheck(
        ['--surface', 'bash', '--identity', 'backlog list', '--session', 'sess', '--at', subdir],
        liveDeps(),
      );
      expect(r.code).toBe(0); // permitted — keyed by resolved root, not raw cwd
    } finally {
      fx.cleanup();
    }
  });

  it('a cwd that LEFT the installation permits via the no-installation short-circuit (never silent refuse)', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 'sess', 'backlog');
      // /tmp is outside the fixture installation → no installation resolved → permit (T1)
      const r = mediateCheck(
        ['--surface', 'bash', '--identity', 'backlog list', '--session', 'sess', '--at', '/'],
        liveDeps(),
      );
      expect(r.code).toBe(0);
    } finally {
      fx.cleanup();
    }
  });

  it('STILL refuses an unmarked drive within the installation (no over-permit)', () => {
    const fx = makeCapabilityFixture();
    try {
      const r = mediateCheck(
        ['--surface', 'bash', '--identity', 'backlog create', '--session', 'unmarked', '--at', fx.root],
        liveDeps(),
      );
      expect(r.code).toBe(1);
    } finally {
      fx.cleanup();
    }
  });
});
