// specs/037-instance-observability (plan: docs/superpowers/plans/
// 2026-07-20-fleet-multihost-enrollment.md) — Task 7.
//
// `plane revoke (--token <t> | --enrollment <e>)` revokes a telemetry token
// (an instance stops being accepted) or an enrollment credential (no new
// enrollment from that host). Exactly one of the two flags is required —
// both or neither is a usage error (exit 2), mirroring
// `plane-issue-enrollment.test.ts`'s strict-arg contract.
//
// SCOPE NOTE: revocation is written to the registry (`enrollment.json`) and
// takes effect at the NEXT `plane serve` — the running plane snapshots its
// accepted set at startup (see `buildServeRuntime`). Live revocation
// without restart is a named follow-on in the design's Scope Boundary, not
// implemented here or tested here.
//
// IN-PROCESS invocation (not `runCli` child-process): the machine-state
// redirect harness mutates `process.env` in THIS process, and only an
// in-process `runPlane(...)` call honors that redirect. Mirrors
// `plane-issue-enrollment.test.ts`'s exit-spy + io-capture idiom.
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
  const root = mkdtempSync(join(base, 'scf-plane-revoke-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('stackctl plane revoke (Task 7)', () => {
  const store = useMachineStateStore();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revokes a telemetry token: exit 0, no secret echoed, registry reflects the revocation', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);

    const location = locateMachineState(inst.root);
    const seedRegistry = loadFleetRegistry(join(location.durableDir, 'plane'));
    seedRegistry.addCredential('cred-1', 'h');
    const outcome = seedRegistry.enroll('cred-1', { installationId: 'i', host: 'h', path: '/p' });
    if (!outcome.ok) throw new Error('test setup: enroll failed');
    const token = outcome.token;

    const io = captureIo();
    try {
      await runPlane(['revoke', '--token', token]);

      const { stdout } = io.get();
      expect(stdout).not.toContain(token);
      expect(stdout).toContain('revoked');

      const registry = loadFleetRegistry(join(location.durableDir, 'plane'));
      expect(registry.revokedTokens().has(token)).toBe(true);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('revokes an enrollment credential: exit 0, no future enrollment from it', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);

    const location = locateMachineState(inst.root);
    const seedRegistry = loadFleetRegistry(join(location.durableDir, 'plane'));
    seedRegistry.addCredential('cred-1', 'h');

    const io = captureIo();
    try {
      await runPlane(['revoke', '--enrollment', 'cred-1']);

      const { stdout } = io.get();
      expect(stdout).not.toContain('cred-1');
      expect(stdout).toContain('revoked');

      const registry = loadFleetRegistry(join(location.durableDir, 'plane'));
      expect(registry.enrollmentCredentials().has('cred-1')).toBe(false);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('exits 2 when both --token and --enrollment are given', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runPlane(['revoke', '--token', 'x', '--enrollment', 'y'])).rejects.toThrow(
        ProcessExitSignal,
      );
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('exits 2 when neither --token nor --enrollment is given', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runPlane(['revoke'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('exits 2 on an unknown flag', async () => {
    store();
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();
    process.chdir(inst.root);
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runPlane(['revoke', '--bogus'])).rejects.toThrow(ProcessExitSignal);
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
      await expect(runPlane(['revoke', '--token', 'x', 'stray'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
      process.chdir(originalCwd);
      inst.dispose();
    }
  });
});
