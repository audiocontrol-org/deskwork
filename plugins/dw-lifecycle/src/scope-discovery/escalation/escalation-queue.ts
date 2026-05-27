/**
 * plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-queue.ts
 *
 * Phase 11 Task 9 — Persistent escalation queue.
 *
 * Three operations:
 *
 *   - `enqueueEscalation(input, opts)` — writes a single JSON file under
 *     `<repoRoot>/<orchestratorRuntimeDir>/pending-escalations/<id>.json`.
 *     The artifact is operator-readable raw (the `escalation-render.ts`
 *     module renders it as markdown for richer editing).
 *
 *   - `readPendingEscalations(repoRoot, opts)` — lists open escalations
 *     (anything under `pending-escalations/` whose `resolution` is
 *     null). Throws loudly on malformed JSON per the no-fallback rule.
 *
 *   - `resolveEscalation(repoRoot, id, resolution, opts)` — reads the
 *     pending file, stamps the resolution, MOVES it to
 *     `resolved-escalations/<id>.json` (never deletes; provenance
 *     trail). Throws if the id is unknown or the file is malformed.
 *
 * # Path resolution
 *
 * The `orchestrator-runtime` dir comes from `LlmConfig.orchestratorRuntimeDir`
 * (defaults to `.dw-lifecycle/scope-discovery/orchestrator-runtime`).
 * Tests inject `runtimeDirOverride` to avoid loading the YAML config.
 *
 * # Concurrency
 *
 * Single-writer assumed per the orchestrator's per-turn model
 * (`/dw-lifecycle:implement` is sequential). The library uses atomic
 * writes (write-temp + rename) so a crash mid-write does NOT leave a
 * half-written file the next read would trip on.
 */

import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadLlmConfig } from '../llm/config.js';
import { isEnoent } from '../util/typeguards.js';
import { parseEscalation } from './escalation-parse.js';
import {
  PENDING_ESCALATIONS_SUBDIR,
  RESOLVED_ESCALATIONS_SUBDIR,
  type EscalationRequest,
  type EscalationRequestInput,
} from './escalation-types.js';

export interface QueueOptions {
  /**
   * Override the orchestrator-runtime dir (repo-relative). When
   * omitted the library loads `llm-judge.yaml` via `loadLlmConfig`.
   */
  readonly runtimeDirOverride?: string;
}

export interface EnqueueOptions extends QueueOptions {
  /** Repo root the runtime dir resolves against. */
  readonly repoRoot: string;
}

export interface ReadOptions extends QueueOptions {
  readonly repoRoot: string;
}

export interface ResolveInput {
  /**
   * Verbatim text of the operator's decision. Stored as
   * `decisionTaken` on the resolution.
   */
  readonly decisionTaken: string;
  /**
   * The option id the operator selected (if any). When the operator
   * wrote a free-form decision that didn't reference any option id,
   * pass `null`.
   */
  readonly selectedOptionId: string | null;
  /**
   * Override the resolved-at timestamp (test entry point; defaults to
   * `new Date().toISOString()`).
   */
  readonly resolvedAtOverride?: string;
}

export interface ResolveOptions extends QueueOptions {
  readonly repoRoot: string;
}

/**
 * Resolve `<repoRoot>/<runtimeDir>` and return the absolute path.
 */
async function resolveRuntimeDir(
  repoRoot: string,
  override: string | undefined,
): Promise<string> {
  let runtimeDir = override;
  if (runtimeDir === undefined) {
    const llmConfig = await loadLlmConfig(repoRoot);
    runtimeDir = llmConfig.orchestratorRuntimeDir;
  }
  return resolve(repoRoot, runtimeDir);
}

function pendingDir(runtimeDirAbs: string): string {
  return resolve(runtimeDirAbs, PENDING_ESCALATIONS_SUBDIR);
}

function resolvedDir(runtimeDirAbs: string): string {
  return resolve(runtimeDirAbs, RESOLVED_ESCALATIONS_SUBDIR);
}

function pendingPath(runtimeDirAbs: string, id: string): string {
  return resolve(pendingDir(runtimeDirAbs), `${id}.json`);
}

function resolvedPath(runtimeDirAbs: string, id: string): string {
  return resolve(resolvedDir(runtimeDirAbs), `${id}.json`);
}

/**
 * Generate a default escalation id. Format mirrors the auditor's
 * request-id format: `YYYYMMDDHHMMSS-<6hex>`. Sorting by filename
 * produces chronological order; the random suffix prevents collisions
 * when the orchestrator emits multiple escalations within the same
 * second (rare, but cheap insurance).
 */
function defaultEscalationId(): string {
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

/**
 * Validate the operator-supplied input. Throws on missing required
 * fields rather than silently dropping them.
 */
function validateInput(input: EscalationRequestInput): void {
  if (input.actionProposed.length === 0) {
    throw new Error('enqueueEscalation: `actionProposed` must be non-empty');
  }
  if (input.reasoning.length === 0) {
    throw new Error('enqueueEscalation: `reasoning` must be non-empty');
  }
  if (input.question.length === 0) {
    throw new Error('enqueueEscalation: `question` must be non-empty');
  }
  if (input.options.length === 0) {
    throw new Error(
      'enqueueEscalation: `options` must contain at least one option',
    );
  }
  const seen = new Set<string>();
  for (const option of input.options) {
    if (option.id.length === 0) {
      throw new Error('enqueueEscalation: each option must have a non-empty `id`');
    }
    if (option.summary.length === 0) {
      throw new Error(
        'enqueueEscalation: each option must have a non-empty `summary`',
      );
    }
    if (seen.has(option.id)) {
      throw new Error(
        `enqueueEscalation: duplicate option id "${option.id}"`,
      );
    }
    seen.add(option.id);
  }
}

/**
 * Atomic write: write to a temp file, then rename into place. Prevents
 * half-written files from being read by a concurrent reader after a
 * crash mid-write.
 */
async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const tmpPath = `${path}.tmp-${randomBytes(3).toString('hex')}`;
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(tmpPath, json, 'utf8');
  await rename(tmpPath, path);
}

/**
 * Write an escalation to the pending-escalations dir. Returns the
 * fully-realized `EscalationRequest` (with `version: 1`, queued_at,
 * resolution: null) so callers can pass it directly to the renderer
 * without a re-read.
 */
export async function enqueueEscalation(
  input: EscalationRequestInput,
  options: EnqueueOptions,
): Promise<EscalationRequest> {
  validateInput(input);
  const runtimeDirAbs = await resolveRuntimeDir(
    options.repoRoot,
    options.runtimeDirOverride,
  );
  const id = input.id ?? defaultEscalationId();
  const queuedAt = input.queuedAt ?? new Date().toISOString();
  const request: EscalationRequest = {
    version: 1,
    id,
    queuedAt,
    actionProposed: input.actionProposed,
    evidence: input.evidence,
    reasoning: input.reasoning,
    question: input.question,
    options: input.options,
    resolution: null,
  };
  await mkdir(pendingDir(runtimeDirAbs), { recursive: true });
  const path = pendingPath(runtimeDirAbs, id);
  await atomicWriteJson(path, request);
  return request;
}

/**
 * List all OPEN escalations (those whose `resolution` is null). Reads
 * every JSON file under `pending-escalations/`; returns chronological
 * order (oldest first, matching filename sort which matches
 * `queuedAt` since ids start with the timestamp).
 *
 * Returns `[]` when the directory does not exist (cold start). Throws
 * on malformed JSON.
 */
export async function readPendingEscalations(
  options: ReadOptions,
): Promise<ReadonlyArray<EscalationRequest>> {
  const runtimeDirAbs = await resolveRuntimeDir(
    options.repoRoot,
    options.runtimeDirOverride,
  );
  const dir = pendingDir(runtimeDirAbs);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  const jsonFiles = entries
    .filter((name) => name.endsWith('.json') && !name.endsWith('.tmp'))
    .sort();
  const out: EscalationRequest[] = [];
  for (const name of jsonFiles) {
    const path = resolve(dir, name);
    // eslint-disable-next-line no-await-in-loop
    const text = await readFile(path, 'utf8');
    const parsed = parseEscalation(text, path);
    if (parsed.resolution === null) {
      out.push(parsed);
    }
  }
  return out;
}

/**
 * Resolve a pending escalation. Reads the pending file, stamps the
 * resolution, atomically writes the resolved file, then unlinks the
 * pending file. Returns the resolved `EscalationRequest`.
 *
 * Resolution semantics:
 *   - `decisionTaken` is stored verbatim (operator's words rule).
 *   - `selectedOptionId` must match one of the request's option ids
 *     when non-null; pass null when the operator wrote free-form.
 *   - `resolvedAt` defaults to `new Date().toISOString()` when omitted.
 *
 * Throws when:
 *   - The id is unknown (no pending file with that id).
 *   - `selectedOptionId` does not match any option on the request.
 *   - The pending file is malformed.
 *   - The escalation has already been resolved (its `resolution` field
 *     is non-null). Re-resolution would lose history; the caller must
 *     read the resolved-escalations dir if they want the prior
 *     resolution.
 */
export async function resolveEscalation(
  id: string,
  resolution: ResolveInput,
  options: ResolveOptions,
): Promise<EscalationRequest> {
  if (id.length === 0) {
    throw new Error('resolveEscalation: `id` must be non-empty');
  }
  if (resolution.decisionTaken.length === 0) {
    throw new Error(
      'resolveEscalation: `decisionTaken` must be non-empty',
    );
  }
  const runtimeDirAbs = await resolveRuntimeDir(
    options.repoRoot,
    options.runtimeDirOverride,
  );
  const pendingFile = pendingPath(runtimeDirAbs, id);
  let text: string;
  try {
    text = await readFile(pendingFile, 'utf8');
  } catch (err) {
    if (isEnoent(err)) {
      throw new Error(
        `resolveEscalation: no pending escalation with id "${id}"`,
      );
    }
    throw err;
  }
  const request = parseEscalation(text, pendingFile);
  if (request.resolution !== null) {
    throw new Error(
      `resolveEscalation: escalation "${id}" already has a resolution; refusing to overwrite`,
    );
  }
  if (resolution.selectedOptionId !== null) {
    const match = request.options.find(
      (opt) => opt.id === resolution.selectedOptionId,
    );
    if (match === undefined) {
      throw new Error(
        `resolveEscalation: selectedOptionId "${resolution.selectedOptionId}" does not match any option on escalation "${id}"`,
      );
    }
  }
  const resolved: EscalationRequest = {
    ...request,
    resolution: {
      resolvedAt: resolution.resolvedAtOverride ?? new Date().toISOString(),
      selectedOptionId: resolution.selectedOptionId,
      decisionTaken: resolution.decisionTaken,
    },
  };
  await mkdir(resolvedDir(runtimeDirAbs), { recursive: true });
  const resolvedFile = resolvedPath(runtimeDirAbs, id);
  await atomicWriteJson(resolvedFile, resolved);
  await unlink(pendingFile);
  return resolved;
}

/**
 * Read a single resolved escalation by id. Returns `null` when no
 * resolved file exists with that id. Throws on malformed JSON.
 *
 * Useful for operators / orchestrator post-decision lookups
 * ("what did we decide about escalation X?").
 */
export async function readResolvedEscalation(
  id: string,
  options: ReadOptions,
): Promise<EscalationRequest | null> {
  if (id.length === 0) {
    throw new Error('readResolvedEscalation: `id` must be non-empty');
  }
  const runtimeDirAbs = await resolveRuntimeDir(
    options.repoRoot,
    options.runtimeDirOverride,
  );
  const path = resolvedPath(runtimeDirAbs, id);
  try {
    const text = await readFile(path, 'utf8');
    return parseEscalation(text, path);
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}
