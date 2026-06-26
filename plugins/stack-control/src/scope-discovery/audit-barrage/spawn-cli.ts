/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts
 *
 * Wraps `child_process.spawn` for a single CLI model invocation.
 *
 * Behavior contract (specs/014-audit-barrage-reliability + the original
 * audit-barrage-cli-notes.md):
 *
 *   - stdin is closed (`stdio: ['ignore', ...]`) unless the lane uses
 *     `{{prompt-stdin}}` delivery; every supported CLI waits on open
 *     stdin and emits warnings otherwise.
 *   - argv assembly substitutes the lane's explicit `{{model}}` pin
 *     (FR-001) and injects the lane's `readonly_enforcement` fragment
 *     before the prompt placeholder (FR-003) — selected by config
 *     capability fields, never by binary name (Principle III).
 *   - the timeout budget is ARMED FROM THE CALLER-SUPPLIED basis
 *     (`SpawnInput.timeoutBasis`, derived per FR-002); on expiry:
 *     SIGTERM, then SIGKILL after a 5-second grace.
 *   - a monitored lane (liveness_signal != none) runs under the
 *     in-process watchdog (FR-008): no pulse inside the window →
 *     SIGTERM/SIGKILL and the `killed-no-liveness` terminal state.
 *     The watchdog disarms when the timeout kill begins, and vice
 *     versa — `timed-out` and `killed-no-liveness` are disjoint by
 *     construction; a clean `close` arriving first settles `completed`
 *     (single-settle `finish()`). A close carrying a non-null signal
 *     with NO wrapper kill in flight settles `killed-external` — the
 *     child was terminated out-of-band (OOM killer, external
 *     SIGTERM/SIGKILL; AUDIT-20260611-13) and is never `completed`.
 *   - text lanes stream stdout to `stdoutPath` (the per-model markdown
 *     artifact). stream-json lanes feed stdout through the result
 *     extractor: NDJSON lines land in `eventsPath` (forensics) and the
 *     terminal result event's text is written to `stdoutPath` at a
 *     completed settle — byte-for-byte the artifact lift consumes
 *     (FR-010). A killed stream lane leaves the artifact ABSENT.
 *   - stderr always streams to `stderrPath`.
 *   - Spawn failure (ENOENT, etc.) settles `spawn-failed` with
 *     `exitCode: -2` and `spawnError` populated. The orchestrator
 *     surfaces the failure in the INDEX without aborting siblings.
 *
 * Argument substitution: `argsTemplate` is split on whitespace BEFORE
 * placeholders are replaced. Splitting after would mangle prompts that
 * contain whitespace; splitting before keeps the prompt as a single
 * argv element regardless of its content. Tokens that EQUAL a
 * placeholder become the substitution verbatim; tokens that CONTAIN
 * one as a substring (e.g. `--model={{model}}`) get intra-token
 * literal replacement.
 *
 * Stream-write failures (disk full, permission, etc.) propagate as
 * thrown errors — filesystem corruption is fatal and the orchestrator
 * is allowed to crash. Stream `'error'` handlers are attached at
 * stream-creation time so the process never crashes mid-run with an
 * unattended event.
 *
 * Settle event: completion logic fires on `child.on('close', ...)`
 * (not `'exit'`). `'exit'` fires when the process terminates but
 * stdio pipes may still have undelivered buffered data; `'close'`
 * fires only after all stdio streams have closed — which is the
 * event we need to be sure no in-flight stdout chunk is dropped.
 * Every settle path (timeout, liveness kill, spawn-error, normal
 * exit) clears both timers and disarms the watchdog via `finish()`
 * so no timer leaks past the resolution of the returned Promise.
 */

import { spawn } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { Readable, Writable } from 'node:stream';
import { errorMessage } from '../util/typeguards.js';
import { createStreamResultExtractor } from './stream-result-extractor.js';
import { startWatchdog, type Watchdog } from './watchdog.js';
import { deriveLivenessWindowSeconds } from './timeout-derivation.js';
import {
  isLaneEnforced,
  type EnforcementState,
  type LivenessState,
  type ModelConfig,
  type ModelRunResult,
  type TerminalState,
  type TimeoutBasis,
} from './types.js';

const SIGKILL_GRACE_MS = 5000;

/**
 * Build the operator-facing classifier for a spawn-time E2BIG error.
 * The OS rejects argv+env exceeding ARG_MAX before the child exists;
 * the only viable cure is moving prompt delivery off argv. Surfacing
 * `{{prompt-stdin}}` by name (plus the issue + MIGRATING reference)
 * lets the operator fix the config without reading source. Exported
 * for tests so the contract is independently pinned.
 */
export function classifyE2BIGSpawnError(promptBytes: number, raw: string): string {
  return (
    `spawn E2BIG: prompt of ${promptBytes} bytes exceeds OS argv limit (ARG_MAX). ` +
    `Switch the args_template placeholder from '{{prompt}}' to '{{prompt-stdin}}' ` +
    `to deliver the prompt via child stdin instead of argv — bypasses the limit ` +
    `entirely. See https://github.com/audiocontrol-org/deskwork/issues/397 + MIGRATING.md. ` +
    `Underlying error: ${raw}`
  );
}

function isE2BIG(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { code?: unknown; message?: unknown };
  if (candidate.code === 'E2BIG') return true;
  if (typeof candidate.message === 'string' && candidate.message.includes('E2BIG')) return true;
  return false;
}

/**
 * The structural slice of `ChildProcess` the spawn wrapper consumes.
 * Tests inject fake children through `SpawnInput.spawnImpl` to pin the
 * kill-vs-close interlocks deterministically (fake timers); the real
 * `spawn` return satisfies this shape.
 */
export interface BarrageChild {
  readonly stdin: Writable | null;
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'error', listener: (err: Error) => void): this;
  on(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
}

export type BarrageSpawnFn = (
  binary: string,
  args: ReadonlyArray<string>,
  options: { readonly stdio: ['pipe' | 'ignore', 'pipe', 'pipe'] },
) => BarrageChild;

const defaultSpawn: BarrageSpawnFn = (binary, args, options) =>
  spawn(binary, [...args], { stdio: options.stdio });

/**
 * Inputs to a single CLI subprocess invocation. The orchestrator
 * constructs one of these per model per run.
 *
 * `timeoutBasis` is the derived (or operator-override) budget for THIS
 * payload (FR-002) — the spawn arms `effectiveTimeoutSeconds`, never a
 * raw config field. `eventsPath` is the NDJSON forensic capture target
 * for stream-json lanes (unused by text lanes); the extractor creates
 * the file lazily on the first captured line, and the result records
 * the path only when a capture was actually written
 * (AUDIT-20260611-21).
 */
export interface SpawnInput {
  readonly model: ModelConfig;
  readonly prompt: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly eventsPath: string;
  readonly timeoutBasis: TimeoutBasis;
  readonly spawnImpl?: BarrageSpawnFn;
}

/**
 * Spawn one model and capture its output. Always resolves (never
 * rejects on spawn / runtime errors) so the orchestrator's
 * `Promise.all` doesn't get short-circuited by a single failure.
 *
 * Filesystem write errors on the capture streams DO propagate as
 * thrown errors — see file header.
 */
export async function spawnCliAgainstModel(
  input: SpawnInput,
): Promise<ModelRunResult> {
  const model = input.model;
  const args = buildArgs(model, input.prompt);
  const streamMode = model.outputMode === 'stream-json';
  // AUDIT-20260611-17 defense-in-depth: enforcement marking mirrors what
  // buildArgs ACTUALLY injects, not the sentinel comparison alone. The
  // config loader refuses whitespace-only fragments at load, but a
  // ModelConfig constructed outside the loader could still carry one —
  // buildArgs trims/splits it to zero tokens and injects nothing, so
  // marking that lane `enforced` would lie on every downstream surface
  // (FR-004). `enforced` requires >= 1 real fragment token. The condition
  // is the shared `isLaneEnforced` predicate (AUDIT-20260611-19) so this
  // derivation and the fire-time warning loop cannot diverge.
  const enforcement: EnforcementState = isLaneEnforced(model)
    ? 'enforced'
    : 'unenforced';
  const monitored = model.livenessSignal !== 'none';
  if (monitored && model.livenessWindowSeconds === undefined) {
    // The config loader refuses this shape; a lane constructed outside the
    // loader without a window cannot be monitored honestly (Principle V).
    throw new Error(
      `audit-barrage spawn: lane '${model.name}' declares liveness_signal ` +
        `'${model.livenessSignal}' without liveness_window_seconds — cannot arm ` +
        `the watchdog (FR-008)`,
    );
  }
  const liveness: LivenessState = monitored ? 'monitored' : 'unmonitored';
  // TASK-324: scale the watchdog window with payload in lockstep with the kill-cap, so a
  // large payload (long contiguous thinking span on a healthy lane) does not trip a fixed
  // window and false-kill. Recorded below as the EFFECTIVE window the watchdog actually
  // used (honest run artifact), not the unscaled config base.
  const effectiveLivenessWindowSeconds =
    model.livenessWindowSeconds !== undefined
      ? deriveLivenessWindowSeconds(model.livenessWindowSeconds, input.timeoutBasis)
      : undefined;

  // Text lanes stream stdout straight to the artifact path. Stream lanes
  // defer the artifact write to settle (result-event extraction) so a
  // killed lane leaves NO fabricated <model>.md (FR-010 / Principle V).
  const stdoutStream = streamMode ? null : createWriteStream(input.stdoutPath);
  const stderrStream = createWriteStream(input.stderrPath);
  const extractor = streamMode ? createStreamResultExtractor(input.eventsPath) : null;
  const start = Date.now();

  return new Promise<ModelRunResult>((resolveResult, rejectResult) => {
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let killReason: 'timeout' | 'liveness' | null = null;
    let stalenessAtKillMs: number | undefined;
    let sigkillTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let watchdog: Watchdog | null = null;
    let settled = false;

    // Attach stream `'error'` handlers immediately after stream
    // creation — write errors mid-run (disk full, permission denied,
    // EPIPE on early consumer close) must reject the run instead of
    // crashing the process via an uncaught event.
    const onStreamError = (err: Error): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      watchdog?.disarm();
      rejectResult(err);
    };
    stdoutStream?.on('error', onStreamError);
    stderrStream.on('error', onStreamError);

    function clearTimers(): void {
      if (sigkillTimer !== null) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    }

    interface SettleCore {
      readonly exitCode: number;
      readonly spawnError?: string;
    }

    const finish = (core: SettleCore, terminalState: TerminalState) => {
      if (settled) return;
      settled = true;
      clearTimers();
      watchdog?.disarm();
      void settleCaptures(core, terminalState).then(resolveResult).catch(rejectResult);
    };

    async function settleCaptures(
      core: SettleCore,
      terminalState: TerminalState,
    ): Promise<ModelRunResult> {
      let reportBytes = 0;
      let eventsCaptured = false;
      if (extractor !== null) {
        const extraction = await extractor.settle();
        eventsCaptured = extraction.eventsCaptured;
        if (extraction.resultText !== null) {
          await writeFile(input.stdoutPath, extraction.resultText, 'utf8');
          reportBytes = Buffer.byteLength(extraction.resultText, 'utf8');
        }
      }
      if (stdoutStream !== null) {
        await endStream(stdoutStream);
        reportBytes = stdoutBytes;
      }
      await endStream(stderrStream);
      return {
        name: model.name,
        exitCode: core.exitCode,
        durationMs: Date.now() - start,
        stdoutBytes,
        stderrBytes,
        reportBytes,
        stdoutPath: input.stdoutPath,
        stderrPath: input.stderrPath,
        timedOut: killReason === 'timeout',
        ...(core.spawnError !== undefined ? { spawnError: core.spawnError } : {}),
        terminalState,
        enforcement,
        liveness,
        ...(effectiveLivenessWindowSeconds !== undefined
          ? { livenessWindowSeconds: effectiveLivenessWindowSeconds }
          : {}),
        ...(stalenessAtKillMs !== undefined ? { stalenessAtKillMs } : {}),
        timeoutBasis: input.timeoutBasis,
        // AUDIT-20260611-21: the extractor creates the events file LAZILY
        // on the first consumed line, so a spawn-failed stream lane (no
        // chunk ever arrived) or a zero-stdout stream lane has NO file on
        // disk. Recording eventsPath anyway would make renderModelRow emit
        // an INDEX `- events path:` row naming a nonexistent file — the
        // field is present only when a capture was actually written.
        ...(streamMode && eventsCaptured ? { eventsPath: input.eventsPath } : {}),
      };
    }

    // Phase 19 Task 1 (GH #386): {{prompt-stdin}} delivers the prompt
    // via child.stdin instead of argv — bypasses the OS ARG_MAX limit
    // (~256KB on macOS) that would otherwise fail with spawn E2BIG on
    // large diffs.
    //
    // Phase 12 Task 8 (#397): wrap spawn in try/catch — when the OS
    // rejects argv+env before the child is created (E2BIG, EMFILE,
    // ENAMETOOLONG), `spawn()` throws SYNCHRONOUSLY. The async
    // `child.on('error', ...)` handler does NOT catch these cases.
    const useStdin = model.argsTemplate.includes('{{prompt-stdin}}');
    const spawnImpl = input.spawnImpl ?? defaultSpawn;
    let child: BarrageChild;
    try {
      child = spawnImpl(model.binary, args, {
        stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reportSpawnError(err);
      return;
    }
    if (useStdin && child.stdin !== null) {
      // EPIPE if the child exits before reading the prompt — common
      // when the child rejects the prompt or crashes early. Don't
      // crash the orchestrator; the close event will surface the
      // child's actual outcome via exitCode.
      child.stdin.on('error', () => {});
      child.stdin.end(input.prompt);
    }

    // ENOENT / permission denied / etc. — record as spawn error and
    // return without aborting siblings. Both spawn-error paths
    // (synchronous throw from spawn(), and async child.on('error')
    // emission) produce a structurally identical settle; classify
    // E2BIG specifically so the operator gets the {{prompt-stdin}}
    // migration cue regardless of which path the OS uses (#397).
    child.on('error', reportSpawnError);

    function reportSpawnError(err: unknown): void {
      const classified = isE2BIG(err)
        ? classifyE2BIGSpawnError(Buffer.byteLength(input.prompt, 'utf8'), errorMessage(err))
        : errorMessage(err);
      finish({ exitCode: -2, spawnError: classified }, 'spawn-failed');
    }

    function killChild(): void {
      child.kill('SIGTERM');
      sigkillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, SIGKILL_GRACE_MS);
    }

    if (child.stdout === null || child.stderr === null) {
      // Unreachable with our stdio tuple; guard for injected children.
      finish(
        { exitCode: -2, spawnError: 'spawn returned a child without piped stdio' },
        'spawn-failed',
      );
      return;
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (extractor !== null) extractor.onChunk(chunk);
      else stdoutStream?.write(chunk);
      if (model.livenessSignal === 'stdout') watchdog?.activity();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      stderrStream.write(chunk);
      if (model.livenessSignal === 'stderr') watchdog?.activity();
    });

    // FR-002: the budget is the caller-derived basis, never a raw
    // config field. The timeout kill disarms the watchdog so
    // `timed-out` and `killed-no-liveness` stay disjoint.
    timeoutTimer = setTimeout(() => {
      if (settled || killReason !== null) return;
      killReason = 'timeout';
      watchdog?.disarm();
      killChild();
    }, input.timeoutBasis.effectiveTimeoutSeconds * 1000);

    // FR-008: arm the watchdog AFTER the pulse handlers exist. A stale
    // pulse kills early and disarms the timeout path.
    if (monitored && effectiveLivenessWindowSeconds !== undefined) {
      watchdog = startWatchdog({
        windowSeconds: effectiveLivenessWindowSeconds,
        onStale: (stalenessMs) => {
          if (settled || killReason !== null) return;
          killReason = 'liveness';
          stalenessAtKillMs = stalenessMs;
          clearTimers();
          killChild();
        },
      });
    }

    // Settle on `'close'` (not `'exit'`) so the child's stdio pipes
    // have fully drained before we snapshot byte counters / close
    // capture streams. First settle wins: a close that beats every
    // kill records `completed` (data-model race rule).
    //
    // AUDIT-20260611-13: a close carrying a non-null `signal` when the
    // wrapper sent NO kill (killReason === null) means the child was
    // terminated out-of-band (OOM killer, external SIGTERM/SIGKILL).
    // Settling that as `completed` would let the lane's PARTIAL capture
    // into the lift — `killed-external` keeps FR-007's "a killed lane
    // contributes ZERO findings" true for this kill path.
    child.on('close', (code, signal) => {
      const exitCode = code !== null ? code : -1;
      const terminalState: TerminalState =
        killReason === 'timeout'
          ? 'timed-out'
          : killReason === 'liveness'
            ? 'killed-no-liveness'
            : signal !== null
              ? 'killed-external'
              : 'completed';
      finish({ exitCode }, terminalState);
    });
  });
}

const MODEL_PLACEHOLDER = '{{model}}';
const PROMPT_PLACEHOLDER = '{{prompt}}';
const PROMPT_STDIN_PLACEHOLDER = '{{prompt-stdin}}';

/**
 * Assemble a lane's argv: split the template on whitespace, inject the
 * lane's `readonly_enforcement` fragment immediately before the prompt
 * placeholder (FR-003 — injection makes enforcement mechanical even
 * when the template author forgot it; a fragment the template already
 * carries BEFORE the prompt placeholder is NOT duplicated), substitute
 * the `{{model}}` pin (FR-001), strip `{{prompt-stdin}}` tokens (stdin
 * delivery), and substitute `{{prompt}}`.
 *
 * The already-present check only looks at tokens BEFORE the prompt
 * placeholder: CLIs may stop option parsing at the prompt/subcommand
 * boundary, so a fragment positioned after the prompt can be inert —
 * skipping injection there would mark the lane `enforced` while the
 * effective argv is NOT mechanically read-only (the FR-003 failure
 * mode). A benign duplicate after the prompt is acceptable; an
 * unenforced argv marked enforced is not.
 *
 * Substitution rules (per placeholder):
 *   - Token equals the placeholder (bare-token form): replaced
 *     wholesale; a prompt with embedded whitespace lands as a single
 *     argv element because the split happens before the substitution.
 *   - Token contains it as a substring (embedded form, e.g.
 *     `--model={{model}}` / `--prompt={{prompt}}`): every occurrence
 *     within the token is replaced literally.
 *   - `{{prompt-stdin}}` is the exception: it is STRIPPED (stdin
 *     delivery has nothing to substitute into argv), and only the
 *     bare-token form exists — the config loader REJECTS embedded
 *     forms like `--input={{prompt-stdin}}` at load (AUDIT-20260611-12),
 *     so the equality filter below is exhaustive for loader-validated
 *     configs.
 *
 * Exported for tests; the orchestrator only calls `spawnCliAgainstModel`.
 */
export function buildArgs(
  model: ModelConfig,
  prompt: string,
): ReadonlyArray<string> {
  const tokens = model.argsTemplate
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  // Enforcement injection happens on RAW tokens (before substitution)
  // so the already-present check compares template text to fragment
  // text directly.
  let assembled = tokens;
  if (model.readonlyEnforcement !== 'none') {
    const fragment = model.readonlyEnforcement
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    const promptIndex = tokens.findIndex(
      (tok) =>
        tok.includes(PROMPT_PLACEHOLDER) || tok.includes(PROMPT_STDIN_PLACEHOLDER),
    );
    const insertAt = promptIndex === -1 ? tokens.length : promptIndex;
    if (
      fragment.length > 0 &&
      !containsContiguous(tokens.slice(0, insertAt), fragment)
    ) {
      assembled = [
        ...tokens.slice(0, insertAt),
        ...fragment,
        ...tokens.slice(insertAt),
      ];
    }
  }

  return assembled
    .filter((tok) => tok !== PROMPT_STDIN_PLACEHOLDER)
    .map((tok) => tok.split(MODEL_PLACEHOLDER).join(model.model))
    .map((tok) => tok.split(PROMPT_PLACEHOLDER).join(prompt));
}

function containsContiguous(
  haystack: ReadonlyArray<string>,
  needle: ReadonlyArray<string>,
): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function endStream(stream: WriteStream): Promise<void> {
  return new Promise<void>((resolveEnd, rejectEnd) => {
    let settled = false;
    const onError = (err: Error): void => {
      if (settled) return;
      settled = true;
      rejectEnd(err);
    };
    const onFinish = (): void => {
      if (settled) return;
      settled = true;
      resolveEnd();
    };
    stream.once('error', onError);
    stream.once('finish', onFinish);
    stream.end();
  });
}
