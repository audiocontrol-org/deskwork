/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/pattern-handlers/semantic.ts
 *
 * Semantic (LLM-augmented) pattern handler — the discovered_candidates stub.
 *
 * The `semanticHandler` (the PatternHandler<SemanticEntry> exported
 * below) is SYNCHRONOUS — it preserves the polymorphic dispatcher's
 * sync contract. The sync path is the file-enumeration stub: it
 * counts glob-matched files + returns zero hits + sets `metrics.stub`.
 * Adopters who haven't wired a judge dispatcher (the default case) see
 * this stub output and a one-line stderr advisory.
 *
 * # 010 decoupling (severed LLM-judge wiring)
 *
 * The dw-lifecycle version of this file also exported an async
 * `enrichSemanticFinding()` — the WIRED LLM-judge path that dispatched
 * each glob-matched file to a model judge and surfaced low-confidence
 * files as hits. That path imported `llm/config.js` + `llm/types.js`
 * (the audit-orchestration loop's LLM config), a feature that is NOT
 * being migrated into stack-control. Per the 010 decoupling, the wired
 * path and its `llm/` imports are SEVERED here; the synchronous stub
 * handler (the one the polymorphic dispatcher actually registers and
 * calls) is preserved unchanged. A `type: semantic` override pattern
 * therefore runs the deterministic file-enumeration stub. When the
 * LLM-judge feature lands natively in stack-control, the wired path can
 * be re-introduced against the native config surface.
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
  process.stderr.write(
    'pattern-handlers/semantic: STUB path — the LLM-judge wiring is not ' +
      'part of stack-control yet. A `type: semantic` pattern runs the ' +
      'deterministic glob-enumeration stub (zero hits).\n',
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
