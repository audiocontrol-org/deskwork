/**
 * plugins/stack-control/src/scope-discovery/promote-findings/check-barrage-dampener.ts
 *
 * Phase 15 Task 7 — audit-barrage dampener.
 *
 * Pure-fn: scans the audit-log for `## ... — audit-barrage lift (...)`
 * section headers, counts `Severity: high` and `Severity: blocking`
 * entries inside each section, and reports whether the last N
 * consecutive sections all had 0 HIGH+ findings. When the threshold
 * is met, the /dwi end-of-task hook should be skipped — the auditor
 * has gone quiet on real bugs, and per the Phase 15 dogfood's 7-round
 * convergence pattern, continuing to fire the hook produces only
 * nit-level critiques of audit-process meta-rules.
 *
 * Operator decision (Phase 15 closeout, 2026-05-31): default
 * threshold is 2 consecutive quiet runs. The threshold is
 * tunable via the CLI flag.
 */

const BARRAGE_HEADER_RE = /^##\s+\d{4}-\d{2}-\d{2}\s+—\s+audit-barrage\s+lift\s+\(([^)]+)\)/i;
const SEVERITY_LINE_RE = /^Severity:\s*(blocking|high|medium|low|informational)\b/i;
const STATUS_LINE_RE = /^Status:\s*(\S+)/i;
const ENTRY_HEADER_RE = /^###\s+/;

export interface BarrageSectionCount {
  readonly runDirBasename: string;
  /** Open findings with severity ∈ {high, blocking}. */
  readonly highPlusCount: number;
  /** Open findings with severity === medium. */
  readonly mediumCount: number;
  readonly totalFindings: number;
}

export interface BarrageDampenerCheckArgs {
  readonly auditLogText: string;
  /** Default 2. Number of consecutive most-recent runs that must all have 0 HIGH+. */
  readonly threshold?: number;
}

export interface BarrageDampenerCheckResult {
  /** True when the last `threshold` runs all have 0 HIGH+ findings → skip the hook. */
  readonly dampened: boolean;
  readonly threshold: number;
  /**
   * The last `threshold` barrage sections, most-recent first. Empty
   * when no barrage sections exist. Shorter than `threshold` when
   * fewer-than-threshold sections exist (which is the not-yet-
   * dampened state).
   */
  readonly recentRunCounts: ReadonlyArray<BarrageSectionCount>;
  /** Human-readable explanation suitable for stderr / per-task report. */
  readonly reason: string;
}

interface RawSection {
  readonly headerIndex: number;
  readonly runDirBasename: string;
  readonly endIndex: number;
}

function findBarrageSections(lines: ReadonlyArray<string>): RawSection[] {
  const out: { headerIndex: number; runDirBasename: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const m = BARRAGE_HEADER_RE.exec(line);
    if (m !== null) {
      out.push({ headerIndex: i, runDirBasename: m[1]! });
    }
  }
  // Each section ends at the line BEFORE the next `## ` header (any
  // top-level section, not just barrage) or EOF.
  const TOP_HEADER_RE = /^##\s+/;
  return out.map((s, idx) => {
    let endIndex = lines.length;
    for (let j = s.headerIndex + 1; j < lines.length; j += 1) {
      if (TOP_HEADER_RE.test(lines[j] ?? '')) {
        endIndex = j;
        break;
      }
    }
    // Sanity: if next barrage section starts before our computed
    // endIndex, that's also our boundary.
    const nextBarrageIdx = idx + 1 < out.length ? out[idx + 1]!.headerIndex : lines.length;
    if (nextBarrageIdx < endIndex) endIndex = nextBarrageIdx;
    return { ...s, endIndex };
  });
}

function countHighPlusInSection(
  lines: ReadonlyArray<string>,
  section: RawSection,
): BarrageSectionCount {
  // Walk entry-by-entry. Each entry has ONE `Severity:` + ONE
  // `Status:` line. An entry counts only when its status is `open`
  // (slush-pile semantic: dispositioned findings don't count).
  // HIGH+ = high/blocking; MEDIUM tracked separately for the
  // stiffer single-run engagement rule (operator directive
  // 2026-05-31).
  let highPlusOpen = 0;
  let mediumOpen = 0;
  let total = 0;
  let i = section.headerIndex + 1;
  while (i < section.endIndex) {
    const line = lines[i] ?? '';
    if (!ENTRY_HEADER_RE.test(line)) {
      i += 1;
      continue;
    }
    let severity: string | undefined;
    let status: string | undefined;
    let j = i + 1;
    while (j < section.endIndex) {
      const inner = lines[j] ?? '';
      if (ENTRY_HEADER_RE.test(inner)) break;
      const sev = SEVERITY_LINE_RE.exec(inner);
      if (sev !== null && severity === undefined) severity = sev[1]!.toLowerCase();
      const st = STATUS_LINE_RE.exec(inner);
      if (st !== null && status === undefined) status = st[1]!.toLowerCase();
      j += 1;
    }
    if (severity !== undefined) {
      total += 1;
      const isOpen = status === 'open' || status === undefined;
      if (isOpen) {
        if (severity === 'high' || severity === 'blocking') highPlusOpen += 1;
        else if (severity === 'medium') mediumOpen += 1;
      }
    }
    i = j;
  }
  return {
    runDirBasename: section.runDirBasename,
    highPlusCount: highPlusOpen,
    mediumCount: mediumOpen,
    totalFindings: total,
  };
}

export function checkBarrageDampener(
  args: BarrageDampenerCheckArgs,
): BarrageDampenerCheckResult {
  const threshold = args.threshold ?? 2;
  const lines = args.auditLogText.split(/\r?\n/);
  const sections = findBarrageSections(lines);
  // Most-recent-first. Sections are append-only in the audit-log
  // (newest at the bottom), so reversing the file-order gives
  // chronological-desc.
  const orderedRecent = [...sections].reverse();
  const recentRunCounts = orderedRecent
    .slice(0, threshold)
    .map((s) => countHighPlusInSection(lines, s));

  // Rule 1 — N-consecutive-quiet (original): last `threshold` runs
  // all have 0 HIGH+ open. Looser threshold; engages after a streak.
  const consecutiveQuietEngages =
    recentRunCounts.length >= threshold &&
    recentRunCounts.every((r) => r.highPlusCount === 0);

  // Rule 2 — single-run-no-medium-or-high (operator directive
  // 2026-05-31): the MOST RECENT run has 0 HIGH+ AND 0 MEDIUM open
  // findings. Stiffer — a single clean run engages without waiting
  // for the N-streak.
  const mostRecent = recentRunCounts[0];
  const singleRunCleanEngages =
    mostRecent !== undefined &&
    mostRecent.highPlusCount === 0 &&
    mostRecent.mediumCount === 0;

  const dampened = consecutiveQuietEngages || singleRunCleanEngages;

  const reason = (() => {
    if (sections.length === 0) {
      return 'No audit-barrage lift sections found in audit-log; the dampener has no signal yet.';
    }
    if (dampened) {
      const parts: string[] = [];
      if (consecutiveQuietEngages) {
        parts.push(
          `the last ${threshold} consecutive audit-barrage runs each surfaced 0 HIGH+ findings`,
        );
      }
      if (singleRunCleanEngages) {
        parts.push(
          `the most recent run (${mostRecent!.runDirBasename}) surfaced 0 HIGH+ AND 0 MEDIUM findings (single-run rule)`,
        );
      }
      return (
        `Dampened: ${parts.join(' AND ')}. The /dwi end-of-task ` +
        `hook should skip — the auditor has gone quiet on real bugs.`
      );
    }
    const notQuiet = recentRunCounts.filter((r) => r.highPlusCount > 0);
    if (notQuiet.length > 0) {
      return (
        `Not dampened: ${notQuiet.length} of the last ${recentRunCounts.length} ` +
        `runs surfaced HIGH+ findings (most recent non-quiet run: ` +
        `${notQuiet[0]!.runDirBasename} → ${notQuiet[0]!.highPlusCount} HIGH+).`
      );
    }
    if (mostRecent !== undefined && mostRecent.mediumCount > 0) {
      return (
        `Not dampened: most recent run (${mostRecent.runDirBasename}) has ` +
        `0 HIGH+ but ${mostRecent.mediumCount} MEDIUM findings — single-run ` +
        `rule needs 0 MEDIUM too. N-quiet rule needs ${threshold} consecutive 0-HIGH+ runs.`
      );
    }
    return (
      `Not dampened yet: only ${recentRunCounts.length} consecutive ` +
      `quiet runs (threshold = ${threshold}) and no single-run-clean trigger.`
    );
  })();
  return { dampened, threshold, recentRunCounts, reason };
}
