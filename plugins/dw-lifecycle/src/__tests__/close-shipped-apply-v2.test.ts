import { describe, it, expect } from 'vitest';
import { applyV2, InvalidProposalError } from '../close-shipped/apply-v2.js';
import type { Proposal } from '../close-shipped/types.js';

const baseProposal: Proposal = {
  generated_at: '2026-05-30T03:15:22Z',
  from_tag: 'v0.27.0',
  to_tag: 'v0.28.1',
  repo: 'owner/repo',
  items: [
    {
      issue: 361,
      issue_title: 'session-end-hygiene',
      issue_state: 'OPEN',
      agent_verdict: 'shipped',
      agent_reason: 'Phase 12 fix lands in 8841be9',
      evidence_summary: '1 commit, 1 audit entry, PR #365',
      decision: 'accept-verdict',
    },
    {
      issue: 353,
      issue_title: 'audit-barrage Phase 12',
      issue_state: 'OPEN',
      agent_verdict: 'not-shipped',
      agent_reason: 'back-fill docs commit',
      evidence_summary: '1 commit',
      decision: 'accept-verdict',
    },
  ],
};

describe('applyV2', () => {
  it('throws InvalidProposalError when any item has empty decision', () => {
    const bad: Proposal = {
      ...baseProposal,
      items: [{ ...baseProposal.items[0]!, decision: '' }],
    };
    expect(() => applyV2({ proposal: bad, runGh: () => '' })).toThrow(
      InvalidProposalError,
    );
  });

  it('throws InvalidProposalError when any item has an unknown decision', () => {
    const bad: Proposal = {
      ...baseProposal,
      items: [
        // @ts-expect-error: testing runtime validation of an invalid literal
        { ...baseProposal.items[0]!, decision: 'frobnicate' },
      ],
    };
    expect(() => applyV2({ proposal: bad, runGh: () => '' })).toThrow(
      InvalidProposalError,
    );
  });

  it('dispatches gh comment + label per accept-verdict-shipped item; skips others', () => {
    const ghCalls: string[][] = [];
    const runGh = (args: readonly string[]): string => {
      ghCalls.push([...args]);
      return '';
    };
    const result = applyV2({ proposal: baseProposal, runGh });
    expect(result.applied.length).toBe(1);
    expect(result.applied[0]?.issue).toBe(361);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0]?.issue).toBe(353);
    expect(ghCalls.length).toBe(2);
    expect(ghCalls[0]?.includes('comment')).toBe(true);
    expect(ghCalls[1]?.includes('edit')).toBe(true);
  });

  it('override-shipped triggers gh dispatch regardless of agent verdict', () => {
    const overridden: Proposal = {
      ...baseProposal,
      items: [
        { ...baseProposal.items[0]!, decision: 'override-shipped' },
        { ...baseProposal.items[1]!, decision: 'override-shipped' },
      ],
    };
    const ghCalls: string[][] = [];
    const result = applyV2({
      proposal: overridden,
      runGh: (args) => {
        ghCalls.push([...args]);
        return '';
      },
    });
    expect(result.applied.length).toBe(2);
  });

  it('records gh failures as failed items but keeps applying the rest', () => {
    let firstCall = true;
    const result = applyV2({
      proposal: baseProposal,
      runGh: () => {
        if (firstCall) {
          firstCall = false;
          throw new Error('gh: rate limit');
        }
        return '';
      },
    });
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.error).toContain('rate limit');
  });
});
