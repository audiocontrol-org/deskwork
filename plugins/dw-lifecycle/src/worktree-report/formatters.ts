// Markdown + JSON formatters for /dw-lifecycle:worktree-report.

import type {
  WorkingTreeState,
  WorktreeEntry,
  WorktreeReport,
} from './types.js';

export function formatJson(report: WorktreeReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function workingTreeLabel(state: WorkingTreeState): string {
  if (state === 'clean') return 'clean';
  return `dirty (${state.dirty} file${state.dirty === 1 ? '' : 's'})`;
}

function featureDocLabel(entry: WorktreeEntry): string {
  const fd = entry.feature_doc;
  if (fd.location === 'none') return '—';
  if (fd.location === 'in-progress') return `001-IN-PROGRESS/${fd.slug}`;
  return `003-COMPLETE/${fd.slug}`;
}

function lastCommitLabel(entry: WorktreeEntry): string {
  if (entry.last_commit_date.length === 0) return '—';
  const day = entry.last_commit_date.slice(0, 10);
  const sha = entry.last_commit_sha.slice(0, 7);
  return `${day} (${sha})`;
}

function aheadBehindLabel(entry: WorktreeEntry): string {
  if (entry.ahead === 0 && entry.behind === 0) return '0 / 0';
  return `${entry.ahead} / ${entry.behind}`;
}

const VERDICT_HEADERS: Record<WorktreeEntry['verdict'], string> = {
  stale: 'Stale (dismantle candidates)',
  orphan: 'Orphan directories',
  divergent: 'Divergent (force-push detected)',
  corrupt: 'Corrupt (multi-worktree-same-branch)',
  keep: 'Keep (active)',
  current: 'Current worktree (this session)',
  main: 'Main worktree (project anchor)',
};

const VERDICT_ORDER: ReadonlyArray<WorktreeEntry['verdict']> = [
  'stale',
  'orphan',
  'divergent',
  'corrupt',
  'keep',
  'current',
  'main',
];

function renderEntryTable(entries: readonly WorktreeEntry[]): string {
  const header = '| Path | Branch | Ahead/Behind | Last commit | Working tree | PR | Feature doc | Disposition |';
  const sep = '|---|---|---|---|---|---|---|---|';
  const rows = entries.map((e) => {
    const path = e.path;
    const branch = e.branch ?? '(detached)';
    const ab = aheadBehindLabel(e);
    const lc = lastCommitLabel(e);
    const wt = workingTreeLabel(e.working_tree_state);
    const pr = e.pr_number !== undefined ? `${e.pr_state} #${e.pr_number}` : e.pr_state;
    const fd = featureDocLabel(e);
    const disp = e.recommended_disposition;
    return `| \`${path}\` | \`${branch}\` | ${ab} | ${lc} | ${wt} | ${pr} | ${fd} | ${disp} |`;
  });
  return [header, sep, ...rows].join('\n');
}

function renderSignals(entries: readonly WorktreeEntry[]): string {
  // Per-entry per-criterion check, surfaced even for keep verdicts so the
  // operator sees what signaled (and what didn't) without re-running.
  const lines: string[] = [];
  for (const e of entries) {
    lines.push(`#### \`${e.path}\``);
    const held = e.signals.filter((s) => s.held);
    const notHeld = e.signals.filter((s) => !s.held);
    lines.push(`- Held (${held.length}): ${held.map((s) => s.signal).join(', ') || '—'}`);
    lines.push(`- Not held (${notHeld.length}): ${notHeld.map((s) => s.signal).join(', ')}`);
    const withNotes = e.signals.filter((s) => s.note !== undefined);
    if (withNotes.length > 0) {
      lines.push('- Notes:');
      for (const s of withNotes) {
        lines.push(`  - \`${s.signal}\` — ${s.note}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function formatMarkdown(report: WorktreeReport): string {
  const parts: string[] = [];
  parts.push('# Worktree debt report');
  parts.push('');
  parts.push(`Generated: \`${report.generated_at}\`  ·  Days threshold: \`${report.days_threshold}\`  ·  Signals needed: \`${report.threshold_count}\`  ·  Base: \`${report.worktree_base || '(none detected)'}\``);
  parts.push('');

  const counts = new Map<WorktreeEntry['verdict'], number>();
  for (const e of report.entries) {
    counts.set(e.verdict, (counts.get(e.verdict) ?? 0) + 1);
  }
  parts.push('## Summary');
  parts.push('');
  parts.push('| Verdict | Count |');
  parts.push('|---|---|');
  for (const v of VERDICT_ORDER) {
    const c = counts.get(v) ?? 0;
    parts.push(`| ${v} | ${c} |`);
  }
  parts.push('');

  for (const v of VERDICT_ORDER) {
    const bucket = report.entries.filter((e) => e.verdict === v);
    if (bucket.length === 0) continue;
    parts.push(`## ${VERDICT_HEADERS[v]} (${bucket.length})`);
    parts.push('');
    parts.push(renderEntryTable(bucket));
    parts.push('');
    parts.push('### Per-criterion check');
    parts.push('');
    parts.push(renderSignals(bucket));
  }

  if (report.entries.length === 0) {
    parts.push('_No worktrees found._');
    parts.push('');
  }

  return parts.join('\n');
}
