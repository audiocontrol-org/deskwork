// specs/037-instance-observability (plan: docs/superpowers/plans/
// 2026-07-20-fleet-multihost-enrollment.md) — Task 6.
//
// `plane issue-enrollment [--label <host>]` is how the operator mints a
// fresh enrollment credential ON THE PLANE HOST for a foreign host's
// sidecar to carry and self-enroll with (Task 2/3's `POST /v1/enroll`).
// Unlike a telemetry token (never echoed — `no-creds-in-cli.test.ts`), this
// IS the one secret the operator must copy off the plane host, so printing
// it to stdout is the intended, correct behavior.
//
// IN-PROCESS invocation (not `runCli` child-process): the machine-state
// redirect harness mutates `process.env` in THIS process, and only an
// in-process `runPlane(...)` call honors that redirect. Mirrors the deleted
// `tests/fleet/plane-provision-token.test.ts`'s exit-spy + io-capture idiom
// (see git history at d804e46, task-6-brief.md).
//
// Real filesystem, real temp dirs (.claude/rules/testing.md) — no mocked fs.
// Relative `.js` imports under node16 module resolution (no `@/` alias
// configured).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useMachineStateStore } from '../../../tests/fleet/_machine-state-harness.js';
import { locateMachineState } from '../../machine-state/locate.js';
import { loadFleetRegistry } from '../../plane/fleet-registry.js';
import { runPlane } from '../../subcommands/plane.js';

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
  const root = mkdtempSync(join(base, 'scf-plane-issue-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('stackctl plane issue-enrollment (Task 6)', () => {
  const store = useMachineStateStore();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints a credential, registers it in the fleet registry, and prints it once to stdout', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const io = captureIo();
    try {
      await runPlane(['issue-enrollment', '--label', 'hostB']);

      const { stdout } = io.get();
      const lines = stdout.split('\n').map((line) => line.trim());
      const credentialLine = lines.find((line) => /^[A-Za-z0-9_-]{43}$/.test(line));
      expect(credentialLine).toBeDefined();
      const credential = credentialLine as string;

      const location = locateMachineState(inst.root);
      const registry = loadFleetRegistry(join(location.durableDir, 'plane'));
      expect(registry.enrollmentCredentials().has(credential)).toBe(true);
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
      await expect(runPlane(['issue-enrollment', '--bogus'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('exits 2 when --label is missing its value', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runPlane(['issue-enrollment', '--label'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('exits 2 on a stray positional argument', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runPlane(['issue-enrollment', 'stray'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });
});
