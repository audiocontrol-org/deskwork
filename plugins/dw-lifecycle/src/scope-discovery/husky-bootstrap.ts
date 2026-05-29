/**
 * plugins/dw-lifecycle/src/scope-discovery/husky-bootstrap.ts
 *
 * Husky-9 silent-skip mitigation (TF-001). The failure mode: an
 * adopting project lists `husky` in devDependencies and configures
 * `core.hooksPath = .husky/_` via husky's `prepare` script. When a
 * fresh worktree is created without running `npm install`, the
 * `.husky/_` dispatcher directory is missing on disk. Git treats the
 * missing path as "no hooks here" and commits succeed with ZERO hook
 * invocations — including the scope-discovery gate chain we just
 * wired into `.husky/pre-commit`.
 *
 * The install path masks this: `install-scope-discovery-hooks`
 * writes `.husky/pre-commit`, reports `mode=husky` success, and the
 * operator believes the gate is live. The next commit slides through
 * with no gates fired.
 *
 * This module detects the missing dispatcher and bootstraps it by
 * shelling out to `npx --yes husky install` from the target repo.
 * Bootstrap failure is FAIL-LOUD: the installer exits non-zero with
 * the captured npx stdout/stderr and a recovery hint.
 *
 * Module boundary: this file owns only the detection + bootstrap
 * primitives; the install orchestrator in
 * `install-scope-discovery-hooks.ts` calls into here only when its
 * mode resolves to `husky`.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { errorMessage } from './util/typeguards.js';

/**
 * Outcome of attempting to materialize husky's `.husky/_` dispatcher.
 * The runner must capture stdout/stderr so the installer can surface
 * them when bootstrap fails (no silent swallowing of npx output).
 */
export interface HuskyBootstrapAttempt {
  readonly success: boolean;
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export type HuskyBootstrapRunner = (target: string) => HuskyBootstrapAttempt;

/**
 * Read the configured `core.hooksPath` for the target repo, if any.
 * Returns null when:
 *   - target is not a git repo,
 *   - core.hooksPath is unset,
 *   - the git binary is missing.
 *
 * Uses `spawnSync` (not `execSync`) because git emits a non-zero exit
 * status (status=1, stderr=empty) when the config key is unset, and
 * `execSync` throws on that — making "unset" indistinguishable from
 * "git missing" without inspecting the thrown error.
 */
export function readConfiguredHooksPath(target: string): string | null {
  const result = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: target,
    encoding: 'utf8',
  });
  if (result.error !== undefined) return null;
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

/**
 * Detect the husky-9 silent-skip failure mode: `core.hooksPath` is
 * pointed at husky's dispatcher directory (typically `.husky/_`),
 * but the dispatcher directory does not exist on disk because
 * `npm install` hasn't bootstrapped husky yet.
 *
 * Returns the absolute path of the missing dispatcher directory, or
 * null when:
 *   - core.hooksPath isn't set (husky 8 path; hooks under .husky/ root),
 *   - core.hooksPath points at a non-husky dir (`.githooks` etc.),
 *   - the configured dispatcher dir actually exists on disk.
 */
export function detectMissingHuskyDispatcher(target: string): string | null {
  const hooksPath = readConfiguredHooksPath(target);
  if (hooksPath === null) return null;
  // The universal signal: configured hooks path lives under .husky/
  // (which is husky's owned area) and is missing on disk. A non-husky
  // hooksPath (e.g. `.githooks`) doesn't apply.
  if (!hooksPath.startsWith('.husky/') && hooksPath !== '.husky') {
    return null;
  }
  const dispatcherAbsPath = join(target, hooksPath);
  if (existsSync(dispatcherAbsPath)) return null;
  return dispatcherAbsPath;
}

/**
 * Default runner — shells out to `npx --yes husky install` in the
 * target repo. Captures stdout/stderr so a bootstrap failure
 * surfaces the underlying npx output. Treats spawn errors (binary
 * not found, EPERM) as failures with the error message folded into
 * stderr.
 */
export function defaultBootstrapHuskyRunner(
  target: string,
): HuskyBootstrapAttempt {
  const command = 'npx --yes husky install';
  const result = spawnSync('npx', ['--yes', 'husky', 'install'], {
    cwd: target,
    encoding: 'utf8',
  });
  if (result.error !== undefined) {
    const baseStderr = result.stderr ?? '';
    const separator = baseStderr.length > 0 ? '\n' : '';
    return {
      success: false,
      command,
      stdout: result.stdout ?? '',
      stderr: `${baseStderr}${separator}spawn error: ${errorMessage(result.error)}`,
      exitCode: null,
    };
  }
  return {
    success: result.status === 0,
    command,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status,
  };
}

/**
 * Bootstrap husky's `.husky/_` dispatcher when it's missing post-hook-
 * write. Throws when the bootstrap step fails OR when the dispatcher
 * is still missing after the runner reports success — both paths
 * surface the underlying npx output to stderr so the operator can
 * diagnose.
 *
 * No-op when the dispatcher is already present; safe to call
 * unconditionally from the husky install path.
 *
 * In dry-run mode, prints what would happen to stderr but does not
 * invoke the runner. The decision to throw on no-op-missing in
 * non-dry-run mode is the operator-visible signal that the install
 * is incomplete.
 */
export function bootstrapHuskyDispatcherIfMissing(
  target: string,
  runner: HuskyBootstrapRunner,
  dryRun: boolean,
): void {
  const missing = detectMissingHuskyDispatcher(target);
  if (missing === null) return;
  if (dryRun) {
    process.stderr.write(
      `install-scope-discovery-hooks: [dry-run] husky dispatcher missing at ${missing}; would run \`npx --yes husky install\`.\n`,
    );
    return;
  }
  process.stderr.write(
    `install-scope-discovery-hooks: husky dispatcher missing at ${missing}; running \`npx --yes husky install\` to bootstrap.\n`,
  );
  const attempt = runner(target);
  if (!attempt.success) {
    const parts: string[] = [
      `husky dispatcher bootstrap failed: \`${attempt.command}\` exited ` +
        `with status ${attempt.exitCode ?? 'null'}.`,
    ];
    if (attempt.stdout.trim().length > 0) {
      parts.push(`stdout:\n${attempt.stdout.trim()}`);
    }
    if (attempt.stderr.trim().length > 0) {
      parts.push(`stderr:\n${attempt.stderr.trim()}`);
    }
    parts.push(
      'Recovery: run `npm install` manually in the target repo, then ' +
        're-run `dw-lifecycle install-scope-discovery-hooks`.',
    );
    throw new Error(parts.join('\n'));
  }
  const stillMissing = detectMissingHuskyDispatcher(target);
  if (stillMissing !== null) {
    throw new Error(
      `husky bootstrap reported success but ${stillMissing} still missing — ` +
        'run `npm install` manually then re-run `dw-lifecycle ' +
        'install-scope-discovery-hooks`.',
    );
  }
}
