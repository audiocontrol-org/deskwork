/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/judge.ts
 *
 * Internal LLM-judge library (the LLM judge + external auditor).
 *
 * Runs in-band as part of `/dw-lifecycle:implement`'s per-turn loop.
 * Reads recent work + catalog state + open candidates; emits ranked
 * disposition proposals with per-proposal confidence + reasoning.
 *
 * # Architecture
 *
 * The actual LLM network call is OUT OF SCOPE for this library (per
 * the the LLM judge + external auditor pre-made-decision #1 — the library defines the
 * SHAPE of the call, not the network mechanic). The orchestrator
 * supplies a `dispatchFn` callback that performs the dispatch; the
 * judge wraps it with the Phase-5 `wrap()` function so:
 *
 *   - The required `Searched/Included/Excluded` return grammar is
 *     enforced (rejected returns surface as `DispatchRejected`).
 *   - Forbidden-deferral phrases ("we'll figure this out later",
 *     "TODO", "for now") fail the dispatch loudly.
 *   - The refactor-marker auto-prelude attaches when the judge is
 *     reasoning about a refactor-shape change.
 *
 * # Output parsing
 *
 * The judge's response carries `PROPOSAL: <id>` blocks in the body
 * (BEFORE the dispatch-grammar block). This module parses those
 * blocks into typed `JudgeDispositionProposal` records and ranks them
 * by descending confidence.
 *
 * Out-of-range confidence (< 0 or > 1) throws — clamping would mask
 * model misbehavior the controller (Task 5) needs to see.
 */

import { wrap, type DispatchFn } from '../dispatch-wrapper.js';
import type { CatalogStatus } from '../util/catalog-status.js';
import { loadLlmConfig } from './config.js';
import { renderJudgePrompt } from './prompt-render.js';
import type {
  JudgeDispositionProposal,
  JudgeInput,
  JudgeResult,
  LlmConfig,
} from './types.js';

const ALLOWED_STATUSES: ReadonlyArray<CatalogStatus> = [
  'pending',
  'blessed',
  'cursed',
  'ignore',
  'tracked-holdout',
  'withdrawn',
];

export class JudgeParseError extends Error {
  override readonly name = 'JudgeParseError';
}

/**
 * Parse a numeric token from a line like `  confidence: 0.75`. Returns
 * the number if parseable + in range; throws a `JudgeParseError`
 * otherwise.
 */
function parseConfidence(raw: string, candidateId: string): number {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new JudgeParseError(
      `judge proposal for \`${candidateId}\`: confidence "${trimmed}" is not a finite number`,
    );
  }
  if (n < 0 || n > 1) {
    throw new JudgeParseError(
      `judge proposal for \`${candidateId}\`: confidence ${n} is outside [0.0, 1.0]; ` +
        `clamping would mask model miscalibration — the operator's controller wants the raw signal`,
    );
  }
  return n;
}

function parseStatus(raw: string, candidateId: string): CatalogStatus {
  const trimmed = raw.trim();
  const matched = ALLOWED_STATUSES.find((s) => s === trimmed);
  if (matched === undefined) {
    throw new JudgeParseError(
      `judge proposal for \`${candidateId}\`: status "${trimmed}" is not one of ${ALLOWED_STATUSES.join(', ')}`,
    );
  }
  return matched;
}

/**
 * Parse `PROPOSAL: <id>` blocks from the judge's narrative. The block
 * format (defined in templates/scope-discovery/judge-prompt.md):
 *
 *   PROPOSAL: <candidate-id>
 *     status: <CatalogStatus>
 *     confidence: <0.0-1.0>
 *     reasoning: <one paragraph>
 *
 * Trailing blank line or next PROPOSAL marker terminates the block.
 *
 * Multi-line reasoning is supported — continuation lines are folded
 * into the reasoning string until the next PROPOSAL block, the
 * grammar block, or end of input.
 */
export function parseJudgeProposals(
  narrative: string,
): ReadonlyArray<JudgeDispositionProposal> {
  const lines = narrative.split(/\r?\n/);
  const out: JudgeDispositionProposal[] = [];
  let current: {
    candidateId: string;
    status: CatalogStatus | null;
    confidence: number | null;
    reasoningParts: string[];
  } | null = null;

  const finalize = (): void => {
    if (current === null) return;
    if (current.status === null) {
      throw new JudgeParseError(
        `judge proposal for \`${current.candidateId}\`: missing required \`status:\` field`,
      );
    }
    if (current.confidence === null) {
      throw new JudgeParseError(
        `judge proposal for \`${current.candidateId}\`: missing required \`confidence:\` field`,
      );
    }
    const reasoning = current.reasoningParts.join(' ').trim();
    if (reasoning.length === 0) {
      throw new JudgeParseError(
        `judge proposal for \`${current.candidateId}\`: missing required \`reasoning:\` field`,
      );
    }
    out.push({
      candidateId: current.candidateId,
      proposedStatus: current.status,
      confidence: current.confidence,
      reasoning,
    });
    current = null;
  };

  for (const line of lines) {
    const proposalMatch = /^PROPOSAL:\s*(.+?)\s*$/.exec(line);
    if (proposalMatch !== null) {
      finalize();
      const id = proposalMatch[1];
      if (id === undefined || id.length === 0) {
        throw new JudgeParseError('judge proposal: empty candidate-id after PROPOSAL:');
      }
      current = {
        candidateId: id,
        status: null,
        confidence: null,
        reasoningParts: [],
      };
      continue;
    }
    if (current === null) continue;
    // The dispatch wrapper's grammar block terminates the proposal area.
    if (/^Searched:/i.test(line.trim())) {
      finalize();
      break;
    }
    const statusMatch = /^\s*status:\s*(\S.*?)\s*$/i.exec(line);
    if (statusMatch !== null && current !== null) {
      const raw = statusMatch[1];
      if (raw !== undefined) current.status = parseStatus(raw, current.candidateId);
      continue;
    }
    const confidenceMatch = /^\s*confidence:\s*(\S.*?)\s*$/i.exec(line);
    if (confidenceMatch !== null && current !== null) {
      const raw = confidenceMatch[1];
      if (raw !== undefined) {
        current.confidence = parseConfidence(raw, current.candidateId);
      }
      continue;
    }
    const reasoningMatch = /^\s*reasoning:\s*(.*)$/i.exec(line);
    if (reasoningMatch !== null && current !== null) {
      const raw = reasoningMatch[1];
      if (raw !== undefined && raw.length > 0) current.reasoningParts.push(raw);
      continue;
    }
    // Continuation line for reasoning (indented, no recognized key).
    if (current !== null && line.trim().length > 0) {
      current.reasoningParts.push(line.trim());
    }
  }
  finalize();
  return out.slice().sort((a, b) => b.confidence - a.confidence);
}

export interface RunInternalJudgeOptions {
  /** Dispatch callback (orchestrator-supplied). */
  readonly dispatchFn: DispatchFn;
  /** Repo root to resolve project-level config overrides against. */
  readonly repoRoot: string;
  /** Optional explicit config (test entry point; skips disk load). */
  readonly configOverride?: LlmConfig;
}

/**
 * Run the internal LLM-judge for one orchestrator turn. Resolves the
 * judge prompt, dispatches it through `wrap()`, parses proposals, and
 * returns a ranked `JudgeResult`.
 *
 * Failures from `wrap()` (dispatch grammar violations, forbidden
 * deferral phrases) propagate as `DispatchRejected`. Failures parsing
 * the proposal blocks raise `JudgeParseError`. The orchestrator
 * surfaces both as escalation signals.
 */
export async function runInternalJudge(
  input: JudgeInput,
  options: RunInternalJudgeOptions,
): Promise<JudgeResult> {
  const config =
    options.configOverride ?? (await loadLlmConfig(options.repoRoot));
  const model = input.modelOverride ?? config.judge.model;
  const prompt = await renderJudgePrompt(input);
  const parsed = await wrap(config.judge.agentType, prompt, {
    dispatchFn: options.dispatchFn,
    repoRoot: options.repoRoot,
  });
  // `parsed.rawText` is the full sub-agent response; the proposals
  // live before the grammar block.
  const narrative = parsed.rawText;
  const proposals = parseJudgeProposals(narrative);
  return {
    model,
    proposals,
    narrative,
  };
}
