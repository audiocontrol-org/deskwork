// specs/036-fleet-control-plane — T029 (RED), pairs with T030 impl
// (src/machine-state/identity.ts). Pins the accepted move-vs-clone tension
// research.md § Open items records:
//
//   "Move vs. clone identity is in genuine tension. Path-hash keying
//   (PT-001) delivers FR-033's clone-re-mints requirement, but
//   `mv ~/proj ~/proj2` then ALSO silently re-mints, losing identity and
//   history. ... Decision: mint-new on move, plus an explicit `reattach`
//   escape hatch."
//
// This test proves BOTH halves of that decision:
//   1. A REAL `mv` (renameSync — a real filesystem move, not a simulation)
//      of an installation re-mints: the post-move root resolves a
//      different `realpath.native`, hence a different locate.ts key, hence
//      an empty durable dir, hence `mintOrReadInstallationId` mints fresh
//      there — losing the pre-move id unless reattach is used.
//   2. `reattachInstallationId` deliberately restores the pre-move id at
//      the new path, and does so SAFELY: idempotent on repeat calls with
//      the same id; refuses to clobber a different existing id without
//      `{ force: true }`; and validates the id being restored is itself a
//      well-formed UUIDv4 (reattach restores a KNOWN id, it does not mint).
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Real temp dirs + a real rename on
// disk; never a mocked filesystem (.claude/rules/testing.md). NO vitest
// fake timers.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mintOrReadInstallationId,
  reattachInstallationId,
  readInstallationId,
} from '../../src/machine-state/identity.js';
import { useMachineStateStore } from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Create a REAL installation-root dir on disk, matching identity-mint.test.ts. */
function makeInstallationRoot(prefix = 'scf-inst-'): string {
  const base = IS_WIN ? tmpdir() : '/tmp';
  return mkdtempSync(join(base, prefix));
}

describe('reattach — mv re-mints; reattach deliberately restores identity (T029)', () => {
  useMachineStateStore();

  it('a real `mv` of the installation root re-mints (the accepted consequence)', () => {
    const before = makeInstallationRoot('scf-inst-premove-');
    const after = before + '-moved';
    try {
      const originalId = mintOrReadInstallationId(before);
      expect(originalId).toMatch(UUID_V4_RE);

      renameSync(before, after); // a REAL mv, not a simulation

      // Different realpath -> different locate.ts key -> empty durable dir
      // -> the post-move root has no id yet. (`before` no longer exists on
      // disk after the rename, so its key is derived from the path string
      // alone via locate.ts's own resolution — the comparison below only
      // needs `after`'s key to differ from what `before` HAD when it
      // existed, which the distinct fresh mint two lines down proves.)
      expect(readInstallationId(after)).toBeUndefined();

      const remintedId = mintOrReadInstallationId(after);
      expect(remintedId).toMatch(UUID_V4_RE);
      expect(remintedId).not.toBe(originalId);
    } finally {
      rmSync(after, { recursive: true, force: true });
    }
  });

  it('reattachInstallationId restores the pre-move id at the new path (with force, since a real mint already occupies it)', () => {
    const before = makeInstallationRoot('scf-inst-premove-');
    const after = before + '-moved';
    try {
      const originalId = mintOrReadInstallationId(before);
      renameSync(before, after);
      // The move already re-minted a fresh (unwanted) id at `after` — this
      // IS the realistic flow (some invocation touches the moved tree
      // before the operator reattaches). That auto-minted id is a real,
      // well-formed, persisted id from `reattach`'s point of view — it
      // cannot structurally tell "spurious re-mint from a mv" apart from
      // "a genuine new identity" (no provenance is tracked). So restoring
      // the pre-move id here REQUIRES `{ force: true }`, exactly like
      // clobbering any other existing id — the deliberateness the escape
      // hatch is named for.
      const remintedId = mintOrReadInstallationId(after);
      expect(remintedId).not.toBe(originalId);
      expect(() => reattachInstallationId(after, originalId)).toThrow(
        /refusing to overwrite/i,
      );

      const restored = reattachInstallationId(after, originalId, { force: true });
      expect(restored).toBe(originalId);
      expect(readInstallationId(after)).toBe(originalId);
    } finally {
      rmSync(after, { recursive: true, force: true });
    }
  });

  it('reattach is idempotent when the store already holds the SAME id — no force needed', () => {
    const root = makeInstallationRoot();
    try {
      const id = mintOrReadInstallationId(root);
      expect(() => reattachInstallationId(root, id)).not.toThrow();
      expect(readInstallationId(root)).toBe(id);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reattach refuses to overwrite an existing DIFFERENT id without { force: true }', () => {
    const root = makeInstallationRoot();
    try {
      const currentId = mintOrReadInstallationId(root);
      const otherId = '11111111-1111-4111-8111-111111111111';
      expect(otherId).not.toBe(currentId);

      expect(() => reattachInstallationId(root, otherId)).toThrow(
        /refusing to overwrite/i,
      );
      // Refused — the original id survives untouched.
      expect(readInstallationId(root)).toBe(currentId);

      // With force: true, the overwrite is deliberate and succeeds.
      const forced = reattachInstallationId(root, otherId, { force: true });
      expect(forced).toBe(otherId);
      expect(readInstallationId(root)).toBe(otherId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reattach rejects an id that is not a well-formed UUIDv4 — it restores, never mints', () => {
    const root = makeInstallationRoot();
    try {
      expect(() => reattachInstallationId(root, 'not-a-uuid')).toThrow(
        /not a well-formed UUIDv4/i,
      );
      // Nothing was written — still absent.
      expect(readInstallationId(root)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reattach onto a NEVER-minted store (nothing present yet) writes the given id directly', () => {
    const root = makeInstallationRoot();
    try {
      const knownId = '22222222-2222-4222-8222-222222222222';
      expect(readInstallationId(root)).toBeUndefined();
      const restored = reattachInstallationId(root, knownId);
      expect(restored).toBe(knownId);
      expect(readInstallationId(root)).toBe(knownId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
