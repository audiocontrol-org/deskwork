/**
 * plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-state.ts
 *
 * Phase 11 Task 6 — Durable orchestrator-loop state.
 *
 * Persists the audit-log watermark + last turn id + accumulated
 * turn-history at `<runtimeDir>/loop-state.json` (default
 * `.dw-lifecycle/scope-discovery/orchestrator-runtime/loop-state.json`).
 *
 * The controller's own history persists separately in
 * `controller-state.json` (per Phase 11 Task 5). The loop state is
 * intentionally NARROW — it carries the cross-turn coordinates the
 * loop itself needs (watermark, last turn id, history-ring) and
 * NOTHING else. Anything richer belongs to the dependent libraries'
 * own state files.
 *
 * # No silent fallback
 *
 * Missing file → return empty state (first-ever run). Malformed file
 * → throw with the absolute path + parse error (operator can see what
 * to fix). The "absent → empty" case is the cold-start path the loop
 * relies on.
 */

import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadLlmConfig } from '../llm/config.js';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { LoopState, TurnHistoryEntry } from './loop-types.js';

export const LOOP_STATE_FILENAME = 'loop-state.json';

/**
 * Empty loop state used on first-ever-run. The `lastAuditWatermark`
 * is the empty string (string-compare against any real Finding-ID
 * is strictly less, so every audit-log entry surfaces as new). The
 * `lastTurnId` is empty as well; `turnHistory` is empty.
 *
 * Per the empty-revisions-beat-missed-changes rule: we DO NOT
 * pretend a missing state file is suspicious; first-run is the
 * common path on fresh installs. Operator gets a clean cold-start
 * loop without any warning chatter.
 */
export const EMPTY_LOOP_STATE: LoopState = {
  version: 1,
  lastAuditWatermark: '',
  lastTurnId: '',
  turnHistory: [],
  persistedAt: '1970-01-01T00:00:00.000Z',
};

function statePath(repoRoot: string, runtimeDir: string): string {
  return resolve(repoRoot, runtimeDir, LOOP_STATE_FILENAME);
}

function requireString(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): string {
  const v = raw[field];
  if (typeof v !== 'string') {
    throw new Error(`loop-state: ${ctx} \`${field}\` must be a string`);
  }
  return v;
}

function requireNonEmptyString(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): string {
  const v = requireString(raw, field, ctx);
  if (v.length === 0) {
    throw new Error(
      `loop-state: ${ctx} \`${field}\` must be a non-empty string`,
    );
  }
  return v;
}

function requireNonNegativeInt(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      `loop-state: ${ctx} \`${field}\` must be a finite number`,
    );
  }
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(
      `loop-state: ${ctx} \`${field}\` must be a non-negative integer; got ${v}`,
    );
  }
  return v;
}

function requireBoolean(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): boolean {
  const v = raw[field];
  if (typeof v !== 'boolean') {
    throw new Error(`loop-state: ${ctx} \`${field}\` must be a boolean`);
  }
  return v;
}

function parseHistoryEntry(raw: unknown, ctx: string): TurnHistoryEntry {
  if (!isPlainObject(raw)) {
    throw new Error(`loop-state: ${ctx} must be an object`);
  }
  return {
    turnId: requireNonEmptyString(raw, 'turnId', ctx),
    turnAt: requireNonEmptyString(raw, 'turnAt', ctx),
    newAuditEntries: requireNonNegativeInt(raw, 'newAuditEntries', ctx),
    wrongDecisionEvents: requireNonNegativeInt(
      raw,
      'wrongDecisionEvents',
      ctx,
    ),
    catalogEditProposals: requireNonNegativeInt(
      raw,
      'catalogEditProposals',
      ctx,
    ),
    escalationsQueued: requireNonNegativeInt(raw, 'escalationsQueued', ctx),
    judgeRan: requireBoolean(raw, 'judgeRan', ctx),
    auditorFired: requireBoolean(raw, 'auditorFired', ctx),
  };
}

function parseStateFile(text: string, ctx: string): LoopState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`loop-state: cannot parse ${ctx}: ${errorMessage(err)}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`loop-state: ${ctx} did not parse to an object`);
  }
  const version = parsed['version'];
  if (version !== 1) {
    throw new Error(
      `loop-state: ${ctx} has unsupported version ${String(version)}; expected 1`,
    );
  }
  const lastAuditWatermark = requireString(parsed, 'lastAuditWatermark', ctx);
  const lastTurnId = requireString(parsed, 'lastTurnId', ctx);
  const persistedAt = requireNonEmptyString(parsed, 'persistedAt', ctx);
  const historyRaw = parsed['turnHistory'];
  if (!Array.isArray(historyRaw)) {
    throw new Error(
      `loop-state: ${ctx} \`turnHistory\` must be an array`,
    );
  }
  const turnHistory: TurnHistoryEntry[] = historyRaw.map((item, idx) =>
    parseHistoryEntry(item, `${ctx}#/turnHistory/${idx}`),
  );
  return {
    version: 1,
    lastAuditWatermark,
    lastTurnId,
    turnHistory,
    persistedAt,
  };
}

async function resolveRuntimeDir(
  repoRoot: string,
  override: string | undefined,
): Promise<string> {
  if (override !== undefined) return override;
  const llmConfig = await loadLlmConfig(repoRoot);
  return llmConfig.orchestratorRuntimeDir;
}

/**
 * Load the durable loop state from disk. Returns `EMPTY_LOOP_STATE`
 * (deep-readable; safe for the caller to use as the cold-start
 * baseline) when the file is absent. Throws on malformed file.
 *
 * The orchestrator's per-turn flow loads at start-of-turn, mutates
 * via the pure `advanceLoopState` helper, and persists via
 * `persistLoopState` at end-of-turn.
 */
export async function loadLoopState(
  repoRoot: string,
  runtimeDirOverride?: string,
): Promise<LoopState> {
  const runtimeDir = await resolveRuntimeDir(repoRoot, runtimeDirOverride);
  const path = statePath(repoRoot, runtimeDir);
  try {
    const text = await readFile(path, 'utf8');
    return parseStateFile(text, path);
  } catch (err) {
    if (isEnoent(err)) return EMPTY_LOOP_STATE;
    throw err;
  }
}

/**
 * Persist the loop state to disk. Creates the parent directory if
 * needed. Truncates `turnHistory` to `retention` entries (newest-
 * first) so the state file does not grow without bound.
 */
export async function persistLoopState(
  repoRoot: string,
  state: LoopState,
  options: {
    readonly runtimeDirOverride?: string;
    readonly retention: number;
  },
): Promise<void> {
  const runtimeDir = await resolveRuntimeDir(
    repoRoot,
    options.runtimeDirOverride,
  );
  const path = statePath(repoRoot, runtimeDir);
  await mkdir(dirname(path), { recursive: true });
  const truncated: LoopState = {
    version: 1,
    lastAuditWatermark: state.lastAuditWatermark,
    lastTurnId: state.lastTurnId,
    turnHistory: state.turnHistory.slice(0, options.retention),
    persistedAt: state.persistedAt,
  };
  await writeFile(path, `${JSON.stringify(truncated, null, 2)}\n`, 'utf8');
}

/**
 * Generate a stable turn id. Format mirrors the auditor's request-id
 * + escalation id formats: `YYYYMMDDHHMMSS-<6hex>`. Sorting by id
 * produces chronological order; the random suffix prevents collisions
 * for multi-turn-per-second runs.
 */
export function generateTurnId(now: Date = new Date()): string {
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
 * Pure: prepend a new history entry, update watermark + last-turn-id +
 * persistedAt, and return the new state. The caller persists with
 * `persistLoopState`.
 *
 * Retention is applied at persist-time (not here) so callers can
 * carry the unbounded list across multiple in-process turns if they
 * want; the disk-side state stays bounded.
 */
export function advanceLoopState(
  prior: LoopState,
  next: {
    readonly turnId: string;
    readonly newWatermark: string;
    readonly history: TurnHistoryEntry;
    readonly persistedAt: string;
  },
): LoopState {
  return {
    version: 1,
    lastAuditWatermark: next.newWatermark,
    lastTurnId: next.turnId,
    turnHistory: [next.history, ...prior.turnHistory],
    persistedAt: next.persistedAt,
  };
}
