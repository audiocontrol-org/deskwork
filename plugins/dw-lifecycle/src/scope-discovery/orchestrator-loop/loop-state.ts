/**
 * plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-state.ts
 *
 * Durable orchestrator-loop state.
 *
 * Per-feature isolation: state lives under
 * `<runtimeDir>/<featureSlug>/loop-state.json` so running turns against
 * different features does not contaminate each other's
 * `lastAuditWatermark` or `turnHistory`. See TF-012.
 */

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadLlmConfig } from '../llm/config.js';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { LoopState, TurnHistoryEntry } from './loop-types.js';

export const LOOP_STATE_FILENAME = 'loop-state.json';

export const EMPTY_LOOP_STATE: LoopState = {
  version: 1,
  lastAuditWatermark: '',
  lastTurnId: '',
  turnHistory: [],
  persistedAt: '1970-01-01T00:00:00.000Z',
};

function statePath(
  repoRoot: string,
  runtimeDir: string,
  featureSlug: string,
): string {
  return resolve(repoRoot, runtimeDir, featureSlug, LOOP_STATE_FILENAME);
}

function legacyStatePath(repoRoot: string, runtimeDir: string): string {
  return resolve(repoRoot, runtimeDir, LOOP_STATE_FILENAME);
}

const warnedLegacyPaths = new Set<string>();

function warnLegacyLoopState(legacyPath: string): void {
  if (warnedLegacyPaths.has(legacyPath)) return;
  warnedLegacyPaths.add(legacyPath);
  process.stderr.write(
    `loop-state: legacy per-repo loop-state at ${legacyPath} ignored — ` +
      'using empty per-feature state. Delete the legacy file when you have ' +
      'confirmed no other features depend on it.\n',
  );
}

function requireString(raw: Record<string, unknown>, field: string, ctx: string): string {
  const v = raw[field];
  if (typeof v !== 'string') {
    throw new Error(`loop-state: ${ctx} \`${field}\` must be a string`);
  }
  return v;
}

function requireNonEmptyString(raw: Record<string, unknown>, field: string, ctx: string): string {
  const v = requireString(raw, field, ctx);
  if (v.length === 0) {
    throw new Error(`loop-state: ${ctx} \`${field}\` must be a non-empty string`);
  }
  return v;
}

function requireNonNegativeInt(raw: Record<string, unknown>, field: string, ctx: string): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`loop-state: ${ctx} \`${field}\` must be a finite number`);
  }
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(
      `loop-state: ${ctx} \`${field}\` must be a non-negative integer; got ${v}`,
    );
  }
  return v;
}

function requireBoolean(raw: Record<string, unknown>, field: string, ctx: string): boolean {
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
  const base: TurnHistoryEntry = {
    turnId: requireNonEmptyString(raw, 'turnId', ctx),
    turnAt: requireNonEmptyString(raw, 'turnAt', ctx),
    newAuditEntries: requireNonNegativeInt(raw, 'newAuditEntries', ctx),
    wrongDecisionEvents: requireNonNegativeInt(raw, 'wrongDecisionEvents', ctx),
    catalogEditProposals: requireNonNegativeInt(raw, 'catalogEditProposals', ctx),
    escalationsQueued: requireNonNegativeInt(raw, 'escalationsQueued', ctx),
    judgeRan: requireBoolean(raw, 'judgeRan', ctx),
    auditorFired: requireBoolean(raw, 'auditorFired', ctx),
  };
  // catalogPresentCount is optional (added by Phase 14 Task 1 for the
  // 3/6-NOTE noise gate; legacy state files predate it).
  const catRaw = raw.catalogPresentCount;
  if (catRaw === undefined) return base;
  if (typeof catRaw !== 'number' || !Number.isInteger(catRaw) || catRaw < 0) {
    throw new Error(
      `loop-state: ${ctx} \`catalogPresentCount\` must be a non-negative integer when present`,
    );
  }
  return { ...base, catalogPresentCount: catRaw };
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
    throw new Error(`loop-state: ${ctx} \`turnHistory\` must be an array`);
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

export async function loadLoopState(
  repoRoot: string,
  featureSlug: string,
  runtimeDirOverride?: string,
): Promise<LoopState> {
  if (featureSlug.length === 0) {
    throw new Error('loop-state: loadLoopState requires a non-empty featureSlug');
  }
  const runtimeDir = await resolveRuntimeDir(repoRoot, runtimeDirOverride);
  const path = statePath(repoRoot, runtimeDir, featureSlug);
  try {
    const text = await readFile(path, 'utf8');
    return parseStateFile(text, path);
  } catch (err) {
    if (isEnoent(err)) {
      const legacy = legacyStatePath(repoRoot, runtimeDir);
      if (existsSync(legacy)) warnLegacyLoopState(legacy);
      return EMPTY_LOOP_STATE;
    }
    throw err;
  }
}

export async function persistLoopState(
  repoRoot: string,
  featureSlug: string,
  state: LoopState,
  options: {
    readonly runtimeDirOverride?: string;
    readonly retention: number;
  },
): Promise<void> {
  if (featureSlug.length === 0) {
    throw new Error(
      'loop-state: persistLoopState requires a non-empty featureSlug',
    );
  }
  const runtimeDir = await resolveRuntimeDir(repoRoot, options.runtimeDirOverride);
  const path = statePath(repoRoot, runtimeDir, featureSlug);
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
