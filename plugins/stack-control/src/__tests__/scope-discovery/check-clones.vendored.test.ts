// T015 RED — SC-002: code vendored into an installation from another codebase
// (the canonical case: audit-barrage vendored from dw-lifecycle into
// stack-control) is NOT reported as a clone of its origin, because the origin
// lives outside this installation's boundary. This is the false positive the
// per-codebase default exists to kill.

import { describe, it, expect, afterEach } from 'vitest';
import { makeFixture, type Fixture } from './fixture.js';
import { detectCodebaseClones } from '../../scope-discovery/clone-detector.js';

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

describe('detectCodebaseClones (vendored-copy false positive)', () => {
  it('does not flag a vendored copy as a clone of its out-of-boundary origin', async () => {
    fx = makeFixture();
    const consumer = fx.install('stack-control');
    fx.install('dw-lifecycle');
    // The same vendored module exists in both codebases (identical content).
    fx.plantClone('stack-control/src/vendored/audit-barrage.ts', 'dw-lifecycle/src/audit-barrage.ts', 30);

    const result = await detectCodebaseClones({ startDir: consumer });

    // Scanning stack-control's boundary, the vendored<->origin pair is absent.
    expect(result.groups.length).toBe(0);
  }, 60_000);
});
