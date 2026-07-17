// specs/036-fleet-control-plane — T027 (RED), pairs with T028 impl
// (src/machine-state/highwater.ts). This test pins the DURABLE HIGH-WATER
// MARK contract (research.md § R-02, spec.md FR-039, data-model.md
// § Machine-local state — SETTLED, not re-derived here):
//
//   The sidecar is the `installationSequence` sequencer, and runs survive
//   its restart — but the COUNTER must too, or a restarted sidecar resuming
//   from zero makes every subsequent event look like a regression under
//   FR-042, and the plane rejects its own fleet's ongoing telemetry.
//
//   Decision (R-02): `installationSequence`'s high-water mark is DURABLE,
//   MONOTONIC, and NEVER RESETS across sidecar restart. It is persisted
//   with the machine-local state (PT-001, via locate.ts's durableDir) and
//   restored on start. A mark that CANNOT be restored (corrupt/unreadable
//   file) MUST fail loud — a silent reset to zero is exactly the R-02 bug.
//
// SCOPE: high-water mark PERSISTENCE only. This does NOT touch the sequence
// domain logic (src/fleet/sequence.ts, T019/T020, already done) — no
// InstallationSequence/InvocationSequence nominal types here, just the
// durable integer high-water mark that gap classification (sequence.ts's
// classifyGap) is handed AS AN INPUT.
//
// "SURVIVES RESTART" IS MODELED, NOT ASSUMED: highwater.ts holds no
// in-process cache by design, so every `readHighWaterMark` call already
// reads fresh from disk. To make the restart-survival claim concrete
// anyway (rather than relying on "well, it never caches"), each restart
// scenario below RE-RESOLVES the machine-state location via a fresh
// `locateMachineState()` call before reading — modeling a fresh process
// re-deriving where its durable store lives — and asserts the value is
// UNCHANGED, never reset to 0.
//
// ABSENT vs CORRUPT are asserted as separate, distinct cases: absent file
// (first-ever start) returns a legitimate initial value; a PRESENT but
// unparseable/wrong-shaped file throws a descriptive error naming the
// problem. These are not the same code path and must not collapse to one.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Real temp dirs on disk; never a
// mocked filesystem (.claude/rules/testing.md). NO vitest fake timers.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  advanceHighWaterMark,
  highWaterMarkPath,
  readHighWaterMark,
} from '../../src/machine-state/highwater.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { useMachineStateStore } from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';

/**
 * Create a REAL installation-root dir on disk (locate.ts's realpath.native
 * requires the path to exist). Rooted at a deliberately short base, mirroring
 * machine-state-locate.test.ts's fixture.
 */
function makeInstallationRoot(): { root: string; dispose(): void } {
  const base = IS_WIN ? tmpdir() : '/tmp';
  const root = mkdtempSync(join(base, 'scf-hw-inst-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('high-water mark — durable, monotonic, survives restart, fail-loud on unrestorable (T027)', () => {
  const store = useMachineStateStore();

  it('absent file (first-ever start): reads a legitimate initial value, never a fabricated guess', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      // 0 = "no installationSequence has ever been emitted from this
      // installation on this machine" — consistent with the domain
      // convention elsewhere in this feature that the first REAL emitted
      // installationSequence is 1 (see tests/fleet/event.test.ts,
      // types.test.ts: `installationSequence: 1`).
      expect(readHighWaterMark(location)).toBe(0);
    } finally {
      inst.dispose();
    }
  });

  it('advancing persists durably; a FRESH read after a simulated restart sees the SAME value, not a reset', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      expect(advanceHighWaterMark(location, 42)).toBe(42);

      // Simulate a sidecar restart: re-resolve the store location from
      // scratch (a fresh locateMachineState call, exactly what a newly
      // started process would do) and read again. This is the load-bearing
      // assertion of R-02 — restart must NOT observe 0.
      const restarted = locateMachineState(inst.root);
      expect(readHighWaterMark(restarted)).toBe(42);
    } finally {
      inst.dispose();
    }
  });

  it('after restart, advancing further continues monotonically forward from the restored mark', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      advanceHighWaterMark(location, 42);

      const restarted = locateMachineState(inst.root);
      expect(readHighWaterMark(restarted)).toBe(42);
      expect(advanceHighWaterMark(restarted, 100)).toBe(100);
      expect(readHighWaterMark(restarted)).toBe(100);

      // And a SECOND restart still sees the latest mark, not the first.
      const restartedAgain = locateMachineState(inst.root);
      expect(readHighWaterMark(restartedAgain)).toBe(100);
    } finally {
      inst.dispose();
    }
  });

  it('never goes backward: advancing to a value below the durable mark fails loud and leaves the mark unchanged', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      advanceHighWaterMark(location, 50);

      expect(() => advanceHighWaterMark(location, 10)).toThrow(/backward|monotonic/i);
      // The rejected advance must not have mutated the durable mark.
      expect(readHighWaterMark(location)).toBe(50);
    } finally {
      inst.dispose();
    }
  });

  it('advancing to the SAME value is a legitimate no-op (monotonic non-decreasing, not strictly increasing)', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      advanceHighWaterMark(location, 7);
      expect(() => advanceHighWaterMark(location, 7)).not.toThrow();
      expect(readHighWaterMark(location)).toBe(7);
    } finally {
      inst.dispose();
    }
  });

  it('a PRESENT but unparseable (corrupt JSON) mark file fails loud — never silently reset to zero (the R-02 bug)', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      // Establish a real durable mark first, so a silent-reset bug would be
      // visibly wrong (0) rather than coincidentally matching an untouched
      // initial value.
      advanceHighWaterMark(location, 9);

      const path = highWaterMarkPath(location);
      writeFileSync(path, '{ this is not valid json', 'utf8');

      expect(() => readHighWaterMark(location)).toThrow(/corrupt|invalid|parse/i);
    } finally {
      inst.dispose();
    }
  });

  it('a PRESENT file with a wrong-shaped payload fails loud too — distinct from the absent case', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      const path = highWaterMarkPath(location);

      writeFileSync(path, JSON.stringify({ notTheRightField: 1 }), 'utf8');
      expect(() => readHighWaterMark(location)).toThrow(/installationSequence/);

      writeFileSync(path, JSON.stringify({ installationSequence: 'not-a-number' }), 'utf8');
      expect(() => readHighWaterMark(location)).toThrow(/installationSequence/);

      writeFileSync(path, JSON.stringify({ installationSequence: -1 }), 'utf8');
      expect(() => readHighWaterMark(location)).toThrow(/installationSequence/);

      writeFileSync(path, JSON.stringify([1, 2, 3]), 'utf8');
      expect(() => readHighWaterMark(location)).toThrow();
    } finally {
      inst.dispose();
    }
  });

  it('advanceHighWaterMark itself rejects a negative or non-integer target (fail loud, never coerce)', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      expect(() => advanceHighWaterMark(location, -1)).toThrow();
      expect(() => advanceHighWaterMark(location, 1.5)).toThrow();
      // Neither invalid call should have written anything durable.
      expect(readHighWaterMark(location)).toBe(0);
    } finally {
      inst.dispose();
    }
  });

  it('highWaterMarkPath lands inside the located durable dir (co-located with future identity/token files)', () => {
    store();
    const inst = makeInstallationRoot();
    try {
      const location = locateMachineState(inst.root);
      const path = highWaterMarkPath(location);
      expect(path.startsWith(location.durableDir)).toBe(true);
    } finally {
      inst.dispose();
    }
  });
});
