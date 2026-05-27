/**
 * plugins/dw-lifecycle/src/scope-discovery/controller/controller-state.ts
 *
 * Phase 11 Task 5 — Durable state persistence for the controller.
 *
 * The controller itself is pure (see `controller.ts`). This module
 * handles the read/write side: loading prior history + decision from
 * disk before invoking `runController`, then persisting the updated
 * history afterward.
 *
 * Default path:
 *   `.dw-lifecycle/scope-discovery/orchestrator-runtime/controller-state.json`
 *
 * The orchestrator-runtime dir is gitignored (per Phase 11 Task 6's
 * resumability decision); the controller-state.json file is
 * orchestrator-private — operators inspect it for telemetry but it
 * is NOT operator-edited.
 *
 * # File format
 *
 *   {
 *     "version": 1,
 *     "history": [
 *       {
 *         "decision": { ... ControllerDecision JSON ... },
 *         "metrics_snapshot": { ... MetricsSnapshot JSON ... }
 *       },
 *       ...
 *     ]
 *   }
 *
 * History is stored newest-first (history[0] is the most recent). The
 * controller's history-window operations are O(history.length) so we
 * cap retention at `DEFAULT_HISTORY_RETENTION` entries (24 turns —
 * deep enough for the longest anti-thrashing / ratchet-down window
 * any reasonable config would use, plus a few turns of margin).
 */

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

/**
 * Maximum history entries retained. Bounded so the state file does
 * not grow unbounded over long-running projects. Old entries beyond
 * this cap are dropped from the tail on each `persistControllerState`.
 *
 * 24 was picked as the smallest value that comfortably exceeds the
 * largest reasonable ratchet_down_window + anti_thrashing_window
 * combined (default 5 + 3 = 8; ceiling around 12; 24 leaves 2x
 * headroom). Adopters with extreme configs override at the
 * orchestrator-side.
 */
export const DEFAULT_HISTORY_RETENTION = 24;

interface ControllerStateFile {
  readonly version: 1;
  readonly history: ReadonlyArray<ControllerHistoryEntry>;
}

function statePath(repoRoot: string, runtimeDir: string): string {
  return resolve(repoRoot, runtimeDir, CONTROLLER_STATE_FILENAME);
}

/**
 * Type-guard parse for the JSON file. Returns `null` for missing
 * file (caller treats as cold-start); throws on malformed file (per
 * project rule against silent fallbacks).
 */
function parseStateFile(
  text: string,
  ctx: string,
): ControllerStateFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `controller-state: cannot parse ${ctx}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `controller-state: ${ctx} did not parse to an object`,
    );
  }
  const version = parsed['version'];
  if (version !== 1) {
    throw new Error(
      `controller-state: ${ctx} has unsupported version ${String(version)}; expected 1`,
    );
  }
  const historyRaw = parsed['history'];
  if (!Array.isArray(historyRaw)) {
    throw new Error(
      `controller-state: ${ctx} \`history\` must be an array`,
    );
  }
  const history: ControllerHistoryEntry[] = [];
  for (let i = 0; i < historyRaw.length; i += 1) {
    const item = historyRaw[i];
    history.push(parseHistoryEntry(item, `${ctx}#/history/${i}`));
  }
  return { version: 1, history };
}

function parseHistoryEntry(
  raw: unknown,
  ctx: string,
): ControllerHistoryEntry {
  if (!isPlainObject(raw)) {
    throw new Error(`controller-state: ${ctx} must be an object`);
  }
  const decisionRaw = raw['decision'];
  const metricsRaw = raw['metrics_snapshot'];
  if (!isPlainObject(decisionRaw)) {
    throw new Error(
      `controller-state: ${ctx} \`decision\` must be an object`,
    );
  }
  if (!isPlainObject(metricsRaw)) {
    throw new Error(
      `controller-state: ${ctx} \`metrics_snapshot\` must be an object`,
    );
  }
  return {
    decision: parseDecision(decisionRaw, `${ctx}/decision`),
    metrics_snapshot: parseMetricsSnapshot(metricsRaw, `${ctx}/metrics_snapshot`),
  };
}

function requireNumber(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      `controller-state: ${ctx} \`${field}\` must be a finite number`,
    );
  }
  return v;
}

function requireString(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): string {
  const v = raw[field];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(
      `controller-state: ${ctx} \`${field}\` must be a non-empty string`,
    );
  }
  return v;
}

function parseDecision(
  raw: Record<string, unknown>,
  ctx: string,
): ControllerDecision {
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
    auditorCorrectionRate: requireNumber(
      signalsRaw,
      'auditorCorrectionRate',
      `${ctx}/signals`,
    ),
  };
  const trailRaw = raw['audit_trail'];
  if (!Array.isArray(trailRaw)) {
    throw new Error(
      `controller-state: ${ctx} \`audit_trail\` must be an array`,
    );
  }
  const audit_trail: ControllerDecision['audit_trail'] = trailRaw.map(
    (entry, idx) => {
      if (!isPlainObject(entry)) {
        throw new Error(
          `controller-state: ${ctx}/audit_trail[${idx}] must be an object`,
        );
      }
      const field = parseField(entry['field'], `${ctx}/audit_trail[${idx}]/field`);
      const signal_used = parseSignal(
        entry['signal_used'],
        `${ctx}/audit_trail[${idx}]/signal_used`,
      );
      return {
        field,
        signal_used,
        prior_value: requireNumber(entry, 'prior_value', `${ctx}/audit_trail[${idx}]`),
        new_value: requireNumber(entry, 'new_value', `${ctx}/audit_trail[${idx}]`),
        reason: requireString(entry, 'reason', `${ctx}/audit_trail[${idx}]`),
        adjusted_at: requireString(
          entry,
          'adjusted_at',
          `${ctx}/audit_trail[${idx}]`,
        ),
      };
    },
  );
  return {
    frequency,
    intensity,
    escalationThreshold,
    signals,
    audit_trail,
    decided_at: decidedAt,
  };
}

const ALLOWED_FIELDS: ReadonlyArray<'frequency' | 'intensity' | 'escalationThreshold'> = [
  'frequency',
  'intensity',
  'escalationThreshold',
];

function parseField(
  raw: unknown,
  ctx: string,
): 'frequency' | 'intensity' | 'escalationThreshold' {
  if (typeof raw !== 'string') {
    throw new Error(`controller-state: ${ctx} must be a string`);
  }
  const matched = ALLOWED_FIELDS.find((f) => f === raw);
  if (matched === undefined) {
    throw new Error(
      `controller-state: ${ctx} must be one of ${ALLOWED_FIELDS.join(', ')}; got "${raw}"`,
    );
  }
  return matched;
}

const ALLOWED_SIGNALS: ReadonlyArray<ControllerDecision['audit_trail'][number]['signal_used']> = [
  'cold-start',
  'drift',
  'correction',
  'auditor-correction-rate',
  'anti-thrashing-damping',
  'ratchet-down',
  'steady-state',
];

function parseSignal(
  raw: unknown,
  ctx: string,
): ControllerDecision['audit_trail'][number]['signal_used'] {
  if (typeof raw !== 'string') {
    throw new Error(`controller-state: ${ctx} must be a string`);
  }
  const matched = ALLOWED_SIGNALS.find((s) => s === raw);
  if (matched === undefined) {
    throw new Error(
      `controller-state: ${ctx} must be one of ${ALLOWED_SIGNALS.join(', ')}; got "${raw}"`,
    );
  }
  return matched;
}

function parseMetricsSnapshot(
  raw: Record<string, unknown>,
  ctx: string,
): MetricsSnapshot {
  const latency = raw['median_disposition_latency_ms'];
  let parsedLatency: number | null;
  if (latency === null) {
    parsedLatency = null;
  } else if (typeof latency === 'number' && Number.isFinite(latency)) {
    parsedLatency = latency;
  } else {
    throw new Error(
      `controller-state: ${ctx} \`median_disposition_latency_ms\` must be a finite number or null`,
    );
  }
  return {
    classification_completeness: requireNumber(
      raw,
      'classification_completeness',
      ctx,
    ),
    average_coverage: requireNumber(raw, 'average_coverage', ctx),
    violation_density: requireNumber(raw, 'violation_density', ctx),
    average_surface_variance: requireNumber(
      raw,
      'average_surface_variance',
      ctx,
    ),
    catalog_edit_rate: requireNumber(raw, 'catalog_edit_rate', ctx),
    pending_count: requireNumber(raw, 'pending_count', ctx),
    median_disposition_latency_ms: parsedLatency,
  };
}

/**
 * Load the durable controller state from disk. Returns an empty
 * history (cold-start) when the file is absent. Throws on malformed
 * file.
 */
export async function loadControllerState(
  repoRoot: string,
  runtimeDirOverride?: string,
): Promise<ReadonlyArray<ControllerHistoryEntry>> {
  let runtimeDir = runtimeDirOverride;
  if (runtimeDir === undefined) {
    const llmConfig = await loadLlmConfig(repoRoot);
    runtimeDir = llmConfig.orchestratorRuntimeDir;
  }
  const path = statePath(repoRoot, runtimeDir);
  try {
    const text = await readFile(path, 'utf8');
    const file = parseStateFile(text, path);
    return file.history;
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
}

/**
 * Persist a new history (with the just-produced decision prepended)
 * to the durable runtime dir. Caller is responsible for prepending
 * the new entry; this function just writes whatever it's given (after
 * truncating to `DEFAULT_HISTORY_RETENTION`).
 */
export async function persistControllerState(
  repoRoot: string,
  history: ReadonlyArray<ControllerHistoryEntry>,
  runtimeDirOverride?: string,
): Promise<void> {
  let runtimeDir = runtimeDirOverride;
  if (runtimeDir === undefined) {
    const llmConfig = await loadLlmConfig(repoRoot);
    runtimeDir = llmConfig.orchestratorRuntimeDir;
  }
  const path = statePath(repoRoot, runtimeDir);
  await mkdir(dirname(path), { recursive: true });
  const truncated = history.slice(0, DEFAULT_HISTORY_RETENTION);
  const data: ControllerStateFile = {
    version: 1,
    history: truncated,
  };
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * Convenience: prepend a new entry to the existing history and persist.
 * The new entry takes index 0; older entries shift down; the tail
 * beyond `DEFAULT_HISTORY_RETENTION` is dropped.
 */
export async function appendControllerEntry(
  repoRoot: string,
  entry: ControllerHistoryEntry,
  runtimeDirOverride?: string,
): Promise<ReadonlyArray<ControllerHistoryEntry>> {
  const current = await loadControllerState(repoRoot, runtimeDirOverride);
  const next: ControllerHistoryEntry[] = [entry, ...current];
  await persistControllerState(repoRoot, next, runtimeDirOverride);
  return next.slice(0, DEFAULT_HISTORY_RETENTION);
}
