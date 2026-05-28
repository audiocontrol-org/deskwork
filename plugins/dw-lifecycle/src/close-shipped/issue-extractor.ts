// Shared issue-number extractor used by the audit-log walker and the
// tooling-feedback walker. Both walkers scan a markdown entry body for
// the first issue reference in priority order; the only difference is
// which patterns each walker provides. Centralized here so the two
// walkers don't carry parallel scan loops.

export function extractIssueFromBody(
  bodyText: string,
  patterns: readonly RegExp[],
): number | null {
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(bodyText)) !== null) {
      const n = m.groups?.['n'];
      if (n === undefined) continue;
      const issue = Number.parseInt(n, 10);
      if (Number.isFinite(issue) && issue > 0) return issue;
    }
  }
  return null;
}
