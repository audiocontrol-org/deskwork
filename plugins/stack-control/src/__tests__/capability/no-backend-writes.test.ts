// 026 T032 — FR-018: the mediation layer NEVER writes to adopter backend artifacts.
// `mediate-check` is pure-read (it computes a decision; it writes nothing); `front-door`
// / the marker write+remove ONLY under `<installation>/.stack-control/state/**` — never a
// backend skill / CLI file path (skills/, bin/, src/, the adopter's specs, etc.).
//
// The guard uses the shared content-hash, removal-aware snapshot (`snapshotTree` +
// `diffSnapshots` from the isolation harness), NOT a local size-keyed copy — so a deletion
// or a same-size in-place edit to a backend artifact is caught rather than silently passed
// (AUDIT-20260618-149/153/155/157; the prior `listFiles`/`changed` helpers were blind to both).

import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeCapabilities, enterFrontDoor, exitFrontDoor } from '../../capability/marker.js';
import { mediateCheck } from '../../subcommands/mediate-check.js';
import { diffSnapshots, snapshotTree } from '../_isolation-harness.js';
import { FRONT_DOOR_STATE_REL, makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

/** The allowed write zone per FR-018: `<installation>/.stack-control/state/**` — the parent of
 *  the front-door marker dir. The writer also creates this ancestor dir, which the dir-aware
 *  snapshot records, so the guard permits the whole state subtree, not just the leaf. */
const STATE_ROOT_REL = dirname(FRONT_DOOR_STATE_REL); // `.stack-control/state`

/** A diff entry is `<created|modified|removed>: <path>`; it is permitted iff its path lies under
 *  the state root (the only place the marker writer is allowed to touch / create / remove). */
const DIFF_PREFIXES = ['created: ', 'modified: ', 'removed: '] as const;
function isUnderStateRoot(entry: string): boolean {
  const prefix = DIFF_PREFIXES.find((p) => entry.startsWith(p));
  if (prefix === undefined) return false;
  return entry.slice(prefix.length).startsWith(`${STATE_ROOT_REL}/`);
}

describe('FR-018: mediation never writes to backend artifacts (026 T032)', () => {
  it('mediate-check is pure-read — it reads a PRESENT marker (permits) yet changes nothing on disk', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's', 'backlog'); // a real marker exists, so the read path returns it
      const before = snapshotTree(fx.root); // snapshot AFTER the marker is written
      const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], {
        resolveActive: (_at, session) => activeCapabilities(fx.root, session),
      });
      expect(r.code).toBe(0); // it READ the present marker → permit (proves the read path ran)
      expect(diffSnapshots(before, snapshotTree(fx.root))).toEqual([]); // ...and created/modified/removed nothing
    } finally {
      fx.cleanup();
    }
  });

  it('front-door enter/exit touches ONLY .stack-control/state/** — including the exit-time deletion', () => {
    const fx = makeCapabilityFixture();
    try {
      const before = snapshotTree(fx.root);
      const token = enterFrontDoor(fx.root, 's', 'backlog');
      const enterDelta = diffSnapshots(before, snapshotTree(fx.root));
      expect(enterDelta.length).toBeGreaterThan(0); // it did write the marker (+ its state ancestor dirs)
      expect(enterDelta.every(isUnderStateRoot)).toBe(true); // ...only under the state root

      const afterEnter = snapshotTree(fx.root);
      exitFrontDoor(fx.root, 's', token);
      const exitDelta = diffSnapshots(afterEnter, snapshotTree(fx.root));
      // exit REMOVES the marker; the removal-aware diff must SEE that deletion (a size-keyed
      // additions-only diff would report []), and it must be a state-root path only.
      expect(exitDelta.length).toBeGreaterThan(0);
      expect(exitDelta.every(isUnderStateRoot)).toBe(true);
    } finally {
      fx.cleanup();
    }
  });
});
