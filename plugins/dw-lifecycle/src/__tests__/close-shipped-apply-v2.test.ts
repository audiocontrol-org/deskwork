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

// Test-double for runGh. By default, `gh label list` returns the
// label-already-exists shape so existing tests stay focused on per-item
// dispatch; pre-flight is a single call before the loop and adds one
// entry at the head of `calls`.
interface StubOpts {
  readonly labelExists?: boolean;
  readonly labelCreateThrows?: string;
  readonly failAtCallIndex?: number;
  readonly failError?: string;
}
function stubRunGh(opts: StubOpts = {}): {
  runGh: (args: readonly string[]) => string;
  calls: string[][];
} {
  const calls: string[][] = [];
  const labelExists = opts.labelExists ?? true;
  const runGh = (args: readonly string[]): string => {
    const idx = calls.length;
    calls.push([...args]);
    if (opts.failAtCallIndex !== undefined && idx === opts.failAtCallIndex) {
      throw new Error(opts.failError ?? 'gh: stubbed failure');
    }
    if (args[0] === 'label' && args[1] === 'list') {
      return labelExists ? '[{"name":"pending-verification"}]' : '[]';
    }
    if (args[0] === 'label' && args[1] === 'create') {
      if (opts.labelCreateThrows !== undefined) {
        throw new Error(opts.labelCreateThrows);
      }
      return '';
    }
    return '';
  };
  return { runGh, calls };
}

describe('applyV2', () => {
  it('throws InvalidProposalError when any item has empty decision', () => {
    const bad: Proposal = {
      ...baseProposal,
      items: [{ ...baseProposal.items[0]!, decision: '' }],
    };
    const { runGh } = stubRunGh();
    expect(() => applyV2({ proposal: bad, runGh })).toThrow(
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
    const { runGh } = stubRunGh();
    expect(() => applyV2({ proposal: bad, runGh })).toThrow(
      InvalidProposalError,
    );
  });

  it('dispatches gh comment + label per accept-verdict-shipped item; skips others', () => {
    const { runGh, calls } = stubRunGh({ labelExists: true });
    const result = applyV2({ proposal: baseProposal, runGh });
    expect(result.applied.length).toBe(1);
    expect(result.applied[0]?.issue).toBe(361);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0]?.issue).toBe(353);
    // 1 pre-flight `label list` + 1 comment + 1 edit = 3 calls.
    expect(calls.length).toBe(3);
    expect(calls[0]?.[0]).toBe('label');
    expect(calls[0]?.[1]).toBe('list');
    expect(calls[1]?.includes('comment')).toBe(true);
    expect(calls[2]?.includes('edit')).toBe(true);
  });

  it('override-shipped triggers gh dispatch regardless of agent verdict', () => {
    const overridden: Proposal = {
      ...baseProposal,
      items: [
        { ...baseProposal.items[0]!, decision: 'override-shipped' },
        { ...baseProposal.items[1]!, decision: 'override-shipped' },
      ],
    };
    const { runGh } = stubRunGh({ labelExists: true });
    const result = applyV2({ proposal: overridden, runGh });
    expect(result.applied.length).toBe(2);
  });

  it('records gh failures as failed items but keeps applying the rest', () => {
    // Pre-flight runs at index 0; first per-item comment runs at index 1.
    const { runGh } = stubRunGh({
      labelExists: true,
      failAtCallIndex: 1,
      failError: 'gh: rate limit',
    });
    const result = applyV2({ proposal: baseProposal, runGh });
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.error).toContain('rate limit');
  });

  // --- Phase 16 pre-flight cases ---

  it('pre-flight: label exists → single gh label list call, no label create', () => {
    const { runGh, calls } = stubRunGh({ labelExists: true });
    // baseProposal has one shipped item (#361) — pre-flight runs because
    // there's actual per-item dispatch downstream.
    const result = applyV2({ proposal: baseProposal, runGh });
    expect(result.applied.length).toBe(1);
    const labelListCalls = calls.filter((c) => c[0] === 'label' && c[1] === 'list');
    const labelCreateCalls = calls.filter((c) => c[0] === 'label' && c[1] === 'create');
    expect(labelListCalls.length).toBe(1);
    expect(labelCreateCalls.length).toBe(0);
    expect(result.notes).toEqual([]);
  });

  it('pre-flight: label absent → label create runs, "created" note surfaces in result', () => {
    const { runGh, calls } = stubRunGh({ labelExists: false });
    // baseProposal has one shipped item — pre-flight runs because actual
    // dispatch will follow.
    const result = applyV2({ proposal: baseProposal, runGh });
    const labelListCalls = calls.filter((c) => c[0] === 'label' && c[1] === 'list');
    const labelCreateCalls = calls.filter((c) => c[0] === 'label' && c[1] === 'create');
    expect(labelListCalls.length).toBe(1);
    expect(labelCreateCalls.length).toBe(1);
    expect(labelCreateCalls[0]).toContain('--color');
    expect(labelCreateCalls[0]).toContain('--description');
    expect(result.notes.length).toBe(1);
    expect(result.notes[0]).toContain('created');
    expect(result.notes[0]).toContain('pending-verification');
    expect(result.notes[0]).toContain('owner/repo');
  });

  it('pre-flight: gh label create throws → InvalidProposalError with actionable message', () => {
    const { runGh } = stubRunGh({
      labelExists: false,
      labelCreateThrows: 'gh: permission denied',
    });
    expect(() => applyV2({ proposal: baseProposal, runGh })).toThrow(
      InvalidProposalError,
    );
    try {
      applyV2({ proposal: baseProposal, runGh });
    } catch (err) {
      expect((err as Error).message).toContain('permission denied');
      expect((err as Error).message).toContain('pending-verification');
      expect((err as Error).message).toContain('gh label create');
    }
  });

  it('pre-flight: skips label list + create when every item is effective-skip (AUDIT-20260604-01)', () => {
    // Cross-model finding: when all items resolve to effective-skip, the
    // apply call has no per-item dispatch and therefore should not touch
    // the repo at all. Creating a label preemptively is an unwanted
    // side-effect when nothing was actually shipped.
    const { runGh, calls } = stubRunGh({ labelExists: false });
    const skipOnly: Proposal = {
      ...baseProposal,
      items: baseProposal.items.map((i) => ({ ...i, decision: 'skip' as const })),
    };
    const result = applyV2({ proposal: skipOnly, runGh });
    const labelListCalls = calls.filter((c) => c[0] === 'label' && c[1] === 'list');
    const labelCreateCalls = calls.filter((c) => c[0] === 'label' && c[1] === 'create');
    expect(labelListCalls.length).toBe(0);
    expect(labelCreateCalls.length).toBe(0);
    expect(result.applied.length).toBe(0);
    expect(result.notes).toEqual([]);
  });

  it('pre-flight: aborts BEFORE the per-item loop when label create fails', () => {
    // The classic half-applied state: comment posted, label add fails.
    // Pre-flight prevents this by aborting before any comment posts.
    const { runGh, calls } = stubRunGh({
      labelExists: false,
      labelCreateThrows: 'gh: rate limit',
    });
    expect(() => applyV2({ proposal: baseProposal, runGh })).toThrow(
      InvalidProposalError,
    );
    const commentCalls = calls.filter((c) => c[1] === 'comment');
    expect(commentCalls.length).toBe(0);
  });
});
