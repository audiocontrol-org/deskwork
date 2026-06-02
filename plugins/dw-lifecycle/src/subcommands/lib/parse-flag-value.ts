// Shared CLI-flag value parsers for dw-lifecycle subcommands.
//
// Extracted from debt-report + triage-issues + worktree-report which
// previously each maintained their own identical copy. Per the
// scope-discovery clone gate.

export function parsePositiveInt(flag: string, raw: string | undefined): number {
  if (raw === undefined) {
    throw new Error(`${flag} requires a numeric value.`);
  }
  // Reject mixed-digit input like '30abc' that Number.parseInt would
  // silently truncate to 30. The whole token must be digits.
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer (got '${raw}').`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer (got '${raw}').`);
  }
  return n;
}
