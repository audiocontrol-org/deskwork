/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/semantic.ts
 *
 * Semantic (LLM-augmented) pattern handler — Phase 11 G6 STUB.
 *
 * STATUS: stub-shipped in v1.1 Task 1. The TYPE + dispatcher routing
 * are complete; the LLM invocation itself is NOT wired. The handler
 * returns zero findings and emits a one-line stderr advisory naming
 * the deferral. The actual LLM-judge wiring lands under Phase 11
 * Task 7's LLM-judge work; tracked at #319 (filed alongside Phase 11
 * Task 1).
 *
 * Tracking issue: https://github.com/audiocontrol-org/deskwork/issues/319
 *
 * WHY a stub in this dispatch:
 *
 *   - The polymorphic dispatcher is the shipped surface area of Task 1.
 *   - The schema + type definition need to be in place so adopters can
 *     author semantic catalog entries without waiting for the
 *     LLM-judge cycle to land.
 *   - The wrap()-mediated dispatch wrapper from Phase 5 is the
 *     intended invocation site; wiring it in here would force
 *     premature decisions about model selection + per-file cost-
 *     ceilings that belong in the Task 7 LLM-judge surface.
 *
 * Cross-reference: TF-016 / AUDIT-20260525-09 (dispatch-hygiene)
 * applies if/when this handler engages wrap() — the integration-layer
 * audit concerns (callback-index drift, wire-format rounding) are the
 * relevant checklist.
 *
 * The stub honors the contract surface:
 *   - Files matching the glob are enumerated (so the metric
 *     `glob_matched_files` is meaningful).
 *   - No findings are emitted (zero hits).
 *   - `metrics.stub` is set to 1 so the synthesis layer can
 *     distinguish a stubbed-no-findings from a real-LLM-found-zero.
 *
 * Adopters who try to use semantic entries today will see them appear
 * in the manifest with `provenance: 'semantic'`, `hits: []`, and the
 * stub metric — a clear signal the wiring is pending without a silent
 * fallback (per CLAUDE.md "no fallbacks outside test code").
 */

import type { PatternFinding } from '../types.js';
import type {
  PatternHandler,
  PatternHandlerInput,
  SemanticEntry,
} from './types.js';
import { matchesGlob } from './glob.js';

let warnedOnceForStub = false;

function warnOnce(): void {
  if (warnedOnceForStub) return;
  warnedOnceForStub = true;
  // Stderr advisory so the operator running scope-inventory sees the
  // stub explicitly. Not a throw — the dispatcher continues so other
  // pattern types in the same catalog still run.
  process.stderr.write(
    'pattern-handlers/semantic: STUB (#319) — LLM invocation not yet ' +
      'wired. Catalog entries with type=semantic emit zero findings ' +
      'until the Phase 11 Task 7 LLM-judge integration lands. See ' +
      'https://github.com/audiocontrol-org/deskwork/issues/319 for ' +
      'status.\n',
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
    // TODO(#319 — LLM-judge wiring; aligns with Phase 11 Task 7):
    // replace the stub body with a wrap()-mediated dispatch that:
    //   1. Reads each glob-matched file's contents.
    //   2. Renders `promptTemplate` with the file content + relevant
    //      catalog metadata.
    //   3. Dispatches via the Phase 5 wrap() to an LLM agent type.
    //   4. Parses the agent's verdict (confidence score 0.0–1.0).
    //   5. Emits a finding when confidence < `confidenceThreshold`.
    // The actual wrap() engagement should also cite TF-016 / AUDIT-
    // 20260525-09 (dispatch-hygiene checklist) per the workplan.
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
