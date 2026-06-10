// Per-checkpoint audit-log scoping (AUDIT-20260607-05). Shared by the
// spec-governance gate and the slush verb so the convergence DECISION evaluates
// one checkpoint's independent loop. Runs are tagged by a `-<checkpoint>` suffix
// on the run-dir basename (govern-spec.sh tags the barrage's run-dir label).

export const BARRAGE_HEADER_RE =
  /^##\s+\d{4}-\d{2}-\d{2}\s+—\s+audit-barrage\s+lift\s+\(([^)]+)\)/i;

/**
 * Keep ONLY the audit-barrage lift sections whose run-dir basename ends with
 * `-<checkpoint>`. Returns an audit-log text containing just those sections, so
 * the dampener + iteration tally evaluate one checkpoint's loop. Non-matching +
 * non-barrage sections are dropped (the dampener only reads barrage sections).
 */
export function filterByCheckpoint(auditLogText: string, checkpoint: string): string {
  const lines = auditLogText.split(/\r?\n/);
  const SECTION_HEADER_RE = /^##\s+/;
  const out: string[] = [];
  let keep = false;
  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line)) {
      const m = BARRAGE_HEADER_RE.exec(line);
      const basename = m !== null ? m[1] ?? '' : '';
      keep = m !== null && basename.endsWith(`-${checkpoint}`);
    }
    if (keep) out.push(line);
  }
  return out.join('\n');
}

/** Count audit-barrage lift sections (iterations) in an audit-log text. */
export function countIterations(auditLogText: string): number {
  let n = 0;
  for (const line of auditLogText.split(/\r?\n/)) {
    if (BARRAGE_HEADER_RE.test(line)) n += 1;
  }
  return n;
}
