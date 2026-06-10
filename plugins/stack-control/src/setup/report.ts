// Setup report rendering (009 T013) — assemble the per-item status lines + the
// ready verdict. In dry mode a 'created' item reads as "would create" (nothing
// was written); in apply mode it reads as "created".

import type { SetupReport, SetupStatus } from '../config/types.js';

export function renderReport(report: SetupReport, dryRun: boolean): string {
  const lines: string[] = [];
  lines.push(`stackctl setup — installation root: ${report.installationRoot}`);
  if (dryRun) lines.push('(dry run — no files written; pass --apply to create)');
  for (const item of report.items) {
    const detail = item.detail !== undefined ? ` — ${item.detail}` : '';
    lines.push(`  ${statusLabel(item.status, dryRun)} ${item.key}: ${item.location}${detail}`);
  }
  lines.push(readyVerdict(report, dryRun));
  return `${lines.join('\n')}\n`;
}

/**
 * The readiness verdict must reflect reality (AUDIT-20260610-04). In a dry run no
 * 'created' item exists on disk yet, so claiming "all required items present +
 * well-formed" while items are merely planned is a false-clean report. When any
 * item is in the would-create state, the honest verdict is "would be ready after
 * --apply". When every item is already-present (and verified) — even in dry mode
 * — "ready: yes" is correct.
 */
function readyVerdict(report: SetupReport, dryRun: boolean): string {
  if (!report.ready) {
    return 'ready: no (a required item is malformed — see above; not overwritten)';
  }
  const wouldCreate = report.items.some((item) => item.status === 'created');
  if (dryRun && wouldCreate) {
    return 'ready: no yet — would be ready after --apply (planned items above are not yet created)';
  }
  return 'ready: yes (all required items present + well-formed)';
}

function statusLabel(status: SetupStatus, dryRun: boolean): string {
  switch (status) {
    case 'created':
      return dryRun ? '[would create]' : '[created]';
    case 'already-present':
      return '[already-present]';
    case 'skipped':
      return '[skipped]';
    case 'malformed':
      return '[MALFORMED]';
  }
}
