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
  lines.push(
    report.ready
      ? 'ready: yes (all required items present + well-formed)'
      : 'ready: no (a required item is malformed — see above; not overwritten)',
  );
  return `${lines.join('\n')}\n`;
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
