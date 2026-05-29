/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/semantic.ts
 *
 * Semantic (LLM-augmented) pattern handler — the discovered_candidates stub.
 *
 * # Two code paths
 *
 * The `semanticHandler` (the PatternHandler<SemanticEntry> exported
 * below) is SYNCHRONOUS — it preserves the polymorphic dispatcher's
 * sync contract. The sync path is the file-enumeration stub: it
 * counts glob-matched files + returns zero hits + sets `metrics.stub`.
 * Adopters who haven't wired a judge dispatcher (the default case) see
 * this stub output and a one-line stderr advisory.
 *
 * The `enrichSemanticFinding` async helper takes the sync stub output
 * + a judge `DispatchFn` and upgrades it to a real LLM-judge-driven
 * finding. This is the wired path the orchestrator uses when running
 * scope-inventory with the per-turn judge active.
 *
 * Splitting sync (stub) from async (wired) keeps the sync dispatch
 * contract intact + enables the LLM path without forcing every
 * scope-inventory caller to thread a dispatcher through. Per the
 * the LLM judge + external auditor pre-made decision: the library defines the SHAPE of
 * the call; the orchestrator-agent performs the actual dispatch.
 *
 * # Issue #319 closure
 *
 * the polymorphic dispatcher shipped + the sync stub
 * with a tracking link at https://github.com/audiocontrol-org/deskwork/issues/319.
 * This dispatch closes the wiring gap: the sync path stays for
 * backward compatibility; the async `enrichSemanticFinding` path is
 * the wired LLM-judge invocation.
 *
 * # When LLM judging fires a finding
 *
 * Per-file: render the entry's `promptTemplate` with the file content;
 * dispatch via the judge; parse the judge's confidence on whether the
 * file ADHERES to the semantic constraint. When the judge's confidence
 * is BELOW the entry's `confidenceThreshold`, surface a finding hit
 * for that file.
 *
 * The signal direction is "the judge is unsure the file adheres" — NOT
 * "the judge thinks the file violates." This sidesteps a class of model-
 * miscalibration failures where a confident-but-wrong "passes" gets read
 * as a clean check. Low confidence = surface for operator triage.
 */

import { wrap, type DispatchFn } from '../../dispatch-wrapper.js';
import type { PatternFinding, PatternHit } from '../types.js';
import type { SourceFileView } from '../shared.js';
import type {
  PatternHandler,
  PatternHandlerInput,
  SemanticEntry,
} from './types.js';
import { matchesGlob } from './glob.js';
import { loadLlmConfig } from '../../llm/config.js';
import type { LlmConfig } from '../../llm/types.js';
import { errorMessage } from '../../util/typeguards.js';

let warnedOnceForStub = false;

function warnOnce(): void {
  if (warnedOnceForStub) return;
  warnedOnceForStub = true;
  process.stderr.write(
    'pattern-handlers/semantic: STUB path — no judge dispatcher in scope. ' +
      'Wire `enrichSemanticFinding()` with a judge `DispatchFn` to engage ' +
      'the LLM-judge path (the LLM judge + external auditor).\n',
  );
}

export const semanticHandler: PatternHandler<SemanticEntry> = {
  type: 'semantic',
  apply(input: PatternHandlerInput<SemanticEntry>): PatternFinding {
    warnOnce();
    let globMatchedFiles = 0;
    for (const scan of input.scans) {
      if (input.entry.extensions !== undefined) {
        const lower = scan.file.toLowerCase();
        if (!input.entry.extensions.some((e) => lower.endsWith(e))) continue;
      }
      if (matchesGlob(scan.file, input.entry.matchGlob)) globMatchedFiles += 1;
    }
    return {
      id: input.entry.id,
      description: input.entry.description,
      regex: `semantic:${input.entry.promptTemplate.slice(0, 40)}`,
      hits: [],
      provenance: 'semantic',
      metrics: {
        glob_matched_files: globMatchedFiles,
        confidence_threshold: input.entry.confidenceThreshold,
        stub: 1,
      },
    };
  },
};

/**
 * Parse the judge's response for the confidence value. The wired
 * dispatch expects the judge's prompt to elicit a structured block of
 * the form:
 *
 *     ADHERENCE: <0.0-1.0>
 *     REASONING: <one-line explanation>
 *
 * Returns the confidence or throws when the block is missing /
 * malformed. We do NOT clamp out-of-range values — the the orchestrator loop
 * controller wants the raw signal (see judge.ts for the same rule).
 */
function parseAdherenceConfidence(narrative: string, filePath: string): number {
  const lines = narrative.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*ADHERENCE:\s*([0-9.]+)\s*$/i.exec(line);
    if (m === null) continue;
    const tok = m[1] ?? '';
    const n = Number(tok);
    if (!Number.isFinite(n)) {
      throw new Error(
        `semantic-judge: ${filePath} — ADHERENCE value "${tok}" is not finite`,
      );
    }
    if (n < 0 || n > 1) {
      throw new Error(
        `semantic-judge: ${filePath} — ADHERENCE ${n} is outside [0.0, 1.0]`,
      );
    }
    return n;
  }
  throw new Error(
    `semantic-judge: ${filePath} — response missing required ADHERENCE: <n> block`,
  );
}

export interface EnrichSemanticFindingOptions {
  /** Judge dispatch callback (orchestrator-supplied). */
  readonly dispatchFn: DispatchFn;
  /** Repo root to resolve config overrides against. */
  readonly repoRoot: string;
  /** Optional explicit config (test entry point; skips disk load). */
  readonly configOverride?: LlmConfig;
}

/**
 * Wired LLM-judge path. Takes the entry + scans + a dispatcher and
 * returns a finding with real hits (sub-confidence files surfaced).
 *
 * Drop-in async sibling of `semanticHandler.apply` — same input shape,
 * same output shape minus `metrics.stub`.
 */
export async function enrichSemanticFinding(
  entry: SemanticEntry,
  scans: ReadonlyArray<SourceFileView>,
  options: EnrichSemanticFindingOptions,
): Promise<PatternFinding> {
  const config =
    options.configOverride ?? (await loadLlmConfig(options.repoRoot));
  const model = entry.model ?? config.judge.model;
  const hits: PatternHit[] = [];
  let globMatchedFiles = 0;
  const confidences: number[] = [];

  for (const scan of scans) {
    if (entry.extensions !== undefined) {
      const lower = scan.file.toLowerCase();
      if (!entry.extensions.some((e) => lower.endsWith(e))) continue;
    }
    if (!matchesGlob(scan.file, entry.matchGlob)) continue;
    globMatchedFiles += 1;

    const filePrompt =
      `${entry.promptTemplate}\n\n` +
      `--- FILE: ${scan.file} ---\n` +
      `${scan.text}\n` +
      `--- END FILE ---\n\n` +
      `Respond with a block of the form:\n\n` +
      `    ADHERENCE: <0.0-1.0>\n` +
      `    REASONING: <one-line explanation>\n\n` +
      `Then end with the standard Searched/Included/Excluded grammar block ` +
      `the dw-lifecycle dispatch wrapper enforces.`;

    let narrative: string;
    try {
      const parsed = await wrap(config.judge.agentType, filePrompt, {
        dispatchFn: options.dispatchFn,
        repoRoot: options.repoRoot,
      });
      narrative = parsed.rawText;
    } catch (err) {
      throw new Error(
        `enrichSemanticFinding: judge dispatch failed for ${scan.file}: ${errorMessage(err)}`,
      );
    }
    const confidence = parseAdherenceConfidence(narrative, scan.file);
    confidences.push(confidence);
    if (confidence < entry.confidenceThreshold) {
      hits.push({
        file: scan.file,
        line: 0,
        snippet: `judge adherence confidence ${confidence.toFixed(2)} below threshold ${entry.confidenceThreshold.toFixed(2)}`,
      });
    }
  }

  const meanConfidence =
    confidences.length === 0
      ? 0
      : confidences.reduce((a, b) => a + b, 0) / confidences.length;

  return {
    id: entry.id,
    description: entry.description,
    regex: `semantic:${entry.promptTemplate.slice(0, 40)}`,
    hits,
    provenance: 'semantic',
    metrics: {
      glob_matched_files: globMatchedFiles,
      confidence_threshold: entry.confidenceThreshold,
      mean_judge_confidence: meanConfidence,
      // Mark as judge-active so the synthesis layer can tell wired
      // findings apart from stub findings (which set `stub: 1`).
      judge_active: 1,
      // Surface the model identifier's character length as a synthetic
      // numeric metric so the wire-format `Record<string, number>`
      // stays satisfied. The actual model identifier is surfaced by
      // the orchestrator's per-turn report rather than the metrics
      // block.
      model_token_len: model.length,
    },
  };
}
