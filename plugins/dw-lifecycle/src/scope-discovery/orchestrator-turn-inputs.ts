/**
 * plugins/dw-lifecycle/src/scope-discovery/orchestrator-turn-inputs.ts
 *
 * Opt-in JSON input loader + structural narrower for the
 * `--judge-input` / `--auditor-input` flags on the
 * `dw-lifecycle orchestrator-turn` verb. Extracted from the main
 * assembler so the assembler stays under the file-size cap.
 *
 * Both `JudgeInput` and `AuditorInput` are large structured types
 * built by upstream callers; the narrowers here check the top-level
 * required fields so a mistyped JSON path surfaces a clear error.
 * Stricter validation lives downstream in `runInternalJudge` /
 * `fireExternalAudit` — by intention. This module's narrowers are a
 * type-safety gate, not the schema authority.
 */

import { readFile } from 'node:fs/promises';
import type { AuditorInput, JudgeInput } from './llm/types.js';
import { errorMessage, isEnoent, isPlainObject } from './util/typeguards.js';

/**
 * Read + JSON.parse `path` and return the result as `unknown`.
 * Throws with a contextual error message when the file is missing
 * or malformed (the operator pointed at a bad file — say so).
 *
 * Returns `unknown` deliberately — callers narrow via their own
 * shape-checks rather than relying on an unsafe `as Type` cast.
 */
export async function loadJsonInputUnknown(
  path: string,
  label: string,
): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) {
      throw new Error(
        `orchestrator-turn: ${label} file not found: ${path}`,
      );
    }
    throw new Error(
      `orchestrator-turn: cannot read ${label} ${path}: ${errorMessage(err)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `orchestrator-turn: cannot parse ${label} ${path}: ${errorMessage(err)}`,
    );
  }
}

/**
 * Narrow an unknown JSON value to `JudgeInput`. Structural check on
 * the four required fields (`featureSlug` + `recentWork` +
 * `openCandidates` + `catalogState`). Stricter validation lives
 * downstream in `runInternalJudge`.
 *
 * Per the project's no-`as Type` rule, narrowing is via `isPlainObject`
 * + per-key property access on the narrowed `Record<string, unknown>`.
 */
export function isJudgeInputShape(value: unknown): value is JudgeInput {
  if (!isPlainObject(value)) return false;
  if (typeof value['featureSlug'] !== 'string') return false;
  if (!isPlainObject(value['recentWork'])) return false;
  if (!Array.isArray(value['openCandidates'])) return false;
  if (!isPlainObject(value['catalogState'])) return false;
  return true;
}

/** Narrow an unknown JSON value to `AuditorInput`. Same approach. */
export function isAuditorInputShape(value: unknown): value is AuditorInput {
  if (!isPlainObject(value)) return false;
  if (typeof value['featureSlug'] !== 'string') return false;
  if (!isPlainObject(value['recentWork'])) return false;
  if (!Array.isArray(value['judgeProposals'])) return false;
  if (!isPlainObject(value['catalogState'])) return false;
  return true;
}
