/**
 * plugins/stack-control/src/scope-discovery/discovery-agents/pattern-handlers/regex.ts
 *
 * Regex pattern handler — the legacy pre-Phase-11 behavior, extracted
 * verbatim from `pattern-matrix.ts`'s `applyPattern` function and
 * adapted to the polymorphic handler interface.
 *
 * Backward-compatible: catalog entries WITHOUT a `type` field default
 * to `'regex'` at the loader, so this handler runs against legacy
 * registries unchanged.
 *
 * The line-grep engine choice and snippet-trimming behavior match the
 * pilot's contract — the synthesis layer + operator curation prune
 * false positives.
 */

import type { PatternFinding, PatternHit } from '../types.js';
import type { SourceFileView } from '../shared.js';
import type {
  PatternHandler,
  PatternHandlerInput,
  RegexEntry,
} from './types.js';

const SNIPPET_MAX_LEN = 200;

function snippet(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= SNIPPET_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, SNIPPET_MAX_LEN - 3)}...`;
}

function fileMatchesExtension(
  filePath: string,
  exts: ReadonlyArray<string> | undefined,
): boolean {
  if (exts === undefined) return true;
  const lower = filePath.toLowerCase();
  return exts.some((e) => lower.endsWith(e));
}

function scanFileForPattern(args: {
  readonly entry: RegexEntry;
  readonly scan: SourceFileView;
}): ReadonlyArray<PatternHit> {
  const hits: PatternHit[] = [];
  const regexSrc = args.entry.regex.source;
  const regexFlags = args.entry.regex.flags;
  for (let i = 0; i < args.scan.lines.length; i += 1) {
    const line = args.scan.lines[i];
    if (line === undefined) continue;
    // Use a fresh regex per line to reset lastIndex when the pattern is
    // stateful (`g` flag). The catalog regex is always compiled with `g`
    // (the agent's contract), so this defensive reset is required.
    const re = new RegExp(regexSrc, regexFlags);
    if (re.test(line)) {
      hits.push({
        file: args.scan.file,
        line: i + 1,
        snippet: snippet(line),
      });
    }
  }
  return hits;
}

export const regexHandler: PatternHandler<RegexEntry> = {
  type: 'regex',
  apply(input: PatternHandlerInput<RegexEntry>): PatternFinding {
    const hits: PatternHit[] = [];
    for (const scan of input.scans) {
      if (!fileMatchesExtension(scan.file, input.entry.extensions)) continue;
      const fileHits = scanFileForPattern({ entry: input.entry, scan });
      for (const h of fileHits) hits.push(h);
    }
    return {
      id: input.entry.id,
      description: input.entry.description,
      regex: input.entry.regex.source,
      hits,
      provenance: 'registered-pattern',
    };
  },
};
