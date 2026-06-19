// 028 T089 (US3) — RED: speckit-guard reads the 026 FILE marker (FR-024; contract T5).
//
// The deprecated `speckit-guard` MUST resolve "via front door" from the session-keyed
// marker FILE (via `activeCapabilities`), NOT the legacy `STACKCTL_FRONT_DOOR` env var —
// so its decision matches the interceptor. A context established via `front-door enter`
// (file) is therefore seen here (permit), resolving the TASK-165 divergence. The pure
// core (`evaluateGuard`) takes the resolved `viaFrontDoor` so it stays hermetically
// testable; the production resolver reads the file marker.

import { describe, expect, it } from 'vitest';
import { enterFrontDoor } from '../../capability/marker.js';
import { findInstallation } from '../../config/installation.js';
import { evaluateGuard, resolveViaFrontDoorFile } from '../../subcommands/speckit-guard.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

describe('speckit-guard file-marker resolution (028 T089)', () => {
  it('a context established via front-door enter (FILE) is seen → permit (matches interceptor)', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 'sess', 'spec-execution');
      const viaFrontDoor = resolveViaFrontDoorFile('speckit-implement', 'sess', fx.root);
      expect(viaFrontDoor).toBe(true);
      const v = evaluateGuard('speckit-implement', viaFrontDoor);
      expect(v.refused).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('no marker file → refuse (a raw direct invocation)', () => {
    const fx = makeCapabilityFixture();
    try {
      const viaFrontDoor = resolveViaFrontDoorFile('speckit-implement', 'sess', fx.root);
      expect(viaFrontDoor).toBe(false);
      const v = evaluateGuard('speckit-implement', viaFrontDoor);
      expect(v.refused).toBe(true);
      expect(v.message).toMatch(/stack-control:execute/);
    } finally {
      fx.cleanup();
    }
  });

  it('a marker for a DIFFERENT capability does not authorize a speckit-implement guard', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 'sess', 'backlog'); // unrelated capability
      const viaFrontDoor = resolveViaFrontDoorFile('speckit-implement', 'sess', fx.root);
      expect(viaFrontDoor).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('an authoring skill marked via spec-definition is permitted', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 'sess', 'spec-definition');
      const viaFrontDoor = resolveViaFrontDoorFile('speckit-analyze', 'sess', fx.root);
      expect(viaFrontDoor).toBe(true);
      expect(evaluateGuard('speckit-analyze', viaFrontDoor).refused).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it('a non-wrapped skill is permitted regardless of marker', () => {
    const v = evaluateGuard('not-a-speckit-skill', false);
    expect(v.refused).toBe(false);
  });

  it('with no installation, the file resolver reports not-via-front-door (no throw)', () => {
    // A directory with no enclosing installation resolves null → not via front door.
    const viaFrontDoor = resolveViaFrontDoorFile('speckit-implement', 'sess', '/');
    expect(viaFrontDoor).toBe(false);
  });

  it('an UNSAFE (path-traversal) session id resolves not-via-front-door, never throws (claude-04)', () => {
    // A compromised $CLAUDE_CODE_SESSION_ID like `../evil` would make markerPath throw an
    // unsafe-session error (an unhandled rejection in the async verb). The resolver must
    // treat it as "no front-door context" (false) so the guard's normal refusal path runs.
    const fx = makeCapabilityFixture();
    try {
      expect(() => resolveViaFrontDoorFile('speckit-implement', '../evil', fx.root)).not.toThrow();
      expect(resolveViaFrontDoorFile('speckit-implement', '../evil', fx.root)).toBe(false);
      // A guard fed an unsafe session still refuses a raw wrapped skill (not a false permit).
      expect(evaluateGuard('speckit-implement', false).refused).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it('an empty session id resolves not-via-front-door, never throws (claude-04)', () => {
    const fx = makeCapabilityFixture();
    try {
      expect(() => resolveViaFrontDoorFile('speckit-implement', '', fx.root)).not.toThrow();
      expect(resolveViaFrontDoorFile('speckit-implement', '', fx.root)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });
});
