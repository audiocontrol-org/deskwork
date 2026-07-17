// specs/036-fleet-control-plane — T025 (RED), pairs with T026 impl
// (src/machine-state/identity.ts). Pins FR-031/FR-032/FR-033 + SC-014:
//   - installationId is minted ONCE, at first read, and is stable across
//     subsequent reads (mint-once semantics).
//   - A copied/cloned tree (a DIFFERENT path) re-mints — emergent from
//     locate.ts's path-hash keying (data-model.md § Machine-local state):
//     a different realpath -> a different sha256 key -> a different
//     durable dir -> no existing id file there -> mint fresh. This module
//     does not special-case "is this a clone?" at all; the test proves the
//     re-mint falls out of the keying, not out of clone-detection logic.
//   - Two DIFFERENT HOSTS at an IDENTICAL checkout path never collide,
//     because each host has its OWN machine-local durable store (modeled
//     here as two independent redirectMachineState() temp roots — disjoint
//     HOME/XDG bases) even though the installation path — and hence the
//     store KEY — is identical between them. A real collision would
//     require the two hosts to physically share durable storage, which two
//     separate redirects never do.
//   - A present-but-corrupt id file fails loud rather than silently
//     re-minting (Principle V) — distinct from the "absent" first-run case.
//
// installationId is deliberately NOT derived from the path (FR-031) — it is
// a random UUIDv4 persisted per-durable-store; the installation root only
// selects WHICH durable store is consulted (via locate.ts's keying).
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Real temp dirs on disk; never a
// mocked filesystem (.claude/rules/testing.md). NO vitest fake timers.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mintOrReadInstallationId,
  readInstallationId,
} from '../../src/machine-state/identity.js';
import {
  locateMachineState,
} from '../../src/machine-state/locate.js';
import {
  redirectMachineState,
  useMachineStateStore,
} from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Create a REAL installation-root dir on disk (locate.ts's realpath.native
 * requires the path to exist). Rooted at a deliberately short base, matching
 * the other T02x fleet tests' fixture convention.
 */
function makeInstallationRoot(prefix = 'scf-inst-'): { root: string; dispose(): void } {
  const base = IS_WIN ? tmpdir() : '/tmp';
  const root = mkdtempSync(join(base, prefix));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('identity mint/read — mint-once, re-mint-on-clone, cross-host isolation (T025)', () => {
  useMachineStateStore();

  it('mints a fresh UUIDv4 on first read; a second read returns the SAME id (mint-once, FR-031)', () => {
    const inst = makeInstallationRoot();
    try {
      const first = mintOrReadInstallationId(inst.root);
      expect(first).toMatch(UUID_V4_RE);
      const second = mintOrReadInstallationId(inst.root);
      expect(second).toBe(first);
      // The read-only accessor agrees, and does not mint a THIRD id.
      expect(readInstallationId(inst.root)).toBe(first);
    } finally {
      inst.dispose();
    }
  });

  it('readInstallationId never mints — returns undefined before any mint has happened', () => {
    const inst = makeInstallationRoot();
    try {
      expect(readInstallationId(inst.root)).toBeUndefined();
      // Confirm the read truly did not mint as a side effect.
      expect(readInstallationId(inst.root)).toBeUndefined();
    } finally {
      inst.dispose();
    }
  });

  it('a copied/cloned tree (different path) re-mints — emergent from locate.ts path-hash keying (FR-033)', () => {
    const original = makeInstallationRoot('scf-inst-orig-');
    const clone = makeInstallationRoot('scf-inst-clone-');
    try {
      const originalId = mintOrReadInstallationId(original.root);
      // "clone" is modeled as a different real directory: a different
      // realpath resolves a different sha256 key (locate.ts, T024), so a
      // different durable dir with no id file yet — mints fresh.
      const cloneId = mintOrReadInstallationId(clone.root);
      expect(cloneId).toMatch(UUID_V4_RE);
      expect(cloneId).not.toBe(originalId);
      // Both keys really do differ, proving the mechanism (not a fluke).
      expect(locateMachineState(original.root).key).not.toBe(
        locateMachineState(clone.root).key,
      );
    } finally {
      original.dispose();
      clone.dispose();
    }
  });

  it('two DIFFERENT HOSTS at an IDENTICAL checkout path never collide (SC-014)', () => {
    // Model "two hosts": each host owns its OWN machine-local durable store
    // (a fresh redirectMachineState() call — disjoint HOME/XDG temp roots),
    // even though both resolve the exact SAME installation-root path (so
    // locate.ts computes the SAME store key on both). A collision would
    // require the two hosts to share physical durable storage, which two
    // independent redirects never do — that is the guarantee under test.
    const inst = makeInstallationRoot();
    try {
      const hostA = redirectMachineState();
      let idA: string;
      let keyA: string;
      try {
        idA = mintOrReadInstallationId(inst.root);
        keyA = locateMachineState(inst.root).key;
      } finally {
        hostA.dispose();
      }

      const hostB = redirectMachineState();
      let idB: string;
      let keyB: string;
      try {
        idB = mintOrReadInstallationId(inst.root);
        keyB = locateMachineState(inst.root).key;
      } finally {
        hostB.dispose();
      }

      expect(idA).toMatch(UUID_V4_RE);
      expect(idB).toMatch(UUID_V4_RE);
      // Identical checkout path -> identical store KEY on both hosts...
      expect(keyA).toBe(keyB);
      // ...yet the minted ids are independent, because the durable STORES
      // backing that key are two disjoint physical locations.
      expect(idA).not.toBe(idB);
    } finally {
      inst.dispose();
    }
  });

  it('a present-but-corrupt id file fails loud — distinct from the absent/first-run case', () => {
    const inst = makeInstallationRoot();
    try {
      const loc = locateMachineState(inst.root);
      writeFileSync(join(loc.durableDir, 'installation-id'), 'not-a-uuid', 'utf8');
      expect(() => readInstallationId(inst.root)).toThrow(/corrupt/i);
      expect(() => mintOrReadInstallationId(inst.root)).toThrow(/corrupt/i);
    } finally {
      inst.dispose();
    }
  });
});
