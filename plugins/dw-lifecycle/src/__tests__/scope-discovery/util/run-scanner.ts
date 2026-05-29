/**
 * src/__tests__/scope-discovery/util/run-scanner.ts
 *
 * Shared subprocess-runner used by the scope-discovery adversarial
 * validator harness (Phase 1 Task 3). Each validator spawns its
 * scanner-under-test as a child process and asserts against the
 * captured stdout/stderr + exit code; the spawn pattern is identical
 * across validators, so it lives here.
 *
 * Pattern is one-shot: launch `tsx <entry> <args>`, accumulate
 * stdout/stderr to strings, resolve when the child closes. Stdin is
 * inherited as `ignore` because none of the scanners read from stdin.
 *
 * Ported verbatim from the audiocontrol pilot's
 * `tools/scope-discovery/util/run-scanner.ts`; semantics are unchanged
 * (same stdio config, same accumulation, same null-code rejection,
 * same resolve shape).
 */

import { resolve as resolvePath } from 'node:path';
import { spawn } from 'node:child_process';

export interface ScannerRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunScannerOptions {
  /**
   * Override the subprocess's working directory. When set, the scanner
   * resolves CWD-relative paths (its own report rendering, registry
   * `excludes_paths:` matching) against this directory. The `entry`
   * path is pre-resolved against the parent's CWD so callers can keep
   * passing repo-relative paths regardless of where the child runs.
   */
  readonly cwd?: string;
}

/**
 * Spawn a TypeScript scanner via `tsx` and return its exit code +
 * captured stdout/stderr. The `entry` path is resolved relative to
 * the current working directory; callers pass either the canonical
 * scanner module path or a fixture-stub path for gutted-stub self-
 * checks. When `options.cwd` is set, the subprocess runs with that
 * directory as its CWD — used by adversarial validators that need the
 * scanner to evaluate CWD-relative paths against a fixture root.
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
    const proc = spawn('tsx', [resolvedEntry, ...args], spawnOpts);
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
