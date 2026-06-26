/**
 * plugins/stack-control/src/subcommands/audit-barrage-lift-render.ts
 *
 * Pure rendering/formatting helpers for `audit-barrage-lift` — extracted from
 * `audit-barrage-lift.ts` (specs/015 T032) to keep that file under the 300–500
 * line cap after the per-lane severity-decision lines (T013) were added. No I/O;
 * every function here is a pure string builder.
 */

import type { ExtractedFinding } from '../scope-discovery/promote-findings/extract-barrage-findings.js';

/** `YYYYMMDD` → `YYYY-MM-DD`. */
export function isoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * Append a rendered `section` to the existing audit-log text — the single
 * purely-additive composition every lift write goes through (preservation rule:
 * pre-existing content is kept verbatim). Trailing whitespace on the existing text
 * is trimmed, a blank-line separator inserted (or a single newline when the log was
 * empty), and a trailing newline guaranteed.
 */
export function appendSection(existing: string, section: string): string {
  const trimmed = existing.replace(/\s+$/, '');
  const separator = trimmed.length > 0 ? '\n\n' : '\n';
  const composed = `${trimmed}${separator}${section}`;
  return composed.endsWith('\n') ? composed : `${composed}\n`;
}

/**
 * Spec 013 US2: the canonical audit-log header scaffolded at a resolved feature
 * root that has none yet. `targetVersion` carries the legacy-docs version axis
 * (derived from the resolved path); a speckit feature has no version axis, so it
 * is the empty string.
 */
export function buildAuditLogHeader(slug: string, targetVersion: string): string {
  return [
    '---',
    `slug: ${slug}`,
    `targetVersion: "${targetVersion}"`,
    '---',
    '',
    `# Audit log — ${slug}`,
    '',
  ].join('\n');
}

function formatSourceSuffix(sourceFindingIds: readonly string[]): string {
  const stripped = sourceFindingIds.map((id) => id.replace(/^AUDIT-BARRAGE-/i, ''));
  return stripped.join(' + ');
}

/**
 * specs/015 (T013 / FR-002): render the per-lane raw severities and the decision
 * rule alongside the gate-counted `Severity:` line. The dampener reads ONLY the
 * `Severity:` line (its contract is unchanged); these lines make the
 * de-inflation auditable (SC-002) — the raw inputs and the rule that produced
 * the gate-counted result are recoverable on disk.
 */
function renderDecisionLines(finding: ExtractedFinding): string[] {
  const perLane = finding.perLaneSeverities.map((p) => `${p.model}=${p.severity}`).join(', ');
  const decision = finding.severityDecision;
  const basis =
    decision.rule === 'adjudicated' && decision.adjudicationBasis !== undefined
      ? ` — ${decision.adjudicationBasis}`
      : '';
  return [
    `Per-lane:   ${perLane}`,
    `Decision:   ${decision.rule} (gate-counted ${decision.gateCountedSeverity})${basis}`,
  ];
}

function renderEntry(finding: ExtractedFinding, date: string, nn: number): string {
  const idPadded = nn.toString().padStart(2, '0');
  const fullId = `AUDIT-${date}-${idPadded}`;
  const suffix = finding.crossModelAgreement
    ? ` (${formatSourceSuffix(finding.sourceFindingIds)}; cross-model)`
    : '';
  const body = finding.body.length > 0 ? finding.body : '_(no body captured)_';
  return [
    `### ${fullId} — ${finding.heading}`,
    '',
    `Finding-ID: ${fullId}${suffix}`,
    `Status:     open`,
    `Severity:   ${finding.severity}`,
    ...renderDecisionLines(finding),
    `Surface:    ${finding.surface}`,
    '',
    body,
    '',
  ].join('\n');
}

/**
 * The 0-finding lift section. Despite the name, it renders BOTH no-finding outcomes
 * (TASK-350) — the dampener counts lift SECTIONS, so a 0-finding run that leaves no
 * section is invisible to its consecutive-quiet / single-run-clean rules (the prior
 * HIGH section would stay in the window forever and the gate could never reach OPEN
 * after genuinely clean runs):
 *
 *   - HEALTHY fleet → a true QUIET section: header + an explicit 0-findings body, ZERO
 *     `Severity:` lines, so the dampener counts it as a quiet run (claude-20260612-r3).
 *   - DEGRADED fleet (`fleet.produced < fleet.configured`) → a section carrying the
 *     `Fleet: DEGRADED` marker (FR-007). It is STILL recorded here — so it becomes the
 *     dampener's most-recent run and BLOCKS convergence — because absence of HIGH over
 *     killed/timed-out lanes is NOT a clean signal. (Earlier comments here wrongly said
 *     degraded clean runs were not recorded / were gated in the lift — TASK-342/351.)
 */
export function renderQuietSection(
  date: string,
  runDirBasename: string,
  fleet?: SectionFleetStatus,
  tipSha?: string,
): string {
  // specs/029 US3 (AUDIT-BARRAGE-codex-01): record the audited code epoch so the
  // dampener can scope FR-010 re-rate suppression to UNCHANGED code. The
  // `Code-sha:` marker lives in the section preamble (before the first `### `
  // entry); a run with no captured tip.sha (outage) omits it and is treated as a
  // unique epoch by the dampener (never cross-suppressing).
  const codeShaLine = tipSha !== undefined && tipSha.length > 0 ? `Code-sha: ${tipSha}\n` : '';
  const header = `## ${isoDate(date)} — audit-barrage lift (${runDirBasename})\n\n${codeShaLine}`;
  // specs/029 US2 (FR-007 / AUDIT-BARRAGE-codex-01): a 0-finding run over a
  // DEGRADED fleet must STILL record a section — carrying the `Fleet: DEGRADED`
  // marker — so it is the dampener's most-recent run and BLOCKS convergence.
  // Recording nothing (the prior behavior) left a stale prior clean section as
  // "most recent", letting the single-run-clean rule dampen on it. A degraded
  // clean run is the opposite of a clean signal; it must be visible AND flagged.
  if (fleet !== undefined && fleet.produced < fleet.configured) {
    return (
      header +
      `_Fleet: DEGRADED (produced ${fleet.produced} of ${fleet.configured} configured) — ` +
      `0 findings, but absence over killed/timed-out lanes is NOT a clean signal. This run ` +
      `is NOT counted as a quiet run by the convergence dampener (FR-007)._\n`
    );
  }
  return (
    header +
    `_No findings surfaced — a clean barrage run over a healthy fleet (0 HIGH+, ` +
    `0 MEDIUM, 0 total). Recorded so the convergence dampener counts it as a quiet ` +
    `run (claude-20260612-r3); a clean run that left no section was invisible to the ` +
    `consecutive-quiet / single-run-clean rules._\n`
  );
}

/**
 * specs/029 US4 (AUDIT-BARRAGE-codex-01/claude-01): a re-report entry paired with
 * the canonical `AUDIT-NN` id it dedups against. The render layer takes the pairing
 * structurally (no import from the govern loop-hygiene layer) so the dependency
 * stays one-directional.
 */
export interface RereportInput {
  readonly finding: ExtractedFinding;
  readonly canonicalId: string;
}

/**
 * specs/029 US4 (claude-04): the label a MIXED section (new liftable entries +
 * re-surfaced already-tracked ones) prepends to its re-report block, so the two
 * finding categories are distinguishable without reading every `Status:` field.
 * The pure-re-report section (`renderRereportSection`) has its own preamble; this
 * is only for the appended-to-a-findings-section case.
 */
export const REREPORT_MIXED_LABEL =
  '_Re-surfaced persistent findings (already tracked; no new IDs/tasks — see each ' +
  '`Tracked-by:`). Recorded so the convergence dampener still counts their severity (US3 SC-001)._';

/**
 * specs/029 US4 (graduation-safety fix): render ONE re-report entry for a finding the
 * FR-016 cross-run dedup suppressed (already present in the audit-log at an OPEN
 * status; NOT `fixed-<sha>`). A re-report entry gets NO fresh `AUDIT-NN` id and NO new
 * backlog task (FR-016: ≤1 task per signature) — but it MUST carry a `Severity:` line
 * so the convergence dampener still counts the run's surfaced severity. Without this,
 * an all-deduped re-run rendered a PRISTINE quiet section (zero `Severity:` lines) and
 * the single-run-clean rule graduated a feature with a real, still-open, still-unfixed
 * HIGH (US3 SC-001 defeated).
 *
 * The entry deliberately does NOT use `Status:     open` — the slush path picks ONLY
 * open entries to migrate to the backlog, so an open re-report would manufacture the
 * duplicate task FR-016 exists to prevent. It carries `Status:     re-reported` (a
 * non-open, dampener-irrelevant status — the dampener RAW count ignores `Status:`
 * entirely) plus a `Tracked-by:` pointer to the canonical entry that already tracks
 * it (codex-01/claude-01). The dampener's RAW count (`rawHighPlusCount` /
 * `rawMediumCount`, used by single-run-clean) sees the `Severity:` line regardless of
 * status, and its identity-keyed `newHighPlusCount` (used by N-consecutive-quiet)
 * folds these `(signature, severity)` pairs so a persistent HIGH keeps blocking.
 */
function renderRereportEntry(entry: RereportInput): string {
  const { finding, canonicalId } = entry;
  const suffix = finding.crossModelAgreement
    ? ` (${finding.sourceModels.join(' + ')}; cross-model)`
    : '';
  return [
    `### ${finding.heading}`,
    '',
    `Status:     re-reported (already tracked${suffix})`,
    // codex-01/claude-01: a DURABLE, machine-readable pointer to the canonical
    // entry — NOT a fresh `Finding-ID:` (that would mint a duplicate backlog task
    // and a new dedup signature; the parser skips entries without `Finding-ID:`).
    `Tracked-by: ${canonicalId}`,
    `Severity:   ${finding.severity}`,
    `Surface:    ${finding.surface}`,
    '',
  ].join('\n');
}

/**
 * Render only the re-report ENTRY blocks (no section header) for a set of
 * already-tracked findings — used to APPEND re-reports to a section that also
 * carries new liftable entries, so a run's full surfaced severity (new + persistent)
 * is recorded in one section. Each entry carries a `Severity:` line (counted by the
 * dampener), a non-open `Status:` (so the slush path never migrates a duplicate
 * backlog task), and a `Tracked-by:` pointer to its canonical entry. Empty input →
 * empty string (nothing to append).
 */
export function renderRereportEntries(entries: readonly RereportInput[]): string {
  if (entries.length === 0) return '';
  return entries.map(renderRereportEntry).join('\n');
}

export function renderRereportSection(
  findings: readonly RereportInput[],
  date: string,
  runDirBasename: string,
  fleet?: SectionFleetStatus,
  tipSha?: string,
): string {
  // claude (phase-2 re-govern): the preamble asserts "every finding this run
  // surfaced is already tracked" — vacuously FALSE for an empty set. The caller
  // (recordNoNewFindingsSection) only reaches this branch when dedupSuppressedOpen
  // is non-empty; a zero-finding call is a contract violation, so fail loud rather
  // than render a factually-wrong section (the quiet/degraded sections cover the
  // genuinely-zero cases).
  if (findings.length === 0) {
    throw new Error(
      'renderRereportSection: called with zero re-surfaced findings — a re-report section ' +
        'requires ≥1 finding (the caller must route a genuinely-empty run to renderQuietSection).',
    );
  }
  const isoDateStr = isoDate(date);
  const degradedMarker =
    fleet !== undefined && fleet.produced < fleet.configured
      ? `_Fleet: DEGRADED (produced ${fleet.produced} of ${fleet.configured} configured) — ` +
        `this run is NOT counted as a quiet run by the convergence dampener; 0 HIGH+ over ` +
        `killed/timed-out lanes is not a clean signal (FR-007)._\n\n`
      : '';
  const codeShaLine = tipSha !== undefined && tipSha.length > 0 ? `Code-sha: ${tipSha}\n` : '';
  const preamble =
    `_No NEW findings — every finding this run surfaced is already tracked in the audit-log ` +
    `(FR-016 cross-run dedup). Re-reported here, WITHOUT new IDs or backlog tasks, so the ` +
    `convergence dampener still sees their severity: a persistent OPEN finding keeps blocking ` +
    `(US3 SC-001). Resolve the canonical entries (mark them \`fixed-<sha>\`) to converge._\n\n`;
  const heading =
    `## ${isoDateStr} — audit-barrage lift (${runDirBasename})\n\n${codeShaLine}${degradedMarker}${preamble}`;
  return heading + renderRereportEntries(findings);
}

/**
 * specs/029 US2 (FR-007): a fleet snapshot for a section. When `produced <
 * configured` the section is recorded over a DEGRADED fleet and `renderSection`
 * stamps a `Fleet: DEGRADED …` marker the convergence dampener reads back to
 * exclude the run from the quiet streak (a degraded run's 0-HIGH is not clean).
 */
export interface SectionFleetStatus {
  readonly produced: number;
  readonly configured: number;
}

export function renderSection(
  findings: readonly ExtractedFinding[],
  date: string,
  startingNn: number,
  runDirBasename: string,
  fleet?: SectionFleetStatus,
  tipSha?: string,
): { section: string; assignedIds: readonly string[] } {
  const isoDateStr = isoDate(date);
  const degradedMarker =
    fleet !== undefined && fleet.produced < fleet.configured
      ? `_Fleet: DEGRADED (produced ${fleet.produced} of ${fleet.configured} configured) — ` +
        `this run is NOT counted as a quiet run by the convergence dampener; 0 HIGH+ over ` +
        `killed/timed-out lanes is not a clean signal (FR-007)._\n\n`
      : '';
  // specs/029 US3 (AUDIT-BARRAGE-codex-01): the audited code epoch. Lives in the
  // preamble alongside the (optional) degraded marker; both can coexist. Omitted
  // for an outage run with no captured tip.sha → the dampener isolates the epoch.
  const codeShaLine = tipSha !== undefined && tipSha.length > 0 ? `Code-sha: ${tipSha}\n` : '';
  const heading = `## ${isoDateStr} — audit-barrage lift (${runDirBasename})\n\n${codeShaLine}${degradedMarker}`;
  const assignedIds: string[] = [];
  const entries: string[] = [];
  for (let i = 0; i < findings.length; i += 1) {
    const nn = startingNn + i;
    const finding = findings[i]!;
    const idPadded = nn.toString().padStart(2, '0');
    assignedIds.push(`AUDIT-${date}-${idPadded}`);
    entries.push(renderEntry(finding, date, nn));
  }
  return { section: heading + entries.join('\n'), assignedIds };
}
