/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/spawn-cli.ts
 *
 * Wraps `child_process.spawn` for a single CLI model invocation.
 *
 * Behavior contract (per audit-barrage-cli-notes.md):
 *
 *   - stdin is closed (`stdio: ['ignore', ...]`); every supported CLI
 *     (`claude -p`, `codex exec`, `gemini`) waits on open stdin and
 *     emits warnings otherwise. Closing it matches the documented
 *     contract.
 *   - stdout streams to `stdoutPath` (per-model markdown).
 *   - stderr streams to `stderrPath` (per-model stderr capture).
 *   - On timeout: SIGTERM, then SIGKILL after a 5-second grace.
 *   - Spawn failure (ENOENT, etc.) returns `exitCode: -2` with
 *     `spawnError` populated. The orchestrator surfaces the failure
 *     in the INDEX without aborting siblings.
 *
 * Argument substitution: `argsTemplate` is split on whitespace BEFORE
 * `{{prompt}}` is replaced. Splitting after would mangle prompts that
 * contain whitespace; splitting before keeps the prompt as a single
 * argv element regardless of its content. Tokens that EQUAL
 * `{{prompt}}` become the prompt verbatim; tokens that CONTAIN
 * `{{prompt}}` as a substring (e.g. `--prompt={{prompt}}`) get
 * intra-token literal replacement.
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
 * Every settle path (timeout, signal, spawn-error, normal exit)
 * clears both timers via `finish()` so no timer leaks past the
 * resolution of the returned Promise.
 */

import { spawn } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { errorMessage } from '../util/typeguards.js';
import type { ModelConfig, ModelRunResult } from './types.js';

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
 * Inputs to a single CLI subprocess invocation. The orchestrator
 * constructs one of these per model per run.
 */
export interface SpawnInput {
  readonly model: ModelConfig;
  readonly prompt: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
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
  const args = buildArgs(input.model.argsTemplate, input.prompt);
  const stdoutStream = createWriteStream(input.stdoutPath);
  const stderrStream = createWriteStream(input.stderrPath);
  const start = Date.now();

  return new Promise<ModelRunResult>((resolveResult, rejectResult) => {
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let sigkillTimer: NodeJS.Timeout | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let settled = false;

    // Attach stream `'error'` handlers immediately after stream
    // creation — write errors mid-run (disk full, permission denied,
    // EPIPE on early consumer close) must reject the run instead of
    // crashing the process via an uncaught event.
    const onStreamError = (err: Error): void => {
      if (settled) return;
      settled = true;
      if (sigkillTimer !== null) clearTimeout(sigkillTimer);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      rejectResult(err);
    };
    stdoutStream.on('error', onStreamError);
    stderrStream.on('error', onStreamError);

    const finish = (partial: Omit<ModelRunResult, 'name'>) => {
      if (settled) return;
      settled = true;
      if (sigkillTimer !== null) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      void closeStreams(stdoutStream, stderrStream)
        .then(() => {
          resolveResult({
            name: input.model.name,
            ...partial,
          });
        })
        .catch(rejectResult);
    };

    // Phase 19 Task 1 (GH #386): detect whether the argsTemplate
    // uses {{prompt-stdin}}. When yes, the prompt is delivered via
    // child.stdin instead of argv — bypasses the OS ARG_MAX limit
    // (~256KB on macOS) that would otherwise fail with spawn E2BIG
    // on large diffs. The stdin path requires `pipe` for stdio[0]
    // so we can write to it. The two branches are written as
    // separate `spawn` calls to preserve the literal stdio tuple
    // shape, which lets TypeScript narrow `child.stdout` /
    // `child.stderr` to non-null on both paths.
    //
    // Phase 12 Task 8 (#397): wrap spawn in try/catch — when the OS
    // rejects argv+env before the child is created (E2BIG, EMFILE,
    // ENAMETOOLONG), `spawn()` throws SYNCHRONOUSLY. The async
    // `child.on('error', ...)` handler does NOT catch these cases.
    // For E2BIG specifically we surface a structured classifier that
    // points adopters at the {{prompt-stdin}} migration path.
    const useStdin = input.model.argsTemplate.includes('{{prompt-stdin}}');
    let child;
    try {
      child = useStdin
        ? spawn(input.model.binary, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
          })
        : spawn(input.model.binary, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
    } catch (err) {
      reportSpawnError(err);
      return;
    }
    if (useStdin && child.stdin !== null) {
      // Write the prompt to stdin and close. Per Phase 19 Task 1:
      // back-pressure aware via `write` callback would be more
      // correct for multi-GB prompts, but the OS pipe buffer is
      // ~64KB and Node node-stream handles back-pressure
      // automatically — `end()` waits until the write drains.
      child.stdin.on('error', (err) => {
        // EPIPE if the child exits before reading the prompt — common
        // when the child rejects the prompt or crashes early. Don't
        // crash the orchestrator; the close event will surface the
        // child's actual outcome via exitCode.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _ = err;
      });
      child.stdin.end(input.prompt);
    }

    // ENOENT / permission denied / etc. — record as spawn error and
    // return without aborting siblings. `finish()` clears every timer
    // on this path; without it, a timeout timer scheduled ~300s out
    // would survive past the result resolution (silent dangling
    // handle).
    //
    // Phase 12 Task 8 (#397): defense-in-depth — E2BIG normally
    // throws synchronously from spawn() (handled above), but some
    // Node versions or platforms may surface it asynchronously.
    // Classify here too so the operator gets the migration cue
    // regardless of which path the OS takes.
    child.on('error', reportSpawnError);

    // Both spawn-error paths (synchronous throw from spawn(), and
    // async child.on('error') emission) produce a structurally
    // identical -2 result; classify E2BIG specifically so the
    // operator gets the {{prompt-stdin}} migration cue regardless
    // of which path the OS uses to surface the failure.
    function reportSpawnError(err: unknown): void {
      const classified = isE2BIG(err)
        ? classifyE2BIGSpawnError(Buffer.byteLength(input.prompt, 'utf8'), errorMessage(err))
        : errorMessage(err);
      finish({
        exitCode: -2,
        durationMs: Date.now() - start,
        stdoutBytes,
        stderrBytes,
        stdoutPath: input.stdoutPath,
        stderrPath: input.stderrPath,
        timedOut: false,
        spawnError: classified,
      });
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      stdoutStream.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      stderrStream.write(chunk);
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      sigkillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, SIGKILL_GRACE_MS);
    }, input.model.timeoutSeconds * 1000);

    // Settle on `'close'` (not `'exit'`) so the child's stdio pipes
    // have fully drained before we snapshot byte counters / close
    // capture streams. `'exit'` fires when the process terminates but
    // can leave in-flight buffered chunks unaccounted for; `'close'`
    // fires only after every stdio pipe has closed.
    child.on('close', (code, signal) => {
      const exitCode = code !== null ? code : -1;
      finish({
        exitCode,
        durationMs: Date.now() - start,
        stdoutBytes,
        stderrBytes,
        stdoutPath: input.stdoutPath,
        stderrPath: input.stderrPath,
        timedOut: timedOut || signal !== null,
      });
    });
  });
}

/**
 * Split `argsTemplate` on whitespace, then substitute `{{prompt}}`
 * inside each token via literal `split().join()` replacement.
 *
 * Substitution rules:
 *   - Token equals `{{prompt}}` (bare-token form): replaced wholesale
 *     by the prompt string; a prompt with embedded whitespace lands
 *     as a single argv element because the split happens before the
 *     substitution.
 *   - Token contains `{{prompt}}` as a substring (embedded form,
 *     e.g. `--prompt={{prompt}}`): every occurrence within the token
 *     is replaced literally. Multiple `{{prompt}}` substrings in one
 *     token are all replaced (idempotent literal replace).
 *   - Token does not contain `{{prompt}}`: passed through verbatim.
 *
 * The intra-token form is the back-compatible fix for adopter configs
 * that pass `args_template: "--prompt={{prompt}}"` through the
 * config-loader's substring-tolerant validation (`args_template`
 * needs only to contain `{{prompt}}` somewhere). Before this change,
 * such a config would survive validation, fail at spawn time (the
 * CLI receives the literal `--prompt={{prompt}}` token, never the
 * rendered prompt), and silently produce an empty-output run.
 *
 * Exported for tests; the orchestrator only calls `spawnCliAgainstModel`.
 */
export function buildArgs(
  argsTemplate: string,
  prompt: string,
): ReadonlyArray<string> {
  const tokens = argsTemplate.trim().split(/\s+/).filter((t) => t.length > 0);
  // Phase 19 Task 1 (GH #386): tokens containing {{prompt-stdin}} are
  // STRIPPED from args entirely (the prompt is delivered via stdin
  // by spawnCliAgainstModel). The bare-token form is the common
  // case; the intra-token form (e.g. `--input={{prompt-stdin}}`)
  // would be unusable since stdin doesn't appear in argv. Stripping
  // bare-token-only matches the practical config shape and is
  // strictly safer than substituting an empty string into argv.
  const stdinFiltered = tokens.filter((tok) => tok !== '{{prompt-stdin}}');
  return stdinFiltered.map((tok) => tok.split('{{prompt}}').join(prompt));
}

async function closeStreams(
  stdoutStream: WriteStream,
  stderrStream: WriteStream,
): Promise<void> {
  await Promise.all([endStream(stdoutStream), endStream(stderrStream)]);
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
