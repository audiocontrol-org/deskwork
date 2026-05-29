/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/auditor.ts
 *
 * External LLM auditor library (the LLM judge + external auditor).
 *
 * Fire-and-forget per turn: the orchestrator emits an audit-request
 * artifact under `<repoRoot>/<pendingAuditsDir>/audit-request-<id>.json`.
 * An operator-supplied external process (separate Claude session, an
 * Anthropic API call, etc.) picks the request up + writes AUDIT-
 * `<date>`-`<NN>` entries back to the feature's audit-log.
 *
 * The library does NOT perform the audit network call itself (per
 * the LLM judge + external auditor pre-made decision #2: "the external auditor process
 * ... is OPERATOR-PROVIDED. The plugin documents the contract; the
 * operator wires their auditor of choice"). The library's job is:
 *
 *   1. Render the audit prompt with the per-turn inputs so the
 *      external process has a fully-baked prompt to send to its
 *      model class.
 *   2. Persist the rendered prompt + structured inputs as a
 *      JSON artifact so the external process can pick it up without
 *      depending on the dw-lifecycle runtime.
 *   3. Return after the artifact is durably written; the next turn's
 *      `readAuditLogUpdates` picks up any AUDIT-... entries the
 *      external process produced.
 *
 * No silent fallback: if the configured pending-audits directory can't
 * be created or written, throw (per CLAUDE.md no-fallback rule).
 */

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadLlmConfig } from './config.js';
import { renderAuditPrompt } from './prompt-render.js';
import type { AuditorInput, LlmConfig } from './types.js';

/**
 * The on-disk shape of an audit-request artifact. The external auditor
 * process reads this JSON, dispatches to its model class with the
 * `prompt` field, parses the response, and writes audit-log entries.
 *
 * `id` is a stable per-request identifier (timestamp + random hex);
 * the external process echoes it back in the audit-log entry's
 * provenance context so the orchestrator can join request → finding.
 */
export interface AuditRequestArtifact {
  readonly id: string;
  readonly featureSlug: string;
  readonly model: string;
  readonly emittedAt: string;
  readonly prompt: string;
  readonly inputs: AuditorInput;
}

export interface FireExternalAuditOptions {
  /** Repo root to resolve the pending-audits dir against. */
  readonly repoRoot: string;
  /** Optional explicit config (test entry point; skips disk load). */
  readonly configOverride?: LlmConfig;
  /** Override the per-request id (test entry point; default is timestamp+hex). */
  readonly idOverride?: string;
  /** Override `emittedAt` (test entry point; default is `new Date().toISOString()`). */
  readonly emittedAtOverride?: string;
}

/**
 * Fire an audit request. Returns the absolute path of the written
 * artifact (the orchestrator surfaces this in its per-turn report so
 * the operator can inspect what was requested).
 *
 * Fire-and-forget per the function does NOT wait
 * for the external auditor to produce findings. Findings arrive
 * asynchronously in the audit-log; the next turn's `readAuditLogUpdates`
 * surfaces them.
 */
export async function fireExternalAudit(
  input: AuditorInput,
  options: FireExternalAuditOptions,
): Promise<string> {
  const config =
    options.configOverride ?? (await loadLlmConfig(options.repoRoot));
  const model = input.modelOverride ?? config.auditor.model;
  const prompt = await renderAuditPrompt(input);
  const id = options.idOverride ?? defaultRequestId();
  const emittedAt = options.emittedAtOverride ?? new Date().toISOString();

  const artifact: AuditRequestArtifact = {
    id,
    featureSlug: input.featureSlug,
    model,
    emittedAt,
    prompt,
    inputs: input,
  };

  const dir = resolve(options.repoRoot, config.auditor.pendingAuditsDir);
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `audit-request-${id}.json`);
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * Generate a default request id. Format: `YYYYMMDDHHMMSS-<6hex>` so
 * sorting by filename produces chronological order; the random suffix
 * prevents collisions when multiple turns fire within the same second.
 */
function defaultRequestId(): string {
  const now = new Date();
  const stamp =
    `${now.getUTCFullYear().toString().padStart(4, '0')}` +
    `${(now.getUTCMonth() + 1).toString().padStart(2, '0')}` +
    `${now.getUTCDate().toString().padStart(2, '0')}` +
    `${now.getUTCHours().toString().padStart(2, '0')}` +
    `${now.getUTCMinutes().toString().padStart(2, '0')}` +
    `${now.getUTCSeconds().toString().padStart(2, '0')}`;
  const suffix = randomBytes(3).toString('hex');
  return `${stamp}-${suffix}`;
}
