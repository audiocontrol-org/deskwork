/**
 * plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/loop-config.ts
 *
 * Phase 11 Task 6 — Loader + defaults for the orchestrator loop.
 *
 * Config YAML lives at `.dw-lifecycle/scope-discovery/loop-config.yaml`
 * when adopters want to override. Schema is intentionally narrow — the
 * loop is composition over existing libraries, so most tunables live on
 * the dependent libraries' own configs (`controller-config.yaml`,
 * `llm-judge.yaml`). The loop-level config carries only:
 *
 *   - `turn_history_retention` — bounded ring buffer for loop-state.
 *   - `auto_apply_confidence_floor` — confidence-floor for auto-applying
 *     judge proposals (orchestrator-agent reads this to decide
 *     auto-apply vs queue-for-escalation).
 *
 * No silent fallback — when the file IS present, parse errors throw
 * loudly so adopters get an actionable error rather than degraded
 * behavior.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { LoopConfig } from './loop-types.js';

export const LOOP_CONFIG_PATH =
  '.dw-lifecycle/scope-discovery/loop-config.yaml';

/**
 * Defaults exported for tests + adopters who want to reference what
 * the runtime falls through to when no override is in play.
 *
 * Defaults match the Phase 11 Task 6 pre-made decisions:
 *
 *   - `turn_history_retention = 24` mirrors `controller-state.ts`'s
 *     `DEFAULT_HISTORY_RETENTION` — the same value powers both the
 *     loop and controller history windows, kept consistent so the
 *     anti-thrashing window the controller uses always has enough
 *     loop-state retention to back it.
 *   - `auto_apply_confidence_floor = 0.7` matches
 *     `DEFAULT_LLM_CONFIG.judge.confidenceFloor`. The orchestrator
 *     uses the larger-of-two between this and the controller's
 *     `escalationThreshold` so the more conservative bound wins.
 */
export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  turn_history_retention: 24,
  auto_apply_confidence_floor: 0.7,
};

function requirePositiveInteger(
  raw: Record<string, unknown>,
  field: string,
  ctx: string,
): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      `loop-config: ${ctx} \`${field}\` must be a finite number`,
    );
  }
  if (!Number.isInteger(v) || v < 1) {
    throw new Error(
      `loop-config: ${ctx} \`${field}\` must be a positive integer; got ${v}`,
    );
  }
  return v;
}

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
      `loop-config: ${ctx} \`${field}\` must be a finite number`,
    );
  }
  if (v < min || v > max) {
    throw new Error(
      `loop-config: ${ctx} \`${field}\` must be in [${min}, ${max}]; got ${v}`,
    );
  }
  return v;
}

/**
 * Load the orchestrator-loop config from
 * `.dw-lifecycle/scope-discovery/loop-config.yaml`.
 *
 * Returns `DEFAULT_LOOP_CONFIG` (verbatim) when the file is absent.
 * Throws on malformed YAML or invalid field values.
 */
export async function loadLoopConfig(repoRoot: string): Promise<LoopConfig> {
  const absPath = resolve(repoRoot, LOOP_CONFIG_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return DEFAULT_LOOP_CONFIG;
    throw new Error(
      `loop-config: cannot read ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `loop-config: cannot parse ${absPath}: ${errorMessage(err)}`,
    );
  }
  if (parsed === null) return DEFAULT_LOOP_CONFIG;
  if (!isPlainObject(parsed)) {
    throw new Error(
      `loop-config: ${absPath} did not parse to a YAML object`,
    );
  }
  // Partial overrides honored: missing fields fall through to defaults.
  let turnHistoryRetention = DEFAULT_LOOP_CONFIG.turn_history_retention;
  if (parsed['turn_history_retention'] !== undefined) {
    turnHistoryRetention = requirePositiveInteger(
      parsed,
      'turn_history_retention',
      absPath,
    );
  }
  let autoApplyFloor = DEFAULT_LOOP_CONFIG.auto_apply_confidence_floor;
  if (parsed['auto_apply_confidence_floor'] !== undefined) {
    autoApplyFloor = requireNumberInRange(
      parsed,
      'auto_apply_confidence_floor',
      0,
      1,
      absPath,
    );
  }
  return {
    turn_history_retention: turnHistoryRetention,
    auto_apply_confidence_floor: autoApplyFloor,
  };
}
