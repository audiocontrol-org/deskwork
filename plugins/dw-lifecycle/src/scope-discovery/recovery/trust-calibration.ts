/**
 * plugins/dw-lifecycle/src/scope-discovery/recovery/trust-calibration.ts
 *
 * Trust calibration state + adjustment logic.
 *
 * # Responsibilities
 *
 *   1. Compute a CLASS-KEY for a wrong-decision event (used by both
 *      this module's per-class accounting AND `systematic-wrongness.ts`).
 *
 *   2. Load + persist `trust-calibration.json` under the orchestrator
 *      runtime directory (gitignored, orchestrator-private). Path
 *      defaults to
 *      `.dw-lifecycle/scope-discovery/orchestrator-runtime/trust-calibration.json`.
 *
 *   3. Apply per-event adjustments to the persisted calibration:
 *      wrong-decision events raise the relevant class's threshold
 *      delta by +0.05; correct-decision events ratchet it down by
 *      -0.01. Bounded [0.0, 0.4]. (per task pre-made decision #2.)
 *
 *   4. Expose a calibrated-threshold lookup the controller (or any
 *      caller) can call per-class: `effectiveThreshold(baseline, cal,
 *      classKey)`.
 *
 * # Why a separate file from `controller-state.ts`
 *
 * Per `recovery-types.ts` docstring: trust calibration is finer-
 * grained than the controller's per-turn decisions and updates on
 * EVERY wrong/correct event (not per-turn). Splitting the file keeps
 * each surface's read/write footprint stable.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadLlmConfig } from '../llm/config.js';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { CatalogStatus } from '../util/catalog-status.js';
import type {
  TrustCalibration,
  TrustCalibrationEvent,
  WrongDecisionEvent,
} from './recovery-types.js';
import {
  CORRECT_DECISION_THRESHOLD_DELTA,
  DEFAULT_TRUST_LOOKBACK_WINDOW,
  MAX_TRUST_THRESHOLD_ADJUSTMENT,
  MIN_TRUST_THRESHOLD_ADJUSTMENT,
  WRONG_DECISION_THRESHOLD_DELTA,
} from './recovery-types.js';

export const TRUST_CALIBRATION_FILENAME = 'trust-calibration.json';

/**
 * The default empty calibration — used when no file exists yet. All
 * adjustments start at 0.0 (baseline trust); the ring buffer is empty.
 */
export const EMPTY_TRUST_CALIBRATION: TrustCalibration = {
  version: 1,
  globalThresholdAdjustment: 0.0,
  perClassThresholdAdjustments: {},
  recentEvents: [],
};

/**
 * Derive a shape-tag from a registry path. Strips the `.yaml` (or
 * `.yml`) extension and any leading path so cross-registry
 * comparisons share a stable token.
 *
 *   `anti-patterns.yaml`        → `anti-patterns`
 *   `path/to/clones.yaml`       → `clones`
 *   `adopter-manifests.yml`     → `adopter-manifests`
 *   `pattern-matrix-patterns`   → `pattern-matrix-patterns` (unchanged)
 */
export function deriveShapeTag(registryPath: string): string {
  const baseIdx = Math.max(
    registryPath.lastIndexOf('/'),
    registryPath.lastIndexOf('\\'),
  );
  const base = baseIdx === -1 ? registryPath : registryPath.substring(baseIdx + 1);
  return base.replace(/\.ya?ml$/i, '');
}

/**
 * Build the class-key for a wrong-decision event. Per
 * `recovery-types.ts`: `<pattern-type>|<disposition>|<shape-tag>`.
 *
 *   - `pattern-type` defaults to `untyped` when absent on the event.
 *   - `disposition` is the prior status (what the agent had set; the
 *     reversal target is uniformly `withdrawn`, so encoding the prior
 *     status is the discriminator that matters for systematic-
 *     wrongness clustering).
 *   - `shape-tag` from the registry path.
 */
export function classKeyForEvent(event: WrongDecisionEvent): string {
  const pt = event.patternType ?? 'untyped';
  const shape = deriveShapeTag(event.registryPath);
  return `${pt}|${event.priorStatus}|${shape}`;
}

/**
 * Build a class-key from explicit components — used by the
 * orchestrator when looking up an existing calibration delta for a
 * known class without an event in hand.
 */
export function classKeyForComponents(
  patternType: string | undefined,
  priorStatus: CatalogStatus,
  registryPath: string,
): string {
  const pt = patternType ?? 'untyped';
  const shape = deriveShapeTag(registryPath);
  return `${pt}|${priorStatus}|${shape}`;
}

function clamp(value: number): number {
  if (value < MIN_TRUST_THRESHOLD_ADJUSTMENT) return MIN_TRUST_THRESHOLD_ADJUSTMENT;
  if (value > MAX_TRUST_THRESHOLD_ADJUSTMENT) return MAX_TRUST_THRESHOLD_ADJUSTMENT;
  return value;
}

/**
 * Apply one wrong-decision event to the calibration:
 *   - Raises the event's class adjustment by +0.05 (bounded).
 *   - Raises the global adjustment by (delta / max(1, distinct-classes))
 *     so the global signal averages across classes rather than
 *     summing unbounded.
 *   - Prepends a `{ kind: 'wrong' }` event to the ring buffer
 *     (newest-first), truncating to `windowSize`.
 *
 * Pure — returns a new calibration; mutates nothing.
 */
export function applyWrongDecision(
  calibration: TrustCalibration,
  event: WrongDecisionEvent,
  windowSize: number = DEFAULT_TRUST_LOOKBACK_WINDOW,
): TrustCalibration {
  const classKey = classKeyForEvent(event);
  const priorClassValue =
    calibration.perClassThresholdAdjustments[classKey] ?? 0.0;
  const newClassValue = clamp(priorClassValue + WRONG_DECISION_THRESHOLD_DELTA);
  const nextPerClass: Record<string, number> = {
    ...calibration.perClassThresholdAdjustments,
    [classKey]: newClassValue,
  };
  const distinctClasses = Math.max(1, Object.keys(nextPerClass).length);
  const newGlobal = clamp(
    calibration.globalThresholdAdjustment +
      WRONG_DECISION_THRESHOLD_DELTA / distinctClasses,
  );
  const nextEvent: TrustCalibrationEvent = {
    classKey,
    kind: 'wrong',
    at: event.detectedAt,
  };
  const recentEvents = [nextEvent, ...calibration.recentEvents].slice(
    0,
    windowSize,
  );
  return {
    version: 1,
    globalThresholdAdjustment: newGlobal,
    perClassThresholdAdjustments: nextPerClass,
    recentEvents,
  };
}

/**
 * Apply one correct-decision event to the calibration: ratchets the
 * specified class's adjustment DOWN by -0.01 (bounded by 0.0); also
 * decreases the global adjustment by (delta / max(1, distinct-classes)).
 * Prepends a `{ kind: 'correct' }` event to the ring buffer.
 *
 * The `classKey` is supplied explicitly because correct decisions are
 * not driven by a `WrongDecisionEvent` — they're verified-<date>
 * audit-log entries that the consumer attributes to a class.
 * `correctDecisionAt` is the ISO-8601 timestamp.
 */
export function applyCorrectDecision(
  calibration: TrustCalibration,
  classKey: string,
  correctDecisionAt: string,
  windowSize: number = DEFAULT_TRUST_LOOKBACK_WINDOW,
): TrustCalibration {
  const priorClassValue =
    calibration.perClassThresholdAdjustments[classKey] ?? 0.0;
  const newClassValue = clamp(priorClassValue - CORRECT_DECISION_THRESHOLD_DELTA);
  const nextPerClass: Record<string, number> = {
    ...calibration.perClassThresholdAdjustments,
    [classKey]: newClassValue,
  };
  const distinctClasses = Math.max(1, Object.keys(nextPerClass).length);
  const newGlobal = clamp(
    calibration.globalThresholdAdjustment -
      CORRECT_DECISION_THRESHOLD_DELTA / distinctClasses,
  );
  const nextEvent: TrustCalibrationEvent = {
    classKey,
    kind: 'correct',
    at: correctDecisionAt,
  };
  const recentEvents = [nextEvent, ...calibration.recentEvents].slice(
    0,
    windowSize,
  );
  return {
    version: 1,
    globalThresholdAdjustment: newGlobal,
    perClassThresholdAdjustments: nextPerClass,
    recentEvents,
  };
}

/**
 * Compute the calibrated effective threshold for a given class.
 *
 *   effective = baseline + max(perClass[class], globalAdjustment)
 *
 * Per pre-made decision #2: trust calibration adjusts auto-disposition
 * confidence UP per wrong-decision event. The per-class adjustment is
 * the primary signal; the global adjustment is the floor (so a class
 * with no specific history still inherits some calibration when the
 * global signal is non-zero). The result is clamped to [0.0, 1.0] so
 * downstream callers never get an out-of-range threshold.
 */
export function effectiveThreshold(
  baseline: number,
  calibration: TrustCalibration,
  classKey: string,
): number {
  const perClass = calibration.perClassThresholdAdjustments[classKey] ?? 0.0;
  const adjustment = Math.max(perClass, calibration.globalThresholdAdjustment);
  const raw = baseline + adjustment;
  if (raw < 0.0) return 0.0;
  if (raw > 1.0) return 1.0;
  return raw;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function statePath(repoRoot: string, runtimeDir: string): string {
  return resolve(repoRoot, runtimeDir, TRUST_CALIBRATION_FILENAME);
}

function parseEvent(raw: unknown, ctx: string): TrustCalibrationEvent {
  if (!isPlainObject(raw)) {
    throw new Error(`trust-calibration: ${ctx} must be an object`);
  }
  const classKey = raw['classKey'];
  if (typeof classKey !== 'string' || classKey.length === 0) {
    throw new Error(
      `trust-calibration: ${ctx} \`classKey\` must be a non-empty string`,
    );
  }
  const kind = raw['kind'];
  if (kind !== 'wrong' && kind !== 'correct') {
    throw new Error(
      `trust-calibration: ${ctx} \`kind\` must be "wrong" or "correct"; got ${String(kind)}`,
    );
  }
  const at = raw['at'];
  if (typeof at !== 'string' || at.length === 0) {
    throw new Error(
      `trust-calibration: ${ctx} \`at\` must be a non-empty string`,
    );
  }
  return { classKey, kind, at };
}

function parseFile(text: string, ctx: string): TrustCalibration {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `trust-calibration: cannot parse ${ctx}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `trust-calibration: ${ctx} did not parse to an object`,
    );
  }
  const version = parsed['version'];
  if (version !== 1) {
    throw new Error(
      `trust-calibration: ${ctx} has unsupported version ${String(version)}; expected 1`,
    );
  }
  const globalRaw = parsed['globalThresholdAdjustment'];
  if (typeof globalRaw !== 'number' || !Number.isFinite(globalRaw)) {
    throw new Error(
      `trust-calibration: ${ctx} \`globalThresholdAdjustment\` must be a finite number`,
    );
  }
  const perClassRaw = parsed['perClassThresholdAdjustments'];
  if (!isPlainObject(perClassRaw)) {
    throw new Error(
      `trust-calibration: ${ctx} \`perClassThresholdAdjustments\` must be an object`,
    );
  }
  const perClass: Record<string, number> = {};
  for (const [k, v] of Object.entries(perClassRaw)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(
        `trust-calibration: ${ctx} \`perClassThresholdAdjustments[${k}]\` must be a finite number`,
      );
    }
    perClass[k] = v;
  }
  const recentRaw = parsed['recentEvents'];
  if (!Array.isArray(recentRaw)) {
    throw new Error(
      `trust-calibration: ${ctx} \`recentEvents\` must be an array`,
    );
  }
  const recentEvents = recentRaw.map((item, idx) =>
    parseEvent(item, `${ctx}#/recentEvents/${idx}`),
  );
  return {
    version: 1,
    globalThresholdAdjustment: globalRaw,
    perClassThresholdAdjustments: perClass,
    recentEvents,
  };
}

/**
 * Load the durable trust calibration. Returns `EMPTY_TRUST_CALIBRATION`
 * verbatim when the file is absent (cold-start). Throws on malformed
 * file (per project rule: no silent fallback).
 */
export async function loadTrustCalibration(
  repoRoot: string,
  runtimeDirOverride?: string,
): Promise<TrustCalibration> {
  let runtimeDir = runtimeDirOverride;
  if (runtimeDir === undefined) {
    const llmConfig = await loadLlmConfig(repoRoot);
    runtimeDir = llmConfig.orchestratorRuntimeDir;
  }
  const path = statePath(repoRoot, runtimeDir);
  try {
    const text = await readFile(path, 'utf8');
    return parseFile(text, path);
  } catch (err) {
    if (isEnoent(err)) return EMPTY_TRUST_CALIBRATION;
    throw err;
  }
}

/**
 * Persist a new trust calibration to disk. Creates parent directories
 * as needed.
 */
export async function persistTrustCalibration(
  repoRoot: string,
  calibration: TrustCalibration,
  runtimeDirOverride?: string,
): Promise<void> {
  let runtimeDir = runtimeDirOverride;
  if (runtimeDir === undefined) {
    const llmConfig = await loadLlmConfig(repoRoot);
    runtimeDir = llmConfig.orchestratorRuntimeDir;
  }
  const path = statePath(repoRoot, runtimeDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(calibration, null, 2)}\n`, 'utf8');
}
