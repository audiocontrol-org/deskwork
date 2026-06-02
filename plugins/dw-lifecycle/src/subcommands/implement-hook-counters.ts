/**
 * plugins/dw-lifecycle/src/subcommands/implement-hook-counters.ts
 *
 * Pure-fn counter parsers for `implement-hook`. Extracted from the
 * inline regexes in `runImplementHook` so they're unit-testable AND
 * so the parser-contract is explicit + drift-resistant.
 *
 * Per GH #384 + AUDIT-20260601-18: pre-fix `parsePromoteCount`
 * looked for `/promoted:\s*(\d+)/` in STDERR, but promote-findings
 * writes `Auto-applied: N finding(s)` to STDOUT. Counters all
 * reported 0 even when 4 findings were lifted + dispositioned. The
 * fix here pins the correct regex AND the correct stream for each
 * parser.
 */

/**
 * Parses the canonical findings count from `audit-barrage-lift`'s
 * stderr (e.g. "audit-barrage-lift: extracted 4 finding(s) from..."
 * or the zero-case "extracted 0 findings from..."). Returns 0 when
 * no match.
 */
export function parseLiftFindingsCount(stderr: string): number {
  // Matches both "extracted N finding(s)" and "extracted N findings".
  const m = /extracted\s+(\d+)\s+finding/.exec(stderr);
  if (m === null) return 0;
  return Number.parseInt(m[1]!, 10);
}

/**
 * Parses slush-remaining's stderr "flipped: N, skipped: M [HIGH|HIGHs]".
 * Returns null when no match (slush didn't run, or the format
 * changed). Caller maps null → 0 counters.
 */
export function parseSlushCounts(
  stderr: string,
): { readonly flipped: number; readonly skippedHighs: number } | null {
  const m = /flipped:\s*(\d+),\s*skipped:\s*(\d+)/.exec(stderr);
  if (m === null) return null;
  return {
    flipped: Number.parseInt(m[1]!, 10),
    skippedHighs: Number.parseInt(m[2]!, 10),
  };
}

/**
 * Parses promote-findings --auto's STDOUT "Auto-applied: N finding(s)".
 * Note STDOUT, not stderr (this was the pre-fix bug: implement-hook
 * read stderr looking for "promoted: N" which doesn't exist).
 * Returns 0 when no match (the "no new findings to scope" case prints
 * a different stdout line that doesn't have "Auto-applied:").
 */
export function parsePromoteCount(stdout: string): number {
  const m = /Auto-applied:\s+(\d+)\s+finding/.exec(stdout);
  if (m === null) return 0;
  return Number.parseInt(m[1]!, 10);
}
