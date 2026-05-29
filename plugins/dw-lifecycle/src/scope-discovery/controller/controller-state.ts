/**
 * plugins/dw-lifecycle/src/scope-discovery/controller/controller-state.ts
 *
 * Durable state persistence for the controller. Per-feature isolation
 * at `<runtimeDir>/<featureSlug>/controller-state.json`. See TF-012.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadLlmConfig } from '../llm/config.js';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type {
  ControllerHistoryEntry,
  ControllerDecision,
  MetricsSnapshot,
} from './controller-types.js';

export const CONTROLLER_STATE_FILENAME = 'controller-state.json';
export const DEFAULT_HISTORY_RETENTION = 24;

interface ControllerStateFile {
  readonly version: 1;
  readonly history: ReadonlyArray<ControllerHistoryEntry>;
}

function statePath(repoRoot: string, runtimeDir: string, featureSlug: string): string {
  return resolve(repoRoot, runtimeDir, featureSlug, CONTROLLER_STATE_FILENAME);
}

function legacyStatePath(repoRoot: string, runtimeDir: string): string {
  return resolve(repoRoot, runtimeDir, CONTROLLER_STATE_FILENAME);
}

const warnedLegacyControllerPaths = new Set<string>();

function warnLegacyControllerState(legacyPath: string): void {
  if (warnedLegacyControllerPaths.has(legacyPath)) return;
  warnedLegacyControllerPaths.add(legacyPath);
  process.stderr.write(
    `controller-state: legacy per-repo controller-state at ${legacyPath} ` +
      'ignored — using empty per-feature state. Delete the legacy file when ' +
      'you have confirmed no other features depend on it.\n',
  );
}

function requireFeatureSlug(featureSlug: string, fn: string): void {
  if (featureSlug.length === 0) {
    throw new Error(`controller-state: ${fn} requires a non-empty featureSlug`);
  }
}

function parseStateFile(text: string, ctx: string): ControllerStateFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`controller-state: cannot parse ${ctx}: ${errorMessage(err)}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`controller-state: ${ctx} did not parse to an object`);
  }
  const version = parsed['version'];
  if (version !== 1) {
    throw new Error(`controller-state: ${ctx} has unsupported version ${String(version)}; expected 1`);
  }
  const historyRaw = parsed['history'];
  if (!Array.isArray(historyRaw)) {
    throw new Error(`controller-state: ${ctx} \`history\` must be an array`);
  }
  const history: ControllerHistoryEntry[] = [];
  for (let i = 0; i < historyRaw.length; i += 1) {
    history.push(parseHistoryEntry(historyRaw[i], `${ctx}#/history/${i}`));
  }
  return { version: 1, history };
}

function parseHistoryEntry(raw: unknown, ctx: string): ControllerHistoryEntry {
  if (!isPlainObject(raw)) {
    throw new Error(`controller-state: ${ctx} must be an object`);
  }
  const decisionRaw = raw['decision'];
  const metricsRaw = raw['metrics_snapshot'];
  if (!isPlainObject(decisionRaw)) {
    throw new Error(`controller-state: ${ctx} \`decision\` must be an object`);
  }
  if (!isPlainObject(metricsRaw)) {
    throw new Error(`controller-state: ${ctx} \`metrics_snapshot\` must be an object`);
  }
  return {
    decision: parseDecision(decisionRaw, `${ctx}/decision`),
    metrics_snapshot: parseMetricsSnapshot(metricsRaw, `${ctx}/metrics_snapshot`),
  };
}

function requireNumber(raw: Record<string, unknown>, field: string, ctx: string): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`controller-state: ${ctx} \`${field}\` must be a finite number`);
  }
  return v;
}

function requireString(raw: Record<string, unknown>, field: string, ctx: string): string {
  const v = raw[field];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`controller-state: ${ctx} \`${field}\` must be a non-empty string`);
  }
  return v;
}

function parseDecision(raw: Record<string, unknown>, ctx: string): ControllerDecision {
  const frequency = requireNumber(raw, 'frequency', ctx);
  const intensity = requireNumber(raw, 'intensity', ctx);
  const escalationThreshold = requireNumber(raw, 'escalationThreshold', ctx);
  const decidedAt = requireString(raw, 'decided_at', ctx);
  const signalsRaw = raw['signals'];
  if (!isPlainObject(signalsRaw)) {
    throw new Error(`controller-state: ${ctx} \`signals\` must be an object`);
  }
  const signals = {
    drift: requireNumber(signalsRaw, 'drift', `${ctx}/signals`),
    correction: requireNumber(signalsRaw, 'correction', `${ctx}/signals`),
    auditorCorrectionRate: requireNumber(signalsRaw, 'auditorCorrectionRate', `${ctx}/signals`),
  };
  const trailRaw = raw['audit_trail'];
  if (!Array.isArray(trailRaw)) {
    throw new Error(`controller-state: ${ctx} \`audit_trail\` must be an array`);
  }
  const audit_trail: ControllerDecision['audit_trail'] = trailRaw.map(
    (entry, idx) => {
      if (!isPlainObject(entry)) {
        throw new Error(`controller-state: ${ctx}/audit_trail[${idx}] must be an object`);
      }
      const field = parseField(entry['field'], `${ctx}/audit_trail[${idx}]/field`);
      const signal_used = parseSignal(entry['signal_used'], `${ctx}/audit_trail[${idx}]/signal_used`);
      return {
        field,
        signal_used,
        prior_value: requireNumber(entry, 'prior_value', `${ctx}/audit_trail[${idx}]`),
        new_value: requireNumber(entry, 'new_value', `${ctx}/audit_trail[${idx}]`),
        reason: requireString(entry, 'reason', `${ctx}/audit_trail[${idx}]`),
        adjusted_at: requireString(entry, 'adjusted_at', `${ctx}/audit_trail[${idx}]`),
      };
    },
  );
  return { frequency, intensity, escalationThreshold, signals, audit_trail, decided_at: decidedAt };
}

const ALLOWED_FIELDS: ReadonlyArray<'frequency' | 'intensity' | 'escalationThreshold'> = [
  'frequency', 'intensity', 'escalationThreshold',
];

function parseField(raw: unknown, ctx: string): 'frequency' | 'intensity' | 'escalationThreshold' {
  if (typeof raw !== 'string') {
    throw new Error(`controller-state: ${ctx} must be a string`);
  }
  const matched = ALLOWED_FIELDS.find((f) => f === raw);
  if (matched === undefined) {
    throw new Error(`controller-state: ${ctx} must be one of ${ALLOWED_FIELDS.join(', ')}; got "${raw}"`);
  }
  return matched;
}

const ALLOWED_SIGNALS: ReadonlyArray<ControllerDecision['audit_trail'][number]['signal_used']> = [
  'cold-start', 'drift', 'correction', 'auditor-correction-rate',
  'anti-thrashing-damping', 'ratchet-down', 'steady-state',
];

function parseSignal(raw: unknown, ctx: string): ControllerDecision['audit_trail'][number]['signal_used'] {
  if (typeof raw !== 'string') {
    throw new Error(`controller-state: ${ctx} must be a string`);
  }
  const matched = ALLOWED_SIGNALS.find((s) => s === raw);
  if (matched === undefined) {
    throw new Error(`controller-state: ${ctx} must be one of ${ALLOWED_SIGNALS.join(', ')}; got "${raw}"`);
  }
  return matched;
}

function parseMetricsSnapshot(raw: Record<string, unknown>, ctx: string): MetricsSnapshot {
  const latency = raw['median_disposition_latency_ms'];
  let parsedLatency: number | null;
  if (latency === null) {
    parsedLatency = null;
  } else if (typeof latency === 'number' && Number.isFinite(latency)) {
    parsedLatency = latency;
  } else {
    throw new Error(`controller-state: ${ctx} \`median_disposition_latency_ms\` must be a finite number or null`);
  }
  return {
    classification_completeness: requireNumber(raw, 'classification_completeness', ctx),
    average_coverage: requireNumber(raw, 'average_coverage', ctx),
    violation_density: requireNumber(raw, 'violation_density', ctx),
    average_surface_variance: requireNumber(raw, 'average_surface_variance', ctx),
    catalog_edit_rate: requireNumber(raw, 'catalog_edit_rate', ctx),
    pending_count: requireNumber(raw, 'pending_count', ctx),
    median_disposition_latency_ms: parsedLatency,
  };
}

async function resolveRuntimeDir(repoRoot: string, override: string | undefined): Promise<string> {
  if (override !== undefined) return override;
  const llmConfig = await loadLlmConfig(repoRoot);
  return llmConfig.orchestratorRuntimeDir;
}

export async function loadControllerState(
  repoRoot: string,
  featureSlug: string,
  runtimeDirOverride?: string,
): Promise<ReadonlyArray<ControllerHistoryEntry>> {
  requireFeatureSlug(featureSlug, 'loadControllerState');
  const runtimeDir = await resolveRuntimeDir(repoRoot, runtimeDirOverride);
  const path = statePath(repoRoot, runtimeDir, featureSlug);
  try {
    const text = await readFile(path, 'utf8');
    const file = parseStateFile(text, path);
    return file.history;
  } catch (err) {
    if (isEnoent(err)) {
      const legacy = legacyStatePath(repoRoot, runtimeDir);
      if (existsSync(legacy)) warnLegacyControllerState(legacy);
      return [];
    }
    throw err;
  }
}

export async function persistControllerState(
  repoRoot: string,
  featureSlug: string,
  history: ReadonlyArray<ControllerHistoryEntry>,
  runtimeDirOverride?: string,
): Promise<void> {
  requireFeatureSlug(featureSlug, 'persistControllerState');
  const runtimeDir = await resolveRuntimeDir(repoRoot, runtimeDirOverride);
  const path = statePath(repoRoot, runtimeDir, featureSlug);
  await mkdir(dirname(path), { recursive: true });
  const truncated = history.slice(0, DEFAULT_HISTORY_RETENTION);
  const data: ControllerStateFile = { version: 1, history: truncated };
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function appendControllerEntry(
  repoRoot: string,
  featureSlug: string,
  entry: ControllerHistoryEntry,
  runtimeDirOverride?: string,
): Promise<ReadonlyArray<ControllerHistoryEntry>> {
  requireFeatureSlug(featureSlug, 'appendControllerEntry');
  const current = await loadControllerState(repoRoot, featureSlug, runtimeDirOverride);
  const next: ControllerHistoryEntry[] = [entry, ...current];
  await persistControllerState(repoRoot, featureSlug, next, runtimeDirOverride);
  return next.slice(0, DEFAULT_HISTORY_RETENTION);
}
