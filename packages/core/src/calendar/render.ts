import type { Entry, Stage } from '../schema/entry.ts';

const STAGE_ORDER: readonly Stage[] = [
  'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled',
] as const;

const HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER = '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';
const EMPTY = '*No entries.*\n\n';

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function renderRow(e: Entry): string {
  return `| ${e.uuid} | ${escapePipe(e.slug)} | ${escapePipe(e.title)} | ${escapePipe(e.description ?? '')} | ${escapePipe(e.keywords.join(', '))} | ${escapePipe(e.source)} | ${e.updatedAt} |`;
}

/**
 * Bucketize entries by stage. The map key is `string` rather than the
 * legacy `Stage` enum so this function handles entries from any lane
 * template — entries whose `currentStage` is outside the editorial
 * pipeline's eight known stages simply don't land in any bucket here
 * (the editorial calendar surface is intentionally editorial-only).
 * Phase 4's lane-aware calendar rendering replaces this with a
 * template-driven bucketization; see graphical-entries workplan.
 */
function bucketize(entries: Entry[]): Map<string, Entry[]> {
  const byStage = new Map<string, Entry[]>();
  for (const stage of STAGE_ORDER) byStage.set(stage, []);
  for (const e of entries) {
    const bucket = byStage.get(e.currentStage);
    if (bucket) bucket.push(e);
  }
  return byStage;
}

function renderStageSection(stage: Stage, bucket: readonly Entry[]): string {
  let section = `## ${stage}\n\n`;
  if (bucket.length === 0) {
    section += EMPTY;
    return section;
  }
  section += TABLE_HEADER;
  for (const e of bucket) section += renderRow(e) + '\n';
  section += '\n';
  return section;
}

export function renderCalendar(entries: Entry[]): string {
  const byStage = bucketize(entries);

  let md = HEADER;
  for (const stage of STAGE_ORDER) {
    const bucket = byStage.get(stage) ?? [];
    md += renderStageSection(stage, bucket);
  }
  md += `## Distribution\n\n*reserved for shortform DistributionRecords — separate model*\n`;
  return md;
}
