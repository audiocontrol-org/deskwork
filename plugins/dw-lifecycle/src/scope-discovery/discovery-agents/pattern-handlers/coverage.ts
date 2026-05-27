/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-handlers/coverage.ts
 *
 * Coverage-metric pattern handler — Phase 11 G3.
 *
 * Emits a synthesis-layer metric describing what fraction of files in
 * `matchGlob` contain at least one match for `mustContain`. Unlike
 * regex / negative-space, coverage entries are NOT primarily violation
 * generators — they're CODEBASE-STATE METRICS feeding the Phase 11
 * Task 4 controller. The handler still produces a PatternFinding (for
 * uniform routing through the dispatcher), but its `hits` list is
 * empty by default; the load-bearing payload is in `metrics`.
 *
 * Numerator = files in glob with at least one `mustContain` match.
 * Denominator = files in glob (total).
 * Ratio = numerator / denominator, surfaced as a 0.0–1.0 number.
 *
 * Special case: denominator === 0 emits ratio 0 (no files match the
 * glob → adoption is meaningless; the operator sees the zero and knows
 * the glob is wrong / the codebase has no matching shape).
 *
 * Synthesis-layer consumers (Phase 11 Task 4) read `metrics.ratio`
 * directly. The pattern-matrix agent's output retains compatibility
 * with the legacy AstGrepMatrixFindings shape — coverage entries
 * appear in `patterns[]` alongside regex entries.
 */

import type { PatternFinding } from '../types.js';
import type {
  CoverageEntry,
  PatternHandler,
  PatternHandlerInput,
} from './types.js';
import { matchesGlob } from './glob.js';

export const coverageHandler: PatternHandler<CoverageEntry> = {
  type: 'coverage',
  apply(input: PatternHandlerInput<CoverageEntry>): PatternFinding {
    let denominator = 0;
    let numerator = 0;
    for (const scan of input.scans) {
      if (input.entry.extensions !== undefined) {
        const lower = scan.file.toLowerCase();
        if (!input.entry.extensions.some((e) => lower.endsWith(e))) continue;
      }
      if (!matchesGlob(scan.file, input.entry.matchGlob)) continue;
      denominator += 1;
      const re = new RegExp(
        input.entry.mustContain.source,
        input.entry.mustContain.flags.includes('g')
          ? input.entry.mustContain.flags
          : `${input.entry.mustContain.flags}g`,
      );
      if (re.test(scan.text)) numerator += 1;
    }
    const ratio = denominator === 0 ? 0 : numerator / denominator;
    return {
      id: input.entry.id,
      description: input.entry.description,
      regex: input.entry.mustContain.source,
      hits: [], // coverage emits metrics, not file-level violations
      provenance: 'coverage-gap',
      metrics: {
        denominator,
        numerator,
        ratio,
      },
    };
  },
};
