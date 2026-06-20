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
 * A clean-run lift section — header + an explicit 0-findings body — recorded when
 * a HEALTHY-fleet barrage surfaces nothing (claude-20260612-r3). The convergence
 * dampener counts lift SECTIONS, so a clean run that leaves no section is invisible
 * to its consecutive-quiet / single-run-clean rules — the prior HIGH section would
 * stay in the window forever and the gate could never reach OPEN after genuinely
 * clean runs. This section matches the dampener's header regex and carries ZERO
 * `Severity:` lines, so the dampener counts it as a quiet run (0 HIGH+, 0 MEDIUM).
 * (Degraded clean runs are NOT recorded — FR-007: absence over killed lanes is not
 * a clean signal; that branch is gated in the lift, not here.)
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
