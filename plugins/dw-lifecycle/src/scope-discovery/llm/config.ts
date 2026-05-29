/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/config.ts
 *
 * Loader for `.dw-lifecycle/scope-discovery/llm-judge.yaml`. When the
 * file is absent we return documented defaults (per the LLM judge + external auditor
 * pre-made decision #1: "the actual LLM API integration is OUT OF
 * SCOPE"; the agent type + model are NAMES the orchestrator's
 * dispatch function interprets, not network endpoints).
 *
 * No silent fallback — when the file IS present, parse errors throw
 * loudly so adopters with a malformed config get an actionable error
 * rather than silently-degraded behavior.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';
import type { LlmConfig } from './types.js';

export const LLM_CONFIG_PATH =
  '.dw-lifecycle/scope-discovery/llm-judge.yaml';

/**
 * Defaults exported for tests + adopters who want to reference what
 * the runtime falls through to when no config YAML is present.
 *
 * - `judge.agentType` — the agent-type token the dispatch function
 *   uses to address the judge. The orchestrator's `DispatchFn`
 *   implementation maps this to a real sub-agent or LLM endpoint.
 * - `judge.confidenceFloor` — proposals BELOW this floor are still
 *   surfaced, but the controller (Task 5) treats them as escalation
 *   candidates by default.
 * - `auditor.pendingAuditsDir` — repo-relative directory where audit
 *   requests land. Per Task 6's resumability decision the runtime
 *   scratch directory `.dw-lifecycle/scope-discovery/
 *   orchestrator-runtime/` is gitignored; the pending-audits dir is
 *   its sibling, also gitignored.
 */
export const DEFAULT_LLM_CONFIG: LlmConfig = {
  judge: {
    model: 'claude-sonnet-4',
    agentType: 'scope-discovery-judge',
    confidenceFloor: 0.7,
  },
  auditor: {
    model: 'claude-opus-4',
    pendingAuditsDir: '.dw-lifecycle/scope-discovery/pending-audits',
  },
  orchestratorRuntimeDir:
    '.dw-lifecycle/scope-discovery/orchestrator-runtime',
};

function requireString(
  raw: Record<string, unknown>,
  section: string,
  field: string,
  ctx: string,
): string {
  const v = raw[field];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(
      `llm-config: ${ctx} \`${section}.${field}\` must be a non-empty string`,
    );
  }
  return v;
}

function requireNumberInRange(
  raw: Record<string, unknown>,
  section: string,
  field: string,
  ctx: string,
  min: number,
  max: number,
): number {
  const v = raw[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      `llm-config: ${ctx} \`${section}.${field}\` must be a finite number`,
    );
  }
  if (v < min || v > max) {
    throw new Error(
      `llm-config: ${ctx} \`${section}.${field}\` must be in [${min}, ${max}]; got ${v}`,
    );
  }
  return v;
}

function parseJudgeSection(
  raw: unknown,
  ctx: string,
): LlmConfig['judge'] {
  if (!isPlainObject(raw)) {
    throw new Error(`llm-config: ${ctx} \`judge\` must be a mapping`);
  }
  const model = requireString(raw, 'judge', 'model', ctx);
  const agentType = requireString(raw, 'judge', 'agent_type', ctx);
  const confidenceFloor = requireNumberInRange(
    raw,
    'judge',
    'confidence_floor',
    ctx,
    0,
    1,
  );
  return { model, agentType, confidenceFloor };
}

function parseAuditorSection(
  raw: unknown,
  ctx: string,
): LlmConfig['auditor'] {
  if (!isPlainObject(raw)) {
    throw new Error(`llm-config: ${ctx} \`auditor\` must be a mapping`);
  }
  const model = requireString(raw, 'auditor', 'model', ctx);
  const pendingAuditsDir = requireString(
    raw,
    'auditor',
    'pending_audits_dir',
    ctx,
  );
  return { model, pendingAuditsDir };
}

/**
 * Load LLM configuration from
 * `.dw-lifecycle/scope-discovery/llm-judge.yaml`.
 *
 * Returns `DEFAULT_LLM_CONFIG` (verbatim) when the file is absent —
 * the orchestrator's wired-up judge/auditor surfaces still need the
 * default agent-type tokens to dispatch, even when no project-level
 * override is in play.
 */
export async function loadLlmConfig(repoRoot: string): Promise<LlmConfig> {
  const absPath = resolve(repoRoot, LLM_CONFIG_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return DEFAULT_LLM_CONFIG;
    throw new Error(
      `llm-config: cannot read ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `llm-config: cannot parse ${absPath}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `llm-config: ${absPath} did not parse to a YAML object`,
    );
  }
  const ctx = absPath;
  const judgeRaw = parsed['judge'];
  const auditorRaw = parsed['auditor'];
  if (judgeRaw === undefined) {
    throw new Error(`llm-config: ${ctx} missing required \`judge:\` section`);
  }
  if (auditorRaw === undefined) {
    throw new Error(
      `llm-config: ${ctx} missing required \`auditor:\` section`,
    );
  }
  const judge = parseJudgeSection(judgeRaw, ctx);
  const auditor = parseAuditorSection(auditorRaw, ctx);
  const orchestratorRuntimeDirRaw = parsed['orchestrator_runtime_dir'];
  let orchestratorRuntimeDir = DEFAULT_LLM_CONFIG.orchestratorRuntimeDir;
  if (orchestratorRuntimeDirRaw !== undefined) {
    if (
      typeof orchestratorRuntimeDirRaw !== 'string' ||
      orchestratorRuntimeDirRaw.length === 0
    ) {
      throw new Error(
        `llm-config: ${ctx} \`orchestrator_runtime_dir\` must be a non-empty string when set`,
      );
    }
    orchestratorRuntimeDir = orchestratorRuntimeDirRaw;
  }
  return {
    judge,
    auditor,
    orchestratorRuntimeDir,
  };
}
