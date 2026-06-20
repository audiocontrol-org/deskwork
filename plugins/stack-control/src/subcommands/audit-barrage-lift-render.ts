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
export function renderQuietSection(date: string, runDirBasename: string): string {
  return (
    `## ${isoDate(date)} — audit-barrage lift (${runDirBasename})\n\n` +
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
): { section: string; assignedIds: readonly string[] } {
  const isoDateStr = isoDate(date);
  const degradedMarker =
    fleet !== undefined && fleet.produced < fleet.configured
      ? `_Fleet: DEGRADED (produced ${fleet.produced} of ${fleet.configured} configured) — ` +
        `this run is NOT counted as a quiet run by the convergence dampener; 0 HIGH+ over ` +
        `killed/timed-out lanes is not a clean signal (FR-007)._\n\n`
      : '';
  const heading = `## ${isoDateStr} — audit-barrage lift (${runDirBasename})\n\n${degradedMarker}`;
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
