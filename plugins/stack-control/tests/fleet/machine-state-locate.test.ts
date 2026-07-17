// specs/036-fleet-control-plane — T023 (RED), pairs with T024 impl
// (src/machine-state/locate.ts). This test pins the MACHINE-LOCAL STORE
// LOCATION contract (research.md § PT-001, data-model.md § Machine-local
// state — SETTLED, not re-derived here):
//
//   Durable   (installationId, bearer token, high-water mark):
//     Linux   $XDG_STATE_HOME     macOS  ~/Library/Application Support
//     Windows %LOCALAPPDATA%
//   Ephemeral (socket/pipe endpoint — reboot-cleared):
//     Linux   $XDG_RUNTIME_DIR    macOS  $TMPDIR     Windows  named pipe
//   Keyed by  sha256(realpath.native(installationRoot))[0:16].
//   UDS path length is the forcing constraint: 103 usable bytes (macOS) /
//   107 (Linux). The socket is NEVER under the installation root.
//
// INTEGRATION WITH T009 (the load-bearing part of this test): locate.ts reads
// the SAME env vars the T009 harness redirects, and derives the socket path
// with the SAME leaf layout the harness models in `socketPathFor`. So after a
// `redirectMachineState()`, locate.ts's durable dir lands under the harness's
// temp root (never a real developer's $HOME), and its socket path is byte-for-
// byte what the harness predicts. That equality IS the proof the redirect
// actually covers locate — asserted directly below.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured). Real temp dirs on disk; never a mocked
// filesystem (.claude/rules/testing.md). NO vitest fake timers.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MACOS_UDS_BUDGET_BYTES,
  assertUdsBudget,
  locateMachineState,
  storeKey as locateStoreKey,
} from '../../src/machine-state/locate.js';
import {
  storeKey as harnessStoreKey,
  useMachineStateStore,
} from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

/**
 * Create a REAL installation-root dir on disk (realpath.native requires the
 * path to exist). Rooted at a deliberately short base so the derived socket
 * path is never inflated by the fixture's own depth. Caller cleans it up.
 */
function makeInstallationRoot(): { root: string; dispose(): void } {
  const base = IS_WIN ? tmpdir() : '/tmp';
  const root = mkdtempSync(join(base, 'scf-inst-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('machine-state locate — durable/ephemeral split, keying, UDS budget (T023)', () => {
  const store = useMachineStateStore();

  it('keys by sha256(realpath.native(root))[0:16], agreeing with the T009 harness', () => {
    const inst = makeInstallationRoot();
    try {
      const loc = locateMachineState(inst.root);
      // 16 hex chars — the contract's key width.
      expect(loc.key).toMatch(/^[0-9a-f]{16}$/);
      // locate.ts and the harness MUST compute the identical key, or a
      // redirect would not line up with what locate resolves.
      expect(loc.key).toBe(harnessStoreKey(inst.root));
      expect(loc.key).toBe(locateStoreKey(inst.root));
    } finally {
      inst.dispose();
    }
  });

  it('is deterministic for the same root and distinct for a different root (mv re-keys)', () => {
    const a = makeInstallationRoot();
    const b = makeInstallationRoot();
    try {
      expect(locateMachineState(a.root).key).toBe(locateMachineState(a.root).key);
      expect(locateMachineState(a.root).key).not.toBe(locateMachineState(b.root).key);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('resolves the durable dir under the REDIRECTED temp store, never a real $HOME', () => {
    const s = store();
    const inst = makeInstallationRoot();
    try {
      const loc = locateMachineState(inst.root);
      // The redirect actually covers locate: durable lands under the harness
      // temp root, not a real developer's home.
      expect(loc.durableDir.startsWith(s.root)).toBe(true);
      // Platform-specific base — the exact durable mapping from PT-001.
      if (IS_MAC) {
        expect(
          loc.durableDir.startsWith(join(s.home, 'Library', 'Application Support')),
        ).toBe(true);
      } else if (IS_WIN) {
        expect(loc.durableDir.startsWith(s.localAppData)).toBe(true);
      } else {
        expect(loc.durableDir.startsWith(s.stateHome)).toBe(true);
      }
      // Durable is per-installation — the key participates in the path.
      expect(loc.durableDir).toContain(loc.key);
    } finally {
      inst.dispose();
    }
  });

  it('derives the socket path with the SAME layout the harness models (integration proof)', () => {
    const s = store();
    const inst = makeInstallationRoot();
    try {
      const loc = locateMachineState(inst.root);
      if (IS_WIN) {
        // Windows named pipe — kernel namespace, no filesystem parent.
        expect(loc.socketPath.startsWith('\\\\.\\pipe\\')).toBe(true);
        expect(loc.socketPath).toContain(loc.key);
        expect(loc.socketDir).toBeUndefined();
      } else {
        // Byte-for-byte equal to the harness's prediction — this is the
        // consistency guarantee that makes the redirect meaningful.
        expect(loc.socketPath).toBe(s.socketPathFor(inst.root));
        expect(loc.socketPath.startsWith(s.runtimeDir)).toBe(true);
        expect(loc.socketDir).toBe(join(s.runtimeDir, 'stack-control'));
      }
    } finally {
      inst.dispose();
    }
  });

  it('keeps the socket path within the UDS budget (macOS 103 / Linux 107)', () => {
    const inst = makeInstallationRoot();
    try {
      const loc = locateMachineState(inst.root);
      if (IS_WIN) {
        // Named pipes have no sun_path budget; assertUdsBudget is a no-op.
        expect(() => assertUdsBudget(loc.socketPath)).not.toThrow();
      } else {
        expect(() => assertUdsBudget(loc.socketPath)).not.toThrow();
        // The macOS limit is the tightest; enforce it on all POSIX so a
        // Linux-minted socket stays macOS-portable.
        expect(Buffer.byteLength(loc.socketPath, 'utf8')).toBeLessThanOrEqual(
          MACOS_UDS_BUDGET_BYTES,
        );
      }
    } finally {
      inst.dispose();
    }
  });

  it('creates the durable + socket parent dirs with 0700 authorization mode', () => {
    const inst = makeInstallationRoot();
    try {
      const loc = locateMachineState(inst.root);
      // Durable dir holds the 0600 token — its 0700 parent is the auth boundary.
      const durMode = statSync(loc.durableDir).mode & 0o777;
      if (IS_WIN) {
        // Windows ACLs, not POSIX bits — assert existence, not the mode value.
        expect(statSync(loc.durableDir).isDirectory()).toBe(true);
      } else {
        expect(durMode).toBe(0o700);
        // Socket authorization is its 0700 PARENT directory (PT-001), not the
        // socket file mode.
        expect(loc.socketDir).toBeDefined();
        const socketDir = loc.socketDir;
        if (socketDir === undefined) throw new Error('expected a POSIX socketDir');
        expect(statSync(socketDir).mode & 0o777).toBe(0o700);
      }
    } finally {
      inst.dispose();
    }
  });
});
