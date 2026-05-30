// Apply runtime for Phase 15 close-shipped redesign. Consumes an
// operator-curated Proposal; pre-validates every item has a valid
// decision; dispatches gh comment + label per effectively-shipped row.

import type { Proposal, ProposalDecision, ProposalItem, RunGh } from './types.js';

export class InvalidProposalError extends Error {
  override name = 'InvalidProposalError';
}

const VALID_DECISIONS: ReadonlySet<ProposalDecision> = new Set<ProposalDecision>([
  'accept-verdict',
  'override-shipped',
  'override-not-shipped',
  'skip',
]);

const LABEL = 'pending-verification';

export interface PerItemOutcome {
  readonly issue: number;
  readonly error?: string;
}

export interface ApplyV2Result {
  readonly applied: readonly PerItemOutcome[];
  readonly skipped: readonly PerItemOutcome[];
  readonly failed: readonly PerItemOutcome[];
}

export interface ApplyV2Args {
  readonly proposal: Proposal;
  readonly runGh: RunGh;
}

function effectiveVerdict(item: ProposalItem): 'shipped' | 'skip' {
  switch (item.decision) {
    case 'accept-verdict':
      return item.agent_verdict === 'shipped' ? 'shipped' : 'skip';
    case 'override-shipped':
      return 'shipped';
    case 'override-not-shipped':
    case 'skip':
      return 'skip';
    default:
      return 'skip';
  }
}

function validateProposal(proposal: Proposal): void {
  const errors: string[] = [];
  proposal.items.forEach((item, idx) => {
    if (
      item.decision === '' ||
      !VALID_DECISIONS.has(item.decision as ProposalDecision)
    ) {
      errors.push(
        `item ${idx + 1} (#${item.issue}): decision is "${item.decision || '<unset>'}"; ` +
          `must be one of: ${Array.from(VALID_DECISIONS).join(', ')}.`,
      );
    }
  });
  if (errors.length > 0) {
    throw new InvalidProposalError(
      `Proposal failed validation; refusing to apply.\n  ${errors.join('\n  ')}`,
    );
  }
}

function buildCommentBody(item: ProposalItem, proposal: Proposal): string {
  return [
    `Shipped in ${proposal.to_tag}. Please verify against an installed release before closing this issue.`,
    '',
    'Evidence: ' + item.evidence_summary,
    'Agent reason: ' + item.agent_reason,
    '',
    'Install / repro instructions (per the project rule "Issue closure requires verification in a formally-installed release"):',
    `1. Install / upgrade to ${proposal.to_tag}.`,
    '2. Reproduce the original issue.',
    '3. If the fix holds, close with a brief note.',
    '4. If not, comment with the surviving symptom.',
  ].join('\n');
}

export function applyV2(args: ApplyV2Args): ApplyV2Result {
  validateProposal(args.proposal);

  const applied: PerItemOutcome[] = [];
  const skipped: PerItemOutcome[] = [];
  const failed: PerItemOutcome[] = [];

  for (const item of args.proposal.items) {
    if (effectiveVerdict(item) === 'skip') {
      skipped.push({ issue: item.issue });
      continue;
    }
    const num = String(item.issue);
    try {
      const body = buildCommentBody(item, args.proposal);
      args.runGh(['issue', 'comment', num, '--repo', args.proposal.repo, '--body', body]);
      args.runGh([
        'issue',
        'edit',
        num,
        '--repo',
        args.proposal.repo,
        '--add-label',
        LABEL,
      ]);
      applied.push({ issue: item.issue });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ issue: item.issue, error: msg });
    }
  }

  return { applied, skipped, failed };
}
