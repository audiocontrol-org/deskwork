// specs/036-fleet-control-plane — T119 (RED), pairs with T119's impl in
// src/subcommands/plane.ts (PT-015, research.md).
//
// PT-015: the bearer token is placed into the machine-local durable store by
// an EXPLICIT operator-run verb. NO join-code exchange, NO automatic
// enrollment — a single-operator fleet (FR-078) does not need one. This test
// pins the SIDECAR-side placement half: `stackctl plane provision-token
// --token <value>` writes the value into T118's token custody (0600), and it
// is readable back via `openTokenCustody(...).read()`.
//
// CRITICAL (per the harness's own header, T009): the machine-local store is
// REDIRECTED for the whole file via `useMachineStateStore()`, so this test
// NEVER mints a token into a real developer's `$HOME`. `runPlane` resolves
// the installation root from `process.cwd()` — mirroring cli.ts's own
// convention (src/cli.ts:273, `const installationRoot = process.cwd()`) — so
// each case `process.chdir()`s into a REAL on-disk installation-root fixture
// (required by `locateMachineState`'s `realpathSync.native`) and restores
// cwd in a `finally`, exactly like `machine-state-locate.test.ts`'s
// `makeInstallationRoot()` fixture pattern.
//
// Real filesystem, real temp dirs (.claude/rules/testing.md) — no mocked fs.
// Relative `.js` imports under node16 module resolution (no `@/` alias
// configured).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useMachineStateStore } from './_machine-state-harness.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import { openTokenCustody } from '../../src/machine-state/token.js';
import { runPlane } from '../../src/subcommands/plane.js';

const IS_WIN = process.platform === 'win32';

/** Thrown by the mocked `process.exit` so a usage-error path never kills the worker. */
class ProcessExitSignal extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

function spyExit(): ReturnType<typeof vi.spyOn<typeof process, 'exit'>> {
  return vi.spyOn(process, 'exit').mockImplementation((code?: number): never => {
    throw new ProcessExitSignal(code ?? 0);
  });
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

function captureIo(): { get(): Captured; restore(): void } {
  let stdout = '';
  let stderr = '';
  const outSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stdout += chunk.toString();
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stderr += chunk.toString();
      return true;
    });
  return {
    get: () => ({ stdout, stderr }),
    restore: () => {
      outSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

/** A REAL installation-root dir on disk (realpath.native requires it to exist). */
function makeInstallationRoot(): { root: string; dispose(): void } {
  const base = IS_WIN ? tmpdir() : '/tmp';
  const root = mkdtempSync(join(base, 'scf-plane-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('stackctl plane provision-token (T119, PT-015)', () => {
  const store = useMachineStateStore();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the token to durable custody at 0600, readable back, WITHOUT printing it', async () => {
    store(); // establishes the redirected machine-state store for this test
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const io = captureIo();
    try {
      await runPlane(['provision-token', '--token', 'SECRET123']);

      const { stdout, stderr } = io.get();
      expect(stdout.length).toBeGreaterThan(0);
      // The token is a credential (contracts/sidecar-plane-protocol.md § C6)
      // — it MUST NEVER be echoed, on success or otherwise.
      expect(stdout).not.toContain('SECRET123');
      expect(stderr).not.toContain('SECRET123');
    } finally {
      io.restore();
      process.chdir(originalCwd);
    }

    const location = locateMachineState(inst.root);
    const custody = openTokenCustody(location.durableDir);
    expect(custody.read()).toBe('SECRET123');

    if (!IS_WIN) {
      const stat = statSync(join(location.durableDir, 'bearer-token'));
      expect(stat.mode & 0o777).toBe(0o600);
    }

    inst.dispose();
  });

  it('exits 2 when --token is missing (usage error, no flag silently ignored)', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runPlane(['provision-token'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(io.get().stderr).toMatch(/--token/);

      // No token file was ever written for this rejected invocation.
      const location = locateMachineState(inst.root);
      expect(openTokenCustody(location.durableDir).read()).toBeUndefined();
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('exits 2 on an unknown flag (no flag silently ignored)', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(
        runPlane(['provision-token', '--token', 'SECRET123', '--bogus']),
      ).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('exits 2 on an unknown subaction', async () => {
    store();
    const exitSpy = spyExit();
    try {
      await expect(runPlane(['bogus-subaction'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('exits 2 when no subaction is given', async () => {
    store();
    const exitSpy = spyExit();
    try {
      await expect(runPlane([])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
