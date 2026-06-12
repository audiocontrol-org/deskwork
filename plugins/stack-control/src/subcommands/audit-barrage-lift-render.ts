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

export function renderSection(
  findings: readonly ExtractedFinding[],
  date: string,
  startingNn: number,
  runDirBasename: string,
): { section: string; assignedIds: readonly string[] } {
  const isoDateStr = isoDate(date);
  const heading = `## ${isoDateStr} — audit-barrage lift (${runDirBasename})\n\n`;
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
