// 026 T032 — FR-018: the mediation layer NEVER writes to adopter backend artifacts.
// `mediate-check` is pure-read (it computes a decision; it writes nothing); `front-door`
// / the marker write ONLY under `<installation>/.stack-control/state/**` — never a backend
// skill / CLI file path (skills/, bin/, src/, the adopter's specs, etc.).

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeCapabilities, enterFrontDoor, exitFrontDoor } from '../../capability/marker.js';
import { mediateCheck } from '../../subcommands/mediate-check.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

/** path → CONTENT hash for every file under `root` (excluding `.git`). Content, not size,
 *  so a same-size modification is still detected (a write must change nothing here). */
function listFiles(root: string, rel = ''): Map<string, string> {
  const out = new Map<string, string>();
  const abs = rel === '' ? root : join(root, rel);
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) for (const [k, v] of listFiles(root, childRel)) out.set(k, v);
    else out.set(childRel, createHash('sha1').update(readFileSync(join(root, childRel))).digest('hex'));
  }
  return out;
}

/** Paths created or content-changed between two listings. */
function changed(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...after].filter(([p, h]) => before.get(p) !== h).map(([p]) => p);
}

describe('FR-018: mediation never writes to backend artifacts (026 T032)', () => {
  it('mediate-check is pure-read — it reads a PRESENT marker (permits) yet writes nothing', () => {
    const fx = makeCapabilityFixture();
    try {
      enterFrontDoor(fx.root, 's', 'backlog'); // a real marker exists, so the read path returns it
      const before = listFiles(fx.root); // snapshot AFTER the marker is written
      const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], {
        resolveActive: (_at, session) => activeCapabilities(fx.root, session),
      });
      expect(r.code).toBe(0); // it READ the present marker → permit (proves the read path ran)
      expect(changed(before, listFiles(fx.root))).toEqual([]); // ...and wrote/changed nothing
    } finally {
      fx.cleanup();
    }
  });

  it('front-door enter/exit writes ONLY under .stack-control/state/** (no backend path)', () => {
    const fx = makeCapabilityFixture();
    try {
      const before = listFiles(fx.root);
      const token = enterFrontDoor(fx.root, 's', 'backlog');
      const createdByEnter = changed(before, listFiles(fx.root));
      expect(createdByEnter.length).toBeGreaterThan(0); // it did write the marker
      for (const f of createdByEnter) {
        expect(f.startsWith('.stack-control/state/front-door/'), `wrote outside state/: ${f}`).toBe(true);
      }
      exitFrontDoor(fx.root, 's', token);
      for (const f of changed(before, listFiles(fx.root))) {
        expect(f.startsWith('.stack-control/state/front-door/'), `exit wrote outside state/: ${f}`).toBe(true);
      }
    } finally {
      fx.cleanup();
    }
  });
});
