/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/pattern-handlers/negative-space.ts
 *
 * Negative-space pattern handler — the discovered_candidates stub.
 *
 * Fires when a file matching `matchGlob` does NOT contain at least one
 * match for `mustContain`. This is the "expected adopter that didn't
 * adopt" detector — the inverse of positive-match regex.
 *
 * Canonical motivating case (audiocontrol issue #315 / KeygroupSummary):
 *
 *   - matchGlob: `modules/*-editor/src/**\/*Summary.tsx`
 *     (the expected-adopter set: editor module summary components)
 *   - mustContain: `\.ac-[a-z]+`
 *     (the canonical design-system class prefix)
 *   - secondaryContains (optional strengthening signal):
 *     `(?<!\\.ac-)\\b(?:flex|grid|inline|absolute|relative|fixed|...)\\b`
 *     (utility-class consumption as the smell of "fell back to inline
 *     classes instead of the design system")
 *   - threshold: 1 (any file with zero canonical + >= 1 secondary fires)
 *
 * Output shape: one PatternFinding with one hit per offending file.
 * Provenance: `'negative-space'`. The hit's `line` is reported as 0
 * (file-level finding); the snippet describes what was missing.
 *
 * Why the threshold + secondary: a file that simply doesn't touch the
 * canonical primitive isn't necessarily a holdout — maybe it's a pure
 * data file. The presence of utility classes / fallback shapes
 * elevates it from "doesn't apply" to "actively avoided the canon".
 * When `secondaryContains` is unset, the handler defaults to firing on
 * every glob-matched file with zero canonical hits (threshold ignored).
 */

import type { PatternFinding, PatternHit } from '../types.js';
import type { SourceFileView } from '../shared.js';
import type {
  NegativeSpaceEntry,
  PatternHandler,
  PatternHandlerInput,
} from './types.js';
import { matchesGlob } from './glob.js';

function countMatches(text: string, regex: RegExp): number {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let count = 0;
  // exec loop with global flag is the canonical reentrant-count approach.
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    count += 1;
    // Guard infinite loop on zero-width matches.
    if (m.index === re.lastIndex) re.lastIndex += 1;
    m = re.exec(text);
  }
  return count;
}

function evaluateFile(args: {
  readonly entry: NegativeSpaceEntry;
  readonly scan: SourceFileView;
}): PatternHit | null {
  const canonicalCount = countMatches(args.scan.text, args.entry.mustContain);
  if (canonicalCount > 0) return null; // file consumes the canon — not a holdout
  // No canonical consumption. Decide whether to fire based on secondary signal.
  if (args.entry.secondaryContains !== undefined) {
    const secondaryCount = countMatches(args.scan.text, args.entry.secondaryContains);
    if (secondaryCount < args.entry.threshold) return null;
    return {
      file: args.scan.file,
      line: 0,
      snippet: `zero canonical hits; ${secondaryCount} secondary-signal hits (threshold ${args.entry.threshold})`,
    };
  }
  // No secondary signal configured — any zero-canonical file in scope fires.
  return {
    file: args.scan.file,
    line: 0,
    snippet: `zero canonical hits in file matching glob`,
  };
}

export const negativeSpaceHandler: PatternHandler<NegativeSpaceEntry> = {
  type: 'negative-space',
  apply(input: PatternHandlerInput<NegativeSpaceEntry>): PatternFinding {
    const hits: PatternHit[] = [];
    for (const scan of input.scans) {
      // Extension filter is a coarse pre-cut; glob is the precise gate.
      if (input.entry.extensions !== undefined) {
        const lower = scan.file.toLowerCase();
        if (!input.entry.extensions.some((e) => lower.endsWith(e))) continue;
      }
      if (!matchesGlob(scan.file, input.entry.matchGlob)) continue;
      const hit = evaluateFile({ entry: input.entry, scan });
      if (hit !== null) hits.push(hit);
    }
    return {
      id: input.entry.id,
      description: input.entry.description,
      // For non-regex handlers, `regex` carries the must_contain source
      // for traceability (downstream consumers grep this field to
      // understand what the catalog asked for).
      regex: input.entry.mustContain.source,
      hits,
      provenance: 'negative-space',
      metrics: {
        glob_matched_files: input.scans.filter((s) =>
          matchesGlob(s.file, input.entry.matchGlob),
        ).length,
        holdouts: hits.length,
      },
    };
  },
};
