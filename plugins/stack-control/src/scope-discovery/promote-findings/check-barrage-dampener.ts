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

import { findingSignature } from './extract-barrage-findings.js';
import type { NormalizedSeverity } from './extract-barrage-findings.js';
import { SEVERITY_RANK } from './cluster-severity.js';

const BARRAGE_HEADER_RE = /^##\s+\d{4}-\d{2}-\d{2}\s+—\s+audit-barrage\s+lift\s+\(([^)]+)\)/i;
// specs/029 US2 (FR-007): a lift section over a degraded fleet (produced <
// configured) carries this marker. A degraded run is NEVER a quiet run — its
// surviving lanes' absence-of-HIGH is not a clean signal, so the dampener must
// exclude it from both the consecutive-quiet streak and the single-run-clean
// rule, regardless of the (possibly 0) HIGH+ count it surfaced. The marker may
// be wrapped in markdown emphasis (`_…_`); match it anywhere on a line.
const DEGRADED_MARKER_RE = /Fleet:\s*DEGRADED\b/i;
const SEVERITY_LINE_RE = /^Severity:\s*(blocking|high|medium|low|informational)\b/i;
const STATUS_LINE_RE = /^Status:\s*(\S+)/i;
const SURFACE_LINE_RE = /^Surface:\s*(.+?)\s*$/i;
const ENTRY_HEADER_RE = /^###\s+/;
// specs/029 US3 (FR-009): the heading text on an entry line is whatever follows
// the first ` — ` (space-emdash-space, U+2014). `### AUDIT-… — <heading>`. When
// no em-dash separator is present the whole post-`### ` remainder is the heading.
const ENTRY_HEADING_RE = /^###\s+(.+?)\s*$/;

/**
 * Narrow a lowercased severity token (already guaranteed canonical by
 * SEVERITY_LINE_RE) to `NormalizedSeverity` without an unchecked cast. A token
 * absent from the SEVERITY_RANK keyspace is a defect (the regex would not have
 * matched it) — fail loud (Constitution V) rather than silently mis-rank.
 */
function narrowSeverity(token: string): NormalizedSeverity {
  if (token === 'blocking') return 'blocking';
  if (token === 'high') return 'high';
  if (token === 'medium') return 'medium';
  if (token === 'low') return 'low';
  if (token === 'informational') return 'informational';
  throw new Error(
    `check-barrage-dampener: severity token "${token}" matched SEVERITY_LINE_RE but is not a canonical NormalizedSeverity — internal regex/keyspace drift.`,
  );
}

export interface BarrageSectionCount {
  readonly runDirBasename: string;
  /** Open findings with severity ∈ {high, blocking}. */
  readonly highPlusCount: number;
  /** Open findings with severity === medium. */
  readonly mediumCount: number;
  /**
   * RAW-surfaced findings with severity ∈ {high, blocking} — counted by
   * `Severity:` regardless of `Status:` (#432 / AUDIT-20260608-01). This is what
   * the run's barrage actually flagged; a HIGH later flipped to `fixed-<sha>`
   * still counts here. The dampener's two-branch convergence window is computed
   * on RAW counts so that a HIGH-bearing run does NOT count as a "0-HIGH run"
   * just because its finding was dispositioned between runs.
   */
  readonly rawHighPlusCount: number;
  /** RAW-surfaced findings with severity === medium (ignores `Status:`; #432). */
  readonly rawMediumCount: number;
  readonly totalFindings: number;
  /**
   * specs/029 US2 (FR-007): true when this section was recorded over a DEGRADED
   * fleet (produced < configured — at least one lane timed-out / killed /
   * zero-byte). A degraded section is never counted as a quiet run, regardless
   * of its HIGH+ count: absence of HIGH from the surviving lanes is not a clean
   * signal when other lanes produced nothing.
   */
  readonly degraded: boolean;
  /**
   * specs/029 US3 (FR-009/010/SC-001): EVERY finding in this section as a
   * `(signature, severity)` pair, at ANY severity — RAW. The dampener folds these
   * into a per-signature MAX-SEVERITY-RANK map so it can distinguish a finding
   * first surfaced at low/medium and later RE-RATED *up* to HIGH (severity jitter
   * — suppressed, FR-010) from a finding ALREADY seen at HIGH/blocking that stays
   * HIGH (a persistent real defect — keeps blocking, SC-001). Carrying the
   * severity (not just presence) is what lets the caller tell those two apart.
   */
  readonly allFindings: readonly {
    readonly signature: string;
    readonly severity: NormalizedSeverity;
  }[];
}

/**
 * specs/029 US3 (FR-009): a per-section count with the dampener's
 * identity-keyed view folded in. `newHighPlusCount` is the number of this
 * section's HIGH+ findings that are EITHER genuinely new (signature unseen in
 * every earlier section — FR-011) OR persistently HIGH (seen earlier but already
 * at HIGH/blocking — a real defect that stays HIGH, SC-001). A HIGH+ finding
 * whose signature was previously seen only at a LOWER severity is the re-rate-up
 * jitter case (FR-010) and is NOT counted. The consecutive-quiet streak keys on
 * this, not on the raw count.
 */
export interface BarrageWindowCount extends BarrageSectionCount {
  /** HIGH+ findings that are new (FR-011) or persistently HIGH (SC-001), not re-rate-up jitter (FR-010). */
  readonly newHighPlusCount: number;
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
   * dampened state). Each record carries the identity-keyed `newHighPlusCount`
   * (specs/029 US3, FR-009) in addition to the raw/open counts.
   */
  readonly recentRunCounts: ReadonlyArray<BarrageWindowCount>;
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
  let highPlusRaw = 0;
  let mediumRaw = 0;
  let total = 0;
  let degraded = false;
  const allFindings: { signature: string; severity: NormalizedSeverity }[] = [];
  // AUDIT-BARRAGE-claude-02: the `Fleet: DEGRADED` marker lives in the section
  // PREAMBLE (between the `## … lift (…)` header and the first `### AUDIT-…`
  // entry). Only scan there — a finding heading/body that merely names the
  // concept must not spuriously flag the run degraded.
  let sawEntry = false;
  let i = section.headerIndex + 1;
  while (i < section.endIndex) {
    const line = lines[i] ?? '';
    if (!ENTRY_HEADER_RE.test(line)) {
      if (!sawEntry && DEGRADED_MARKER_RE.test(line)) degraded = true;
      i += 1;
      continue;
    }
    sawEntry = true;
    // specs/029 US3 (FR-009): the heading is the text AFTER the first ` — `
    // (space-emdash-space) on the `### …` line; absent the separator the whole
    // remainder is the heading. Used to build the entry's finding-signature.
    const headingMatch = ENTRY_HEADING_RE.exec(line);
    const entryTitle = headingMatch !== null ? (headingMatch[1] ?? '').trim() : '';
    const emdashIdx = entryTitle.indexOf(' — ');
    const heading = emdashIdx >= 0 ? entryTitle.slice(emdashIdx + 3).trim() : entryTitle;
    let severity: NormalizedSeverity | undefined;
    let status: string | undefined;
    let surface = '';
    let j = i + 1;
    while (j < section.endIndex) {
      const inner = lines[j] ?? '';
      if (ENTRY_HEADER_RE.test(inner)) break;
      const sev = SEVERITY_LINE_RE.exec(inner);
      const sevToken = sev?.[1];
      if (sevToken !== undefined && severity === undefined) {
        // SEVERITY_LINE_RE only matches the five canonical tokens, so the
        // lowercased capture is always a `NormalizedSeverity`; narrow it via the
        // SEVERITY_RANK keyspace rather than an unchecked cast.
        const lowered = sevToken.toLowerCase();
        severity = narrowSeverity(lowered);
      }
      const st = STATUS_LINE_RE.exec(inner);
      const stToken = st?.[1];
      if (stToken !== undefined && status === undefined) status = stToken.toLowerCase();
      const surf = SURFACE_LINE_RE.exec(inner);
      const surfToken = surf?.[1];
      if (surfToken !== undefined && surface.length === 0) surface = surfToken;
      j += 1;
    }
    if (severity !== undefined) {
      total += 1;
      // FR-010/SC-001: record EVERY finding's (signature, severity) so the caller
      // can fold a per-signature MAX-SEVERITY-RANK map — distinguishing a re-rate
      // UP (seen lower, now HIGH → jitter, suppress) from a persistent HIGH (seen
      // at HIGH, stays HIGH → real defect, keeps blocking).
      const sig = findingSignature(heading, surface);
      allFindings.push({ signature: sig, severity });
      // RAW (#432): what this barrage SURFACED, regardless of later disposition.
      if (severity === 'high' || severity === 'blocking') {
        highPlusRaw += 1;
      } else if (severity === 'medium') mediumRaw += 1;
      // OPEN: still-undispositioned (used by the cross-run union, not the window).
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
    rawHighPlusCount: highPlusRaw,
    rawMediumCount: mediumRaw,
    totalFindings: total,
    degraded,
    allFindings,
  };
}

export function checkBarrageDampener(
  args: BarrageDampenerCheckArgs,
): BarrageDampenerCheckResult {
  const threshold = args.threshold ?? 2;
  const lines = args.auditLogText.split(/\r?\n/);
  const sections = findBarrageSections(lines);

  // specs/029 US3 (FR-009/010/011 + SC-001): count NEW-or-PERSISTENT HIGH+ per
  // section by identity-key. Walk ALL sections oldest→newest (file order),
  // accumulating a per-signature MAX-SEVERITY-RANK map. For each section, BEFORE
  // folding it in, a HIGH+ finding counts when EITHER:
  //   (a) its signature is absent from the map → genuinely new (FR-011), OR
  //   (b) its signature is present at rank >= HIGH → persistent real defect that
  //       was already HIGH/blocking and stays HIGH+ (SC-001: a same-HIGH-every-
  //       round blocker must NOT converge while it persists).
  // A HIGH+ finding whose signature is present only at rank < HIGH is the
  // re-rate-UP jitter case (FR-010, e.g. MEDIUM→HIGH on unchanged code) → NOT
  // counted. After counting, fold EVERY finding of the section into the map at
  // the max of its existing and current rank.
  const HIGH_RANK = SEVERITY_RANK.high;
  const fileOrderedCounts = sections.map((s) => countHighPlusInSection(lines, s));
  const seenMaxRank = new Map<string, number>();
  const newHighCounts: number[] = [];
  for (const count of fileOrderedCounts) {
    let newHigh = 0;
    for (const finding of count.allFindings) {
      if (SEVERITY_RANK[finding.severity] < HIGH_RANK) continue;
      const priorRank = seenMaxRank.get(finding.signature);
      if (priorRank === undefined || priorRank >= HIGH_RANK) newHigh += 1;
    }
    newHighCounts.push(newHigh);
    // Fold ALL of this section's findings (any severity) into the max-rank map.
    for (const finding of count.allFindings) {
      const rank = SEVERITY_RANK[finding.severity];
      const prior = seenMaxRank.get(finding.signature);
      if (prior === undefined || rank > prior) seenMaxRank.set(finding.signature, rank);
    }
  }

  // Most-recent-first. Sections are append-only in the audit-log
  // (newest at the bottom), so reversing the file-order gives
  // chronological-desc.
  const lastIndex = fileOrderedCounts.length - 1;
  const recentRunCounts: BarrageWindowCount[] = [];
  for (let k = 0; k < threshold && k <= lastIndex; k += 1) {
    const idx = lastIndex - k;
    const base = fileOrderedCounts[idx];
    if (base === undefined) continue;
    recentRunCounts.push({ ...base, newHighPlusCount: newHighCounts[idx] ?? 0 });
  }

  // Rule 1 — N-consecutive-quiet: the last `threshold` runs each surfaced 0
  // NEW-or-PERSISTENT HIGH+ (FR-009/010/011 + SC-001). Identity-keyed: a finding
  // re-rated UP to HIGH on unchanged code (seen earlier only at a lower severity)
  // is severity jitter, not new signal — it must NOT reset the streak (the
  // TASK-146 bug, FR-010). A genuinely-new HIGH (FR-011) AND a persistent HIGH
  // (seen at HIGH, stays HIGH — SC-001) both still block. RAW basis (#432): the
  // underlying HIGH count ignores `Status:`, so a disposition between runs doesn't
  // fabricate a quiet run.
  // specs/029 US2 (FR-007): a degraded run is NEVER quiet — exclude it from the
  // streak even when it surfaced 0 (new) HIGH+.
  const consecutiveQuietEngages =
    recentRunCounts.length >= threshold &&
    recentRunCounts.every((r) => r.newHighPlusCount === 0 && !r.degraded);

  // Rule 2 — single-run-clean (operator directive 2026-05-31): the MOST RECENT
  // run surfaced 0 NEW-or-PERSISTENT HIGH+ (FR-009/010/011 + SC-001 — only a
  // re-rate-UP seen HIGH is jitter; a persistent HIGH still blocks) AND 0 MEDIUM.
  // MEDIUM still uses the RAW count (#432): a
  // run whose MEDIUMs were slushed before the gate still "had" those MEDIUMs — so
  // a fresh medium still blocks this path, matching prior behavior.
  const mostRecent = recentRunCounts[0];
  const singleRunCleanEngages =
    mostRecent !== undefined &&
    !mostRecent.degraded &&
    mostRecent.newHighPlusCount === 0 &&
    mostRecent.rawMediumCount === 0;

  const dampened = consecutiveQuietEngages || singleRunCleanEngages;

  const reason = (() => {
    if (sections.length === 0) {
      return 'No audit-barrage lift sections found in audit-log; the dampener has no signal yet.';
    }
    if (dampened) {
      const parts: string[] = [];
      if (consecutiveQuietEngages) {
        parts.push(
          `the last ${threshold} consecutive audit-barrage runs each surfaced 0 NEW-or-persistent HIGH+ findings`,
        );
      }
      if (singleRunCleanEngages && mostRecent !== undefined) {
        parts.push(
          `the most recent run (${mostRecent.runDirBasename}) surfaced 0 NEW-or-persistent HIGH+ AND 0 MEDIUM findings (single-run rule)`,
        );
      }
      return (
        `Dampened: ${parts.join(' AND ')}. The /dwi end-of-task ` +
        `hook should skip — the auditor has gone quiet on real bugs.`
      );
    }
    // FR-009/010/011 + SC-001: blocking is keyed on NEW-or-persistent HIGH+ — only
    // a re-rate-UP (seen lower, now HIGH) is severity jitter; a persistent HIGH
    // keeps blocking.
    const notQuiet = recentRunCounts.filter((r) => r.newHighPlusCount > 0);
    const firstNotQuiet = notQuiet[0];
    if (firstNotQuiet !== undefined) {
      return (
        `Not dampened: ${notQuiet.length} of the last ${recentRunCounts.length} ` +
        `runs surfaced NEW-or-persistent HIGH+ findings (most recent: ` +
        `${firstNotQuiet.runDirBasename} → ${firstNotQuiet.newHighPlusCount} HIGH+).`
      );
    }
    // specs/029 US2 (FR-007): a degraded run blocks dampening even at 0 HIGH+.
    const degradedRuns = recentRunCounts.filter((r) => r.degraded);
    const firstDegraded = degradedRuns[0];
    if (firstDegraded !== undefined) {
      return (
        `Not dampened: ${degradedRuns.length} of the last ${recentRunCounts.length} ` +
        `runs ran over a DEGRADED fleet (most recent: ${firstDegraded.runDirBasename}) — ` +
        `0 HIGH+ over killed/timed-out lanes is not a clean signal (FR-007). Re-run with a ` +
        `healthy fleet to converge.`
      );
    }
    if (mostRecent !== undefined && mostRecent.rawMediumCount > 0) {
      return (
        `Not dampened: most recent run (${mostRecent.runDirBasename}) surfaced ` +
        `0 HIGH+ but ${mostRecent.rawMediumCount} MEDIUM findings — single-run ` +
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
