// specs/037-instance-observability (plan: docs/superpowers/plans/
// 2026-07-20-fleet-multihost-enrollment.md) — Task 8.
//
// `sidecar set-enrollment --token <cred>` stores the operator-issued
// enrollment credential into HOST-LEVEL custody (`locateHostState().durableDir`,
// shared across every installation on the host — see
// `src/machine-state/enrollment-custody.ts`'s module header), so a later
// `sidecar run` can self-enroll (Task 10). Unlike `sidecar run` this verb does
// NOT resolve an installation root — it writes host state directly — but the
// machine-state redirect harness is still REQUIRED so the write lands in the
// redirected host durable dir, not a real developer's $HOME (T009 tripwire).
//
// IN-PROCESS invocation (not `runCli` child-process), mirroring
// `plane-revoke.test.ts`'s exit-spy + io-capture idiom.
//
// Real filesystem, real temp dirs (.claude/rules/testing.md) — no mocked fs.
// Relative `.js` imports under node16 module resolution (no `@/` alias
// configured).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMachineStateStore } from '../../../tests/fleet/_machine-state-harness.js';
import { openEnrollmentCustody } from '../../machine-state/enrollment-custody.js';
import { locateHostState } from '../../machine-state/locate.js';
import { runSidecar } from '../../subcommands/sidecar.js';

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

describe('stackctl sidecar set-enrollment (Task 8)', () => {
  const store = useMachineStateStore();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the credential in host-level custody: exit 0, no secret echoed, read() reflects it', async () => {
    store();
    const io = captureIo();
    try {
      await runSidecar(['set-enrollment', '--token', 'cred-xyz']);

      const { stdout } = io.get();
      expect(stdout).not.toContain('cred-xyz');
      expect(stdout).toContain('stored');

      const custody = openEnrollmentCustody(locateHostState().durableDir);
      expect(custody.read()).toBe('cred-xyz');
    } finally {
      io.restore();
    }
  });

  it('exits 2 when --token is missing', async () => {
    store();
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runSidecar(['set-enrollment'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
    }
  });

  it('exits 2 when --token is given without a value', async () => {
    store();
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(runSidecar(['set-enrollment', '--token'])).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
    }
  });

  it('exits 2 when --token value looks like a flag', async () => {
    store();
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(
        runSidecar(['set-enrollment', '--token', '--bogus']),
      ).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
    }
  });

  it('exits 2 on an unknown flag', async () => {
    store();
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(
        runSidecar(['set-enrollment', '--token', 'x', '--bogus']),
      ).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
    }
  });

  it('exits 2 on a stray positional argument', async () => {
    store();
    const exitSpy = spyExit();
    const io = captureIo();
    try {
      await expect(
        runSidecar(['set-enrollment', '--token', 'x', 'stray']),
      ).rejects.toThrow(ProcessExitSignal);
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      io.restore();
    }
  });
});
