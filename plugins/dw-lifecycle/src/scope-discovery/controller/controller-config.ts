/**
 * plugins/dw-lifecycle/src/scope-discovery/controller/controller-config.ts
 *
 * Loader + defaults for the Phase 11 Task 5 controller. The config
 * YAML lives at `.dw-lifecycle/scope-discovery/controller-config.yaml`
 * (operator-owned, repo-scoped). Defaults match the pre-made decisions:
 *
 *   - Cold-start = max-frequency (1.0) + max-intensity (1.0).
 *   - Ratchet-down rate = 10% per N=5 turns of low drift.
 *   - Anti-thrashing damping = 50% when proposed adjustment reverses
 *     prior K=3 adjustments.
 *
 * The schema (a sibling JSON Schema at
 * `schema/controller-config.yaml.schema.json`) documents the contract
 * for adopters' editors. The loader validates by hand (no schema
 * compilation at load-time; the JSON Schema is a documentation
 * surface). Invariant errors throw loudly per the project rule against
 * silent fallbacks.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { ControllerConfig } from './controller-types.js';

export const CONTROLLER_CONFIG_PATH =
  '.dw-lifecycle/scope-discovery/controller-config.yaml';

/**
 * Default controller config. Every field documented in
 * `controller-types.ts`'s `ControllerConfig` interface; defaults
 * match the Phase 11 Task 5 pre-made decisions.
 */
export const DEFAULT_CONTROLLER_CONFIG: ControllerConfig = {
  cold_start_frequency: 1.0,
  cold_start_intensity: 1.0,
  cold_start_escalation_threshold: 0.9,
  ratchet_down_rate: 0.1,
  ratchet_down_window: 5,
  low_drift_threshold: 0.1,
  high_drift_threshold: 0.4,
  anti_thrashing_window: 3,
  anti_thrashing_damping_factor: 0.5,
  auditor_correction_high_threshold: 0.5,
  frequency_min: 0.1,
  frequency_max: 1.0,
  intensity_min: 0.2,
  intensity_max: 1.0,
  escalation_min: 0.3,
  escalation_max: 1.0,
};

function requireNumberInRange(
  raw: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  ctx: string,
): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      `controller-config: ${ctx} \`${field}\` must be a finite number`,
    );
  }
  if (v < min || v > max) {
    throw new Error(
      `controller-config: ${ctx} \`${field}\` must be in [${min}, ${max}]; got ${v}`,
    );
  }
  return v;
}

function requirePositiveInteger(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
    throw new Error(
      `controller-config: ${ctx} \`${field}\` must be an integer`,
    );
  }
  if (v < 1) {
    throw new Error(
      `controller-config: ${ctx} \`${field}\` must be >= 1; got ${v}`,
    );
  }
  return v;
}

function optionalNumberInRange(
  raw: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  ctx: string,
  fallback: number,
): number {
  if (raw[field] === undefined || raw[field] === null) return fallback;
  return requireNumberInRange(raw, field, min, max, ctx);
}

function optionalPositiveInteger(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
  fallback: number,
): number {
  if (raw[field] === undefined || raw[field] === null) return fallback;
  return requirePositiveInteger(raw, field, ctx);
}

/**
 * Parse a raw mapping into a validated `ControllerConfig`. Throws on
 * shape / range violations. Fields the YAML omits fall through to
 * `DEFAULT_CONTROLLER_CONFIG`'s values — operators can override one
 * knob at a time without re-stating every field.
 *
 * Cross-field invariants:
 *   - frequency_min <= cold_start_frequency <= frequency_max
 *   - intensity_min <= cold_start_intensity <= intensity_max
 *   - escalation_min <= cold_start_escalation_threshold <= escalation_max
 *   - low_drift_threshold <= high_drift_threshold
 *
 * These are NON-NEGOTIABLE — they're not warnings; the loader throws.
 */
export function parseControllerConfig(
  raw: unknown,
  ctx: string,
): ControllerConfig {
  if (!isPlainObject(raw)) {
    throw new Error(
      `controller-config: ${ctx} must parse to a YAML object; got ${typeof raw}`,
    );
  }
  const d = DEFAULT_CONTROLLER_CONFIG;
  const config: ControllerConfig = {
    cold_start_frequency: optionalNumberInRange(
      raw,
      'cold_start_frequency',
      0,
      1,
      ctx,
      d.cold_start_frequency,
    ),
    cold_start_intensity: optionalNumberInRange(
      raw,
      'cold_start_intensity',
      0,
      1,
      ctx,
      d.cold_start_intensity,
    ),
    cold_start_escalation_threshold: optionalNumberInRange(
      raw,
      'cold_start_escalation_threshold',
      0,
      1,
      ctx,
      d.cold_start_escalation_threshold,
    ),
    ratchet_down_rate: optionalNumberInRange(
      raw,
      'ratchet_down_rate',
      0,
      1,
      ctx,
      d.ratchet_down_rate,
    ),
    ratchet_down_window: optionalPositiveInteger(
      raw,
      'ratchet_down_window',
      ctx,
      d.ratchet_down_window,
    ),
    low_drift_threshold: optionalNumberInRange(
      raw,
      'low_drift_threshold',
      0,
      1,
      ctx,
      d.low_drift_threshold,
    ),
    high_drift_threshold: optionalNumberInRange(
      raw,
      'high_drift_threshold',
      0,
      1,
      ctx,
      d.high_drift_threshold,
    ),
    anti_thrashing_window: optionalPositiveInteger(
      raw,
      'anti_thrashing_window',
      ctx,
      d.anti_thrashing_window,
    ),
    anti_thrashing_damping_factor: optionalNumberInRange(
      raw,
      'anti_thrashing_damping_factor',
      0,
      1,
      ctx,
      d.anti_thrashing_damping_factor,
    ),
    auditor_correction_high_threshold: optionalNumberInRange(
      raw,
      'auditor_correction_high_threshold',
      0,
      1,
      ctx,
      d.auditor_correction_high_threshold,
    ),
    frequency_min: optionalNumberInRange(
      raw,
      'frequency_min',
      0,
      1,
      ctx,
      d.frequency_min,
    ),
    frequency_max: optionalNumberInRange(
      raw,
      'frequency_max',
      0,
      1,
      ctx,
      d.frequency_max,
    ),
    intensity_min: optionalNumberInRange(
      raw,
      'intensity_min',
      0,
      1,
      ctx,
      d.intensity_min,
    ),
    intensity_max: optionalNumberInRange(
      raw,
      'intensity_max',
      0,
      1,
      ctx,
      d.intensity_max,
    ),
    escalation_min: optionalNumberInRange(
      raw,
      'escalation_min',
      0,
      1,
      ctx,
      d.escalation_min,
    ),
    escalation_max: optionalNumberInRange(
      raw,
      'escalation_max',
      0,
      1,
      ctx,
      d.escalation_max,
    ),
  };
  validateInvariants(config, ctx);
  return config;
}

function validateInvariants(c: ControllerConfig, ctx: string): void {
  if (c.frequency_min > c.frequency_max) {
    throw new Error(
      `controller-config: ${ctx} frequency_min (${c.frequency_min}) > frequency_max (${c.frequency_max})`,
    );
  }
  if (c.intensity_min > c.intensity_max) {
    throw new Error(
      `controller-config: ${ctx} intensity_min (${c.intensity_min}) > intensity_max (${c.intensity_max})`,
    );
  }
  if (c.escalation_min > c.escalation_max) {
    throw new Error(
      `controller-config: ${ctx} escalation_min (${c.escalation_min}) > escalation_max (${c.escalation_max})`,
    );
  }
  if (
    c.cold_start_frequency < c.frequency_min ||
    c.cold_start_frequency > c.frequency_max
  ) {
    throw new Error(
      `controller-config: ${ctx} cold_start_frequency (${c.cold_start_frequency}) outside [${c.frequency_min}, ${c.frequency_max}]`,
    );
  }
  if (
    c.cold_start_intensity < c.intensity_min ||
    c.cold_start_intensity > c.intensity_max
  ) {
    throw new Error(
      `controller-config: ${ctx} cold_start_intensity (${c.cold_start_intensity}) outside [${c.intensity_min}, ${c.intensity_max}]`,
    );
  }
  if (
    c.cold_start_escalation_threshold < c.escalation_min ||
    c.cold_start_escalation_threshold > c.escalation_max
  ) {
    throw new Error(
      `controller-config: ${ctx} cold_start_escalation_threshold (${c.cold_start_escalation_threshold}) outside [${c.escalation_min}, ${c.escalation_max}]`,
    );
  }
  if (c.low_drift_threshold > c.high_drift_threshold) {
    throw new Error(
      `controller-config: ${ctx} low_drift_threshold (${c.low_drift_threshold}) > high_drift_threshold (${c.high_drift_threshold})`,
    );
  }
}

/**
 * Load the controller config from a repo root. Returns
 * `DEFAULT_CONTROLLER_CONFIG` when the file is absent. Throws on
 * malformed YAML or invariant violation.
 */
export async function loadControllerConfig(
  repoRoot: string,
): Promise<ControllerConfig> {
  const absPath = resolve(repoRoot, CONTROLLER_CONFIG_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return DEFAULT_CONTROLLER_CONFIG;
    throw new Error(
      `controller-config: cannot read ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `controller-config: cannot parse ${absPath}: ${errorMessage(err)}`,
    );
  }
  return parseControllerConfig(parsed, absPath);
}
