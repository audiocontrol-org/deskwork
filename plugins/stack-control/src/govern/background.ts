/**
 * plugins/stack-control/src/govern/background.ts
 *
 * impl:fix/audit-barrage-cc-timeout — detached background launch + status for
 * `stackctl govern`.
 *
 * The bug this fixes: a govern pass (frontier-model audit-barrage rounds ×
 * chunked payloads × convergence loops) routinely runs 10+ minutes, but when
 * an agent invokes `stackctl govern` as a blocking FOREGROUND process inside a
 * Claude Code Bash tool call, the harness kills it once the run exceeds the
 * Bash-tool timeout ceiling (max 600s). The foreground invocation couples
 * govern's lifetime to a single Bash-tool call.
 *
 * The fix decouples them. `govern --background`:
 *   - forks a DETACHED runner into its own session (`detached: true` +
 *     `unref()`), so a harness kill of the launcher's process group does NOT
 *     reach the runner, and
 *   - returns IMMEDIATELY with a handle (exit 0 = "launched", NOT the gate
 *     verdict).
 * The runner (`govern --__bg-run <dir>`) runs the real govern to completion,
 * streaming its output to `govern.log`, and records the govern exit code in
 * `result.json`. `govern --status <handle>` polls the handle and relays the
 * eventual gate verdict — running while the run is in flight (EX_TEMPFAIL 75,
 * so a poll loop retries), the recorded govern exit code once complete.
 *
 * Everything with an external effect (process spawn, foreground run,
 * pid-liveness probe, wall-clock) is a dependency-injection seam so the
 * launcher / runner / status contract is unit-tested without real
 * long-running processes.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Path (under `<installation>/.stack-control/`) of the background handle store. */
export const BACKGROUND_SUBDIR = 'govern/background';

/**
 * Status exit code for an in-flight run: EX_TEMPFAIL (sysexits) — "not ready,
 * try again later". A `--status` poll loop treats it as "keep polling", never
 * as a gate verdict.
 */
export const STATUS_RUNNING_EXIT = 75;

export type BackgroundRunState = 'completed' | 'running' | 'died' | 'unknown';

export interface BackgroundClassification {
  readonly state: BackgroundRunState;
  readonly exitCode: number;
}

/** The persisted launch record (`handle.json`). */
export interface BackgroundHandle {
  readonly handle: string;
  readonly governArgs: readonly string[];
  readonly cwd: string;
  readonly startedAt: string;
  readonly pid: number;
  readonly logPath: string;
}

/** The persisted completion record (`result.json`), written by the runner. */
export interface BackgroundResult {
  readonly exitCode: number;
  readonly signal?: string;
  readonly finishedAt: string;
}

/**
 * The single classification rule the status verb relays. A run is `completed`
 * the instant `result.json` exists (its recorded govern exit code is the gate
 * verdict); otherwise a live pid means `running`; a dead pid with no result is
 * a `died` crash (fatal — NEVER silently reported as done); a missing handle is
 * `unknown` (fatal).
 */
export function classifyBackgroundRun(input: {
  readonly handleExists: boolean;
  readonly resultExitCode: number | null;
  readonly pidAlive: boolean;
}): BackgroundClassification {
  if (!input.handleExists) return { state: 'unknown', exitCode: 2 };
  if (input.resultExitCode !== null) {
    return { state: 'completed', exitCode: input.resultExitCode };
  }
  if (input.pidAlive) return { state: 'running', exitCode: STATUS_RUNNING_EXIT };
  return { state: 'died', exitCode: 2 };
}

// src/govern → src → plugin root → bin/stackctl. Computed locally (not imported
// from govern-vars) to keep this module's import graph light.
const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..', '..');
function defaultStackctlBin(): string {
  return join(PLUGIN_ROOT, 'bin', 'stackctl');
}

function backgroundStore(installationRoot: string): string {
  return join(installationRoot, '.stack-control', BACKGROUND_SUBDIR);
}

function encodeHandleId(now: Date, randSuffix: string): string {
  return `${now.toISOString().replace(/[:.]/g, '-')}-${randSuffix}`;
}

// ---- launcher ----

export interface LaunchDeps {
  /** Working directory the runner (and thus the real govern) executes in. */
  readonly cwd?: string;
  readonly now?: () => Date;
  readonly randSuffix?: () => string;
  /** Spawn seam — defaults to a real detached, unref'd child. */
  readonly spawnDetached?: (
    cmd: string,
    args: readonly string[],
    opts: { readonly cwd: string; readonly detached: boolean },
  ) => { pid: number };
  /** `[bin, ...leadingArgs]` for the runner; default `[stackctl, govern, --__bg-run]`. */
  readonly runnerCmd?: readonly string[];
}

function realSpawnDetached(
  cmd: string,
  args: readonly string[],
  opts: { readonly cwd: string; readonly detached: boolean },
): { pid: number } {
  const child = spawn(cmd, [...args], {
    cwd: opts.cwd,
    detached: opts.detached,
    stdio: 'ignore',
  });
  child.unref();
  return { pid: child.pid ?? -1 };
}

/**
 * Create a handle dir, fork a detached runner pointed at it, and return the
 * handle record — WITHOUT waiting for govern to finish. `--background` is
 * stripped from the forwarded govern args so the detached runner cannot
 * re-background itself (no fork bomb).
 */
export function runBackgroundLaunch(
  rawGovernArgs: readonly string[],
  installationRoot: string,
  deps: LaunchDeps = {},
): BackgroundHandle {
  const now = (deps.now ?? (() => new Date()))();
  const randSuffix = (deps.randSuffix ?? (() => Math.random().toString(36).slice(2, 6)))();
  const spawnDetached = deps.spawnDetached ?? realSpawnDetached;
  const [runnerBin, ...runnerLead] = deps.runnerCmd ?? [
    defaultStackctlBin(),
    'govern',
    '--__bg-run',
  ];
  if (runnerBin === undefined) {
    throw new Error('runBackgroundLaunch: empty runnerCmd (no runner binary)');
  }
  const cwd = deps.cwd ?? process.cwd();

  const governArgs = rawGovernArgs.filter((a) => a !== '--background');
  const handle = encodeHandleId(now, randSuffix);
  const handleDir = join(backgroundStore(installationRoot), handle);
  mkdirSync(handleDir, { recursive: true });
  const logPath = join(handleDir, 'govern.log');
  const startedAt = now.toISOString();

  // Persist BEFORE spawning so the detached runner can read `governArgs` even
  // if it boots faster than the post-spawn pid write (race-free).
  const record: BackgroundHandle = { handle, governArgs, cwd, startedAt, pid: -1, logPath };
  writeHandle(handleDir, record);

  const { pid } = spawnDetached(runnerBin, [...runnerLead, handleDir], {
    cwd,
    detached: true,
  });

  const withPid: BackgroundHandle = { ...record, pid };
  writeHandle(handleDir, withPid);
  return withPid;
}

function writeHandle(handleDir: string, record: BackgroundHandle): void {
  writeFileSync(join(handleDir, 'handle.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

// ---- runner ----

export interface RunnerDeps {
  readonly now?: () => Date;
  /** `[bin, ...leadingArgs]` for the govern child; default `[stackctl, govern]`. */
  readonly governCmd?: readonly string[];
  /** Foreground-run seam — defaults to a real blocking spawnSync streaming to the log. */
  readonly runGovernForeground?: (input: {
    readonly cmd: readonly string[];
    readonly governArgs: readonly string[];
    readonly cwd: string;
    readonly logPath: string;
  }) => { status: number | null; signal: string | null };
}

function realRunGovernForeground(input: {
  readonly cmd: readonly string[];
  readonly governArgs: readonly string[];
  readonly cwd: string;
  readonly logPath: string;
}): { status: number | null; signal: string | null } {
  // Test/smoke seam: STACKCTL_BG_GOVERN_CMD replaces the govern command with a
  // fake, so the real detached chain can be exercised without frontier CLIs.
  const override = process.env.STACKCTL_BG_GOVERN_CMD;
  const [bin, ...lead] =
    override !== undefined && override.length > 0 ? override.split(/\s+/) : input.cmd;
  if (bin === undefined) {
    throw new Error('runBackgroundRunner: empty govern command');
  }
  const fd = openSync(input.logPath, 'a');
  try {
    const r = spawnSync(bin, [...lead, ...input.governArgs], {
      cwd: input.cwd,
      stdio: ['ignore', fd, fd],
    });
    return { status: r.status, signal: r.signal };
  } finally {
    closeSync(fd);
  }
}

/**
 * Run the real govern to completion (streaming to `govern.log`) and record its
 * exit code in `result.json`. Runs BLOCKING on purpose — the runner is
 * detached from the launcher, so nothing external kills it. A signal-killed
 * govern child records a NON-ZERO exit, never 0.
 */
export function runBackgroundRunner(handleDir: string, deps: RunnerDeps = {}): BackgroundResult {
  const now = (deps.now ?? (() => new Date()))();
  const governCmd = deps.governCmd ?? [defaultStackctlBin(), 'govern'];
  const runGovernForeground = deps.runGovernForeground ?? realRunGovernForeground;

  const handle = readHandle(handleDir);
  if (handle === null) {
    throw new Error(`govern --__bg-run: no handle.json under '${handleDir}'`);
  }

  const { status, signal } = runGovernForeground({
    cmd: governCmd,
    governArgs: handle.governArgs,
    cwd: handle.cwd,
    logPath: handle.logPath,
  });

  const exitCode = status !== null ? status : signal !== null ? 137 : 1;
  const result: BackgroundResult = {
    exitCode,
    ...(signal !== null ? { signal } : {}),
    finishedAt: now.toISOString(),
  };
  writeFileSync(join(handleDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

// ---- status ----

export interface StatusDeps {
  readonly pidAlive?: (pid: number) => boolean;
}

export interface BackgroundStatusReport {
  readonly handle: string;
  readonly classification: BackgroundClassification;
  readonly runDir?: string;
  readonly logPath: string;
  readonly text: string;
}

function realPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH — gone. EPERM — alive but not ours (still alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Read a handle dir and classify the run. `runDir` is parsed from the govern
 * log (the `govern: barrage run-dir = …` line) for operator triage.
 */
export function readBackgroundStatus(
  handleDir: string,
  deps: StatusDeps = {},
): BackgroundStatusReport {
  const pidAlive = deps.pidAlive ?? realPidAlive;
  const handle = readHandle(handleDir);
  if (handle === null) {
    const classification = classifyBackgroundRun({
      handleExists: false,
      resultExitCode: null,
      pidAlive: false,
    });
    return {
      handle: handleDir,
      classification,
      logPath: '',
      text: `govern --status: unknown handle '${handleDir}'`,
    };
  }

  const result = readResult(handleDir);
  const resultExitCode = result?.exitCode ?? null;
  const alive = resultExitCode === null ? pidAlive(handle.pid) : false;
  const classification = classifyBackgroundRun({
    handleExists: true,
    resultExitCode,
    pidAlive: alive,
  });
  const runDir = parseRunDir(handle.logPath);
  return {
    handle: handle.handle,
    classification,
    ...(runDir !== undefined ? { runDir } : {}),
    logPath: handle.logPath,
    text: renderStatusText(handle, classification, runDir),
  };
}

function renderStatusText(
  handle: BackgroundHandle,
  classification: BackgroundClassification,
  runDir: string | undefined,
): string {
  const lines = [`govern --status ${handle.handle}: ${classification.state}`];
  if (classification.state === 'running') {
    lines.push(`  still running (pid ${handle.pid}); poll again.`);
  } else if (classification.state === 'completed') {
    lines.push(
      `  gate verdict: exit ${classification.exitCode} (${classification.exitCode === 0 ? 'may-graduate' : classification.exitCode === 1 ? 'REFUSED' : 'fatal'}).`,
    );
  } else if (classification.state === 'died') {
    lines.push(`  govern exited without recording a result (crashed). See the log.`);
  }
  lines.push(`  log: ${handle.logPath}`);
  if (runDir !== undefined) lines.push(`  barrage run-dir: ${runDir}`);
  return lines.join('\n');
}

function parseRunDir(logPath: string): string | undefined {
  if (!existsSync(logPath)) return undefined;
  const m = /^govern: barrage run-dir = (.+)$/m.exec(readFileSync(logPath, 'utf8'));
  const captured = m?.[1];
  return captured !== undefined ? captured.trim() : undefined;
}

/**
 * Resolve the handle dir for a status query: an explicit handle id, else the
 * NEWEST launch (the just-fired run). Returns undefined for an unknown / empty
 * store.
 */
export function resolveHandleDir(
  installationRoot: string,
  handle: string | undefined,
): string | undefined {
  const store = backgroundStore(installationRoot);
  if (handle !== undefined && handle.length > 0) {
    const dir = join(store, handle);
    return existsSync(join(dir, 'handle.json')) ? dir : undefined;
  }
  if (!existsSync(store)) return undefined;
  const candidates = readdirSync(store)
    .map((name) => join(store, name))
    .filter((dir) => existsSync(join(dir, 'handle.json')));
  const [first, ...rest] = candidates;
  if (first === undefined) return undefined;
  let newest = first;
  let newestStarted = handleStartedAt(newest);
  for (const dir of rest) {
    const started = handleStartedAt(dir);
    if (started > newestStarted) {
      newest = dir;
      newestStarted = started;
    }
  }
  return newest;
}

function handleStartedAt(handleDir: string): number {
  const handle = readHandle(handleDir);
  if (handle !== null) {
    const t = Date.parse(handle.startedAt);
    if (Number.isFinite(t)) return t;
  }
  return statSync(join(handleDir, 'handle.json')).mtimeMs;
}

function readHandle(handleDir: string): BackgroundHandle | null {
  const path = join(handleDir, 'handle.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as BackgroundHandle;
}

function readResult(handleDir: string): BackgroundResult | null {
  const path = join(handleDir, 'result.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as BackgroundResult;
}
