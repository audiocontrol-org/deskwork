// Pure proposal composer for Phase 15 close-shipped redesign.
// BundleSet + VerdictSet → Proposal. Also renders the markdown
// summary table the CLI emits after propose runs.

import type {
  BundleSet,
  CandidateBundle,
  Proposal,
  ProposalItem,
  VerdictSet,
} from './types.js';

function evidenceSummary(bundle: CandidateBundle): string {
  const parts: string[] = [];
  const commitCount = bundle.commits.length;
  parts.push(`${commitCount} commit${commitCount === 1 ? '' : 's'}`);
  const auditCount = bundle.audit_log_entries.length;
  if (auditCount > 0) {
    parts.push(`${auditCount} audit entr${auditCount === 1 ? 'y' : 'ies'}`);
  }
  const workplanCount = bundle.workplan_backfills.length;
  if (workplanCount > 0) {
    parts.push(`${workplanCount} workplan back-fill${workplanCount === 1 ? '' : 's'}`);
  }
  if (bundle.pr !== null) {
    parts.push(`PR #${bundle.pr.number}`);
  }
  return parts.join(', ');
}

export function composeProposal(
  bundles: BundleSet,
  verdicts: VerdictSet,
): Proposal {
  const verdictByIssue = new Map<number, VerdictSet['verdicts'][number]>();
  for (const v of verdicts.verdicts) verdictByIssue.set(v.issue, v);

  const items: ProposalItem[] = bundles.bundles.map((b) => {
    const v = verdictByIssue.get(b.issue.number);
    return {
      issue: b.issue.number,
      issue_title: b.issue.title,
      issue_state: b.issue.state,
      agent_verdict: v?.verdict ?? 'error',
      agent_reason: v?.reason ?? 'no verdict returned for this candidate',
      evidence_summary: evidenceSummary(b),
      decision: '',
    };
  });

  items.sort((a, b) => a.issue - b.issue);

  return {
    generated_at: bundles.generated_at,
    from_tag: bundles.from_tag,
    to_tag: bundles.to_tag,
    repo: bundles.repo,
    items,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function renderMarkdownTable(proposal: Proposal): string {
  const lines: string[] = [];
  lines.push(`# close-shipped proposal — ${proposal.from_tag}..${proposal.to_tag}`);
  lines.push('');
  lines.push(`Generated: ${proposal.generated_at}  ·  Repo: ${proposal.repo}`);
  lines.push('');
  lines.push('| #  | Issue | Title (truncated)             | State  | Verdict     | Reason (truncated)                  | Decision    |');
  lines.push('|----|-------|-------------------------------|--------|-------------|-------------------------------------|-------------|');
  proposal.items.forEach((item, idx) => {
    const title = truncate(item.issue_title, 30);
    const reason = truncate(item.agent_reason, 35);
    lines.push(
      `| ${idx + 1} | #${item.issue} | ${title} | ${item.issue_state} | ${item.agent_verdict} | ${reason} | _(operator)_ |`,
    );
  });
  return lines.join('\n');
}
