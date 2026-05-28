import type {
  DebtReport,
  GhIssuesReport,
  IssueSample,
  ParkedBranchesReport,
  WorkplanTbdsReport,
} from './types.js';

function renderGhSection(gh: GhIssuesReport): string {
  const lines: string[] = [];
  lines.push('## GitHub issues');
  lines.push('');
  lines.push(`Total open: **${gh.total_open}**`);
  lines.push('');

  lines.push('### By label');
  lines.push('');
  if (Object.keys(gh.by_label).length === 0) {
    lines.push('_no labeled issues_');
  } else {
    lines.push('| Label | Count |');
    lines.push('|---|---|');
    const sorted = Object.entries(gh.by_label).sort((a, b) => b[1] - a[1]);
    for (const [label, count] of sorted) {
      lines.push(`| ${label} | ${count} |`);
    }
  }
  lines.push('');

  lines.push(`### Unlabeled — count: **${gh.unlabeled.count}**`);
  lines.push('');
  renderIssueSampleTable(lines, gh.unlabeled.sample);
  lines.push('');

  lines.push(
    `### Stale (no update > ${gh.stale.threshold_days}d) — count: **${gh.stale.count}**`,
  );
  lines.push('');
  renderIssueSampleTable(lines, gh.stale.sample);
  lines.push('');

  lines.push(
    `### Stale since last comment (> ${gh.stale_since_last_comment.threshold_days}d) — count: **${gh.stale_since_last_comment.count}**`,
  );
  lines.push('');
  renderIssueSampleTable(lines, gh.stale_since_last_comment.sample);
  lines.push('');

  return lines.join('\n');
}

function renderIssueSampleTable(
  lines: string[],
  sample: readonly IssueSample[],
): void {
  if (sample.length === 0) {
    lines.push('_no issues in sample_');
    return;
  }
  lines.push('| # | Title | Updated |');
  lines.push('|---|---|---|');
  for (const item of sample) {
    const safeTitle = item.title.replace(/\|/g, '\\|');
    lines.push(`| [#${item.number}](${item.url}) | ${safeTitle} | ${item.updated_at} |`);
  }
}

function renderWorkplanSection(wp: WorkplanTbdsReport): string {
  const lines: string[] = [];
  lines.push('## Workplan TBDs');
  lines.push('');
  lines.push(`Total: **${wp.total}**`);
  lines.push('');
  if (wp.features.length === 0) {
    lines.push('_no in-progress features with TBD markers_');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| Feature | Version | TBD | defer | follow-up | out of scope | Total |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const f of wp.features) {
    lines.push(
      `| ${f.slug} | ${f.target_version} | ${f.counts.tbd} | ${f.counts.defer} | ${f.counts.follow_up} | ${f.counts.out_of_scope} | ${f.counts.total} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function renderBranchesSection(pb: ParkedBranchesReport): string {
  const lines: string[] = [];
  lines.push('## Parked branches');
  lines.push('');
  lines.push(
    `Parked (threshold: ${pb.parked_threshold_days} days): **${pb.parked.length}**`,
  );
  lines.push('');
  if (pb.parked.length === 0) {
    lines.push('_no parked branches_');
  } else {
    lines.push('| Ref | Ahead | Behind | Last commit |');
    lines.push('|---|---|---|---|');
    for (const b of pb.parked) {
      lines.push(
        `| ${b.refname} | ${b.ahead} | ${b.behind} | ${b.last_commit_date} |`,
      );
    }
  }
  lines.push('');
  lines.push(`Other branches: **${pb.other_branches.length}**`);
  lines.push('');
  if (pb.other_branches.length === 0) {
    lines.push('_no other branches_');
  } else {
    lines.push('| Ref | Ahead | Behind | Last commit |');
    lines.push('|---|---|---|---|');
    for (const b of pb.other_branches) {
      lines.push(
        `| ${b.refname} | ${b.ahead} | ${b.behind} | ${b.last_commit_date} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function formatMarkdown(report: DebtReport): string {
  const parts: string[] = [];
  parts.push('# Debt report');
  parts.push('');
  parts.push(`Generated at: ${report.generated_at}`);
  parts.push('');

  if (report.github_issues === null) {
    parts.push('## GitHub issues');
    parts.push('');
    parts.push('(skipped via --no-gh)');
    parts.push('');
  } else {
    parts.push(renderGhSection(report.github_issues));
  }

  if (report.workplan_tbds === null) {
    parts.push('## Workplan TBDs');
    parts.push('');
    parts.push('(skipped via --no-workplan)');
    parts.push('');
  } else {
    parts.push(renderWorkplanSection(report.workplan_tbds));
  }

  if (report.parked_branches === null) {
    parts.push('## Parked branches');
    parts.push('');
    parts.push('(skipped via --no-branches)');
    parts.push('');
  } else {
    parts.push(renderBranchesSection(report.parked_branches));
  }

  return parts.join('\n');
}

export function formatJson(report: DebtReport): string {
  return JSON.stringify(report, null, 2);
}
