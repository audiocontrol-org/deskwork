// 011 T011 — render the OrientationReport as human-readable text. The --json
// form is the raw report object (emitted by the verb), for non-Claude-Code
// adapters. The staleness slot is added by US4 (T029).

import type { OrientationReport } from './orient.js';

export function renderOrientation(report: OrientationReport): string {
  const lines: string[] = [];
  lines.push(`stack-control session-start — ${report.installationRoot}`);
  lines.push('');

  lines.push('Roadmap:');
  lines.push(`  Ready (${report.roadmap.ready.length}):`);
  if (report.roadmap.ready.length === 0) lines.push('    (none ready)');
  for (const i of report.roadmap.ready) lines.push(`    - ${i.identifier} [${i.status}]`);
  lines.push(`  Blocked (${report.roadmap.blocked.length}):`);
  for (const i of report.roadmap.blocked) lines.push(`    - ${i.identifier} [${i.status}]`);
  lines.push('');

  lines.push('Active spec:');
  if (report.activeSpec === null) {
    lines.push('  (no active spec)');
  } else {
    const a = report.activeSpec;
    lines.push(`  ${a.featureDir}`);
    lines.push(`  artifacts: ${a.artifactsPresent.join(', ') || '(none)'}`);
    lines.push(`  next: /speckit-${a.nextStep}`);
  }
  lines.push('');

  lines.push('Latest journal entry:');
  if (report.latestJournalEntry === null) {
    lines.push('  (no prior journal entry)');
  } else {
    lines.push(`  ${report.latestJournalEntry.heading}`);
    for (const l of report.latestJournalEntry.excerpt.split('\n')) {
      if (l.trim().length > 0) lines.push(`    ${l}`);
    }
  }
  lines.push('');

  lines.push(`Open backlog (${report.openBacklog.length}):`);
  if (report.openBacklog.length === 0) lines.push('  (backlog empty)');
  for (const i of report.openBacklog) lines.push(`  - ${i.id} [${i.status}] ${i.title}`);
  lines.push('');

  lines.push('Branch staleness:');
  lines.push(`  ${renderStaleness(report)}`);

  return lines.join('\n') + '\n';
}

function renderStaleness(report: OrientationReport): string {
  const s = report.staleness;
  switch (s.kind) {
    case 'behind':
      return `behind ${s.base} by ${s.behindCount} commit(s) — consider rebasing (advisory)`;
    case 'current':
      return 'up to date with base';
    case 'skipped':
      return `skipped (${s.reason})`;
  }
}
