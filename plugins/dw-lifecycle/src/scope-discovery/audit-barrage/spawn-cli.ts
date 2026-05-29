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
 * argv element regardless of its content.
 *
 * Stream-write failures (disk full, permission, etc.) propagate as
 * thrown errors — filesystem corruption is fatal and the orchestrator
 * is allowed to crash.
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
    let settled = false;

    const finish = (partial: Omit<ModelRunResult, 'name'>) => {
      if (settled) return;
      settled = true;
      if (sigkillTimer !== null) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
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
    // return without aborting siblings.
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

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      sigkillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, SIGKILL_GRACE_MS);
    }, input.model.timeoutSeconds * 1000);

    child.on('exit', (code, signal) => {
      clearTimeout(timeoutTimer);
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
 * Split `argsTemplate` on whitespace, then substitute `{{prompt}}` in
 * each token. Token equality is exact: a token that EQUALS
 * `{{prompt}}` becomes the prompt; tokens that merely contain the
 * placeholder substring (which today doesn't happen in any of our
 * default templates) are pass-through.
 *
 * Exported for tests; the orchestrator only calls `spawnCliAgainstModel`.
 */
export function buildArgs(
  argsTemplate: string,
  prompt: string,
): ReadonlyArray<string> {
  const tokens = argsTemplate.trim().split(/\s+/).filter((t) => t.length > 0);
  return tokens.map((tok) => (tok === '{{prompt}}' ? prompt : tok));
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
