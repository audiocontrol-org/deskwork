/**
 * plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts
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

    const child = spawn(input.model.binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // ENOENT / permission denied / etc. — record as spawn error and
    // return without aborting siblings. `finish()` clears every timer
    // on this path; without it, a timeout timer scheduled ~300s out
    // would survive past the result resolution (silent dangling
    // handle).
    child.on('error', (err) => {
      finish({
        exitCode: -2,
        durationMs: Date.now() - start,
        stdoutBytes,
        stderrBytes,
        stdoutPath: input.stdoutPath,
        stderrPath: input.stderrPath,
        timedOut: false,
        spawnError: errorMessage(err),
      });
    });

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
  return tokens.map((tok) => tok.split('{{prompt}}').join(prompt));
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
