/**
 * plugins/stack-control/src/__tests__/scope-discovery/util/run-scanner.ts
 *
 * Shared subprocess-runner used by the scope-discovery US2 tests. Each
 * test spawns the CLI dispatcher (or a scanner entry) as a child process
 * and asserts against the captured stdout/stderr + exit code; the spawn
 * pattern is identical across tests, so it lives here.
 *
 * Ported from the dw-lifecycle harness; the one stack-control adaptation
 * (010) is the tsx resolution: dw-lifecycle spawned bare `tsx` (on PATH);
 * stack-control resolves `node_modules/.bin/tsx` by walking up from the
 * plugin root (mirroring `_run-helpers.resolveTsx` + `bin/stackctl`), so
 * the spawn works whether npm hoisted tsx to the monorepo root or nested
 * it plugin-local.
 */

import { resolve as resolvePath } from 'node:path';
import { spawn } from 'node:child_process';
import { resolveTsx } from '../../_run-helpers.js';

export interface ScannerRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunScannerOptions {
  /**
   * Override the subprocess's working directory. When set, the scanner
   * resolves CWD-relative paths against this directory. The `entry`
   * path is pre-resolved against the parent's CWD so callers can keep
   * passing repo-relative paths regardless of where the child runs.
   */
  readonly cwd?: string;
}

/**
 * Spawn a TypeScript scanner via `tsx` and return its exit code +
 * captured stdout/stderr. The `entry` path is resolved relative to
 * the current working directory. When `options.cwd` is set, the
 * subprocess runs with that directory as its CWD.
 */
export function runScannerSubprocess(
  entry: string,
  args: readonly string[],
  options: RunScannerOptions = {},
): Promise<ScannerRun> {
  return new Promise((resolveP, rejectP) => {
    const resolvedEntry = resolvePath(entry);
    const spawnOpts: { stdio: readonly ['ignore', 'pipe', 'pipe']; cwd?: string } = {
      stdio: ['ignore', 'pipe', 'pipe'],
    };
    if (options.cwd !== undefined) spawnOpts.cwd = options.cwd;
    const proc = spawn(resolveTsx(), [resolvedEntry, ...args], spawnOpts);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', rejectP);
    proc.on('close', (code) => {
      if (code === null) {
        rejectP(new Error(`scanner terminated by signal; stderr:\n${stderr}`));
        return;
      }
      resolveP({ code, stdout, stderr });
    });
  });
}
