/**
 * Voice-drift feedback signal — aggregate comment annotations across
 * completed review cycles to surface which voice-skill principles are
 * catching the most operator corrections. The signal surfaces; revising
 * voice skills themselves stays human-driven.
 *
 * Ported from audiocontrol.org's scripts/lib/editorial-review/report.ts.
 * Takes `DeskworkConfig` instead of an implicit rootDir-only contract.
 */

import type { DeskworkConfig } from '../config.ts';
import type { AnnotationCategory, DraftWorkflowState } from './types.ts';
import { readHistory, readWorkflows } from './pipeline.ts';

export interface ReportOptions {
  /** Include only workflows that have reached a terminal state. Default true. */
  terminalOnly?: boolean;
  /** Optional site filter. */
  site?: string;
}

export interface CategoryCounts {
  voiceDrift: number;
  missingReceipt: number;
  tutorialFraming: number;
  saasVocabulary: number;
  fakeAuthority: number;
  structural: number;
  other: number;
}

export interface ReportBreakdown {
  approvedCount: number;
  cancelledCount: number;
  totalComments: number;
  commentsByCategory: CategoryCounts;
  rejectCount: number;
}

export interface ReviewReport {
  all: ReportBreakdown;
  bySite: Record<string, ReportBreakdown>;
  topCategories: Array<{ category: AnnotationCategory; count: number }>;
}

const CATEGORY_KEYS: AnnotationCategory[] = [
  'voice-drift',
  'missing-receipt',
  'tutorial-framing',
  'saas-vocabulary',
  'fake-authority',
  'structural',
  'other',
];

function emptyCounts(): CategoryCounts {
  return {
    voiceDrift: 0,
    missingReceipt: 0,
    tutorialFraming: 0,
    saasVocabulary: 0,
    fakeAuthority: 0,
    structural: 0,
    other: 0,
  };
}

function emptyBreakdown(): ReportBreakdown {
  return {
    approvedCount: 0,
    cancelledCount: 0,
    totalComments: 0,
    commentsByCategory: emptyCounts(),
    rejectCount: 0,
  };
}

function bump(counts: CategoryCounts, category: AnnotationCategory | undefined): void {
  const key = category ?? 'other';
  switch (key) {
    case 'voice-drift': counts.voiceDrift++; break;
    case 'missing-receipt': counts.missingReceipt++; break;
    case 'tutorial-framing': counts.tutorialFraming++; break;
    case 'saas-vocabulary': counts.saasVocabulary++; break;
    case 'fake-authority': counts.fakeAuthority++; break;
    case 'structural': counts.structural++; break;
    default: counts.other++;
  }
}

function categoryValue(counts: CategoryCounts, cat: AnnotationCategory): number {
  switch (cat) {
    case 'voice-drift': return counts.voiceDrift;
    case 'missing-receipt': return counts.missingReceipt;
    case 'tutorial-framing': return counts.tutorialFraming;
    case 'saas-vocabulary': return counts.saasVocabulary;
    case 'fake-authority': return counts.fakeAuthority;
    case 'structural': return counts.structural;
    case 'other': return counts.other;
  }
}

/**
 * Build a voice-drift report from the pipeline + history. Counts only
 * workflows that reached a terminal state by default — in-flight
 * workflows don't represent settled signal yet.
 */
export function buildReport(
  projectRoot: string,
  config: DeskworkConfig,
  opts: ReportOptions = {},
): ReviewReport {
  const { terminalOnly = true, site } = opts;

  const workflows = readWorkflows(projectRoot, config).filter(
    (w) => !site || w.site === site,
  );
  const terminalStates: DraftWorkflowState[] = ['applied', 'cancelled'];
  const scoped = terminalOnly
    ? workflows.filter((w) => terminalStates.includes(w.state))
    : workflows;

  const workflowIds = new Set(scoped.map((w) => w.id));
  const all = emptyBreakdown();
  const bySite: Record<string, ReportBreakdown> = {};

  for (const w of scoped) {
    if (w.state === 'applied') all.approvedCount++;
    if (w.state === 'cancelled') all.cancelledCount++;
    const b = bySite[w.site] ?? emptyBreakdown();
    if (w.state === 'applied') b.approvedCount++;
    if (w.state === 'cancelled') b.cancelledCount++;
    bySite[w.site] = b;
  }

  const workflowSiteById = new Map(scoped.map((w) => [w.id, w.site]));

  for (const entry of readHistory(projectRoot, config)) {
    if (entry.kind !== 'annotation') continue;
    const ann = entry.annotation;
    if (!workflowIds.has(ann.workflowId)) continue;
    const s = workflowSiteById.get(ann.workflowId);

    if (ann.type === 'comment') {
      all.totalComments++;
      bump(all.commentsByCategory, ann.category);
      if (s) {
        const b = bySite[s] ?? emptyBreakdown();
        b.totalComments++;
        bump(b.commentsByCategory, ann.category);
        bySite[s] = b;
      }
    } else if (ann.type === 'reject') {
      all.rejectCount++;
      if (s) {
        const b = bySite[s] ?? emptyBreakdown();
        b.rejectCount++;
        bySite[s] = b;
      }
    }
  }

  const topCategories = CATEGORY_KEYS.map((cat) => ({
    category: cat,
    count: categoryValue(all.commentsByCategory, cat),
  })).sort((a, b) => b.count - a.count);

  return { all, bySite, topCategories };
}

/** Render a report as plain text for the review-report skill. */
export function renderReport(report: ReviewReport): string {
  const lines: string[] = [];
  lines.push('Editorial review — voice-drift signal');
  lines.push('');
  lines.push(
    `Scope: ${report.all.approvedCount} approved, ${report.all.cancelledCount} cancelled (${report.all.rejectCount} reject annotations recorded)`,
  );
  lines.push(`Total comments: ${report.all.totalComments}`);
  lines.push('');
  lines.push('Categories (most → least frequent):');
  for (const { category, count } of report.topCategories) {
    lines.push(`  ${category.padEnd(18)} ${count}`);
  }

  const siteKeys = Object.keys(report.bySite).sort();
  if (siteKeys.length > 1) {
    lines.push('');
    lines.push('Per-site breakdown:');
    for (const s of siteKeys) {
      const b = report.bySite[s];
      lines.push('');
      lines.push(
        `  ${s}: ${b.approvedCount} approved, ${b.cancelledCount} cancelled, ${b.totalComments} comments, ${b.rejectCount} rejects`,
      );
      for (const cat of CATEGORY_KEYS) {
        const n = categoryValue(b.commentsByCategory, cat);
        if (n > 0) lines.push(`    ${cat.padEnd(18)} ${n}`);
      }
    }
  }

  return lines.join('\n');
}
