/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/llm/judge.test.ts
 *
 * Internal LLM-judge — Phase 11 Task 7.
 *
 * The actual LLM network call is OUT OF SCOPE; tests mock the
 * dispatch function at the wrap() boundary so the wrapper's grammar
 * enforcement + parsing pipeline get exercised against canned
 * sub-agent responses.
 */

import { describe, it, expect } from 'vitest';
import {
  JudgeParseError,
  parseJudgeProposals,
  runInternalJudge,
} from '../../../scope-discovery/llm/judge.js';
import { DEFAULT_LLM_CONFIG } from '../../../scope-discovery/llm/config.js';
import type { DispatchFn } from '../../../scope-discovery/dispatch-wrapper.js';
import { DispatchRejected } from '../../../scope-discovery/dispatch-wrapper.js';
import type {
  CatalogStateSummary,
  JudgeInput,
  OpenCandidate,
} from '../../../scope-discovery/llm/types.js';

function emptyCatalogState(): CatalogStateSummary {
  return {
    statusCounts: {
      pending: 0,
      blessed: 0,
      cursed: 0,
      ignore: 0,
      'tracked-holdout': 0,
      withdrawn: 0,
    },
    totalEntries: 0,
  };
}

function judgeInputWith(
  candidates: ReadonlyArray<OpenCandidate>,
): JudgeInput {
  return {
    featureSlug: 'scope-discovery',
    recentWork: {},
    openCandidates: candidates,
    catalogState: emptyCatalogState(),
  };
}

/**
 * Build a canned judge sub-agent response with PROPOSAL blocks +
 * trailing dispatch-grammar block. The wrap() function requires the
 * grammar block; this helper bakes it in.
 */
function judgeResponse(args: {
  proposals: ReadonlyArray<{
    candidateId: string;
    status: string;
    confidence: string;
    reasoning: string;
  }>;
}): string {
  const proposalBlocks = args.proposals
    .map(
      (p) =>
        `PROPOSAL: ${p.candidateId}\n` +
        `  status: ${p.status}\n` +
        `  confidence: ${p.confidence}\n` +
        `  reasoning: ${p.reasoning}`,
    )
    .join('\n\n');
  // Match Searched count to Included line count to satisfy
  // dispatch-grammar Rule 1 ("multi-match search + single inclusion +
  // empty exclusion = skipped audit").
  const included = args.proposals
    .map((p, i) => `scope-manifest.yaml:${i + 1}`)
    .join(', ');
  return [
    proposalBlocks,
    ``,
    `Searched: candidates — ${args.proposals.length} matches`,
    `Included: ${included.length === 0 ? 'scope-manifest.yaml:1' : included}`,
    `Excluded: `,
  ].join('\n');
}

describe('parseJudgeProposals', () => {
  it('extracts a single proposal block', () => {
    const narrative = judgeResponse({
      proposals: [
        {
          candidateId: 'foo-1',
          status: 'blessed',
          confidence: '0.85',
          reasoning: 'file matches the canonical primitive at src/foo.ts:42',
        },
      ],
    });
    const proposals = parseJudgeProposals(narrative);
    expect(proposals.length).toBe(1);
    expect(proposals[0]?.candidateId).toBe('foo-1');
    expect(proposals[0]?.proposedStatus).toBe('blessed');
    expect(proposals[0]?.confidence).toBeCloseTo(0.85, 5);
    expect(proposals[0]?.reasoning).toMatch(/src\/foo\.ts:42/);
  });

  it('ranks multiple proposals by descending confidence', () => {
    const narrative = judgeResponse({
      proposals: [
        {
          candidateId: 'low',
          status: 'ignore',
          confidence: '0.30',
          reasoning: 'evidence is thin',
        },
        {
          candidateId: 'high',
          status: 'cursed',
          confidence: '0.95',
          reasoning: 'clear regression at src/bar.ts:7',
        },
        {
          candidateId: 'mid',
          status: 'blessed',
          confidence: '0.60',
          reasoning: 'plausible but not conclusive',
        },
      ],
    });
    const proposals = parseJudgeProposals(narrative);
    expect(proposals.map((p) => p.candidateId)).toEqual(['high', 'mid', 'low']);
  });

  it('rejects out-of-range confidence (no clamping)', () => {
    const narrative = judgeResponse({
      proposals: [
        {
          candidateId: 'oob',
          status: 'blessed',
          confidence: '1.4',
          reasoning: 'r',
        },
      ],
    });
    expect(() => parseJudgeProposals(narrative)).toThrow(JudgeParseError);
  });

  it('rejects an unknown status literal', () => {
    const narrative = judgeResponse({
      proposals: [
        {
          candidateId: 'badstatus',
          status: 'maybe',
          confidence: '0.5',
          reasoning: 'r',
        },
      ],
    });
    expect(() => parseJudgeProposals(narrative)).toThrow(JudgeParseError);
  });

  it('rejects a proposal missing reasoning', () => {
    const narrative = [
      `PROPOSAL: no-reasoning`,
      `  status: blessed`,
      `  confidence: 0.5`,
      ``,
      `Searched: x — 0 matches`,
      `Included: x:1`,
      `Excluded: `,
    ].join('\n');
    expect(() => parseJudgeProposals(narrative)).toThrow(/missing required `reasoning:`/);
  });

  it('returns empty array when narrative has no PROPOSAL blocks', () => {
    const narrative = [
      `Some preamble without proposals.`,
      ``,
      `Searched: x — 0 matches`,
      `Included: a:1`,
      `Excluded: `,
    ].join('\n');
    expect(parseJudgeProposals(narrative)).toEqual([]);
  });

  it('folds multi-line reasoning into a single string', () => {
    const narrative = [
      `PROPOSAL: multi`,
      `  status: blessed`,
      `  confidence: 0.7`,
      `  reasoning: first sentence.`,
      `  second sentence continues here.`,
      `  third sentence too.`,
      ``,
      `Searched: x — 1 matches`,
      `Included: a:1`,
      `Excluded: `,
    ].join('\n');
    const proposals = parseJudgeProposals(narrative);
    expect(proposals.length).toBe(1);
    expect(proposals[0]?.reasoning).toContain('first sentence');
    expect(proposals[0]?.reasoning).toContain('second sentence');
    expect(proposals[0]?.reasoning).toContain('third sentence');
  });
});

describe('runInternalJudge', () => {
  it('dispatches through wrap() + returns ranked proposals', async () => {
    const dispatchFn: DispatchFn = async () =>
      judgeResponse({
        proposals: [
          {
            candidateId: 'cand-1',
            status: 'cursed',
            confidence: '0.92',
            reasoning: 'evidence in src/foo.ts:14 + src/bar.ts:7 shows the regression',
          },
        ],
      });
    const result = await runInternalJudge(
      judgeInputWith([
        {
          id: 'cand-1',
          description: 'editor without canonical primitive',
          currentStatus: 'pending',
          evidence: ['src/foo.ts:14', 'src/bar.ts:7'],
        },
      ]),
      {
        dispatchFn,
        repoRoot: '/tmp/unused-in-this-test',
        configOverride: DEFAULT_LLM_CONFIG,
      },
    );
    expect(result.model).toBe(DEFAULT_LLM_CONFIG.judge.model);
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0]?.candidateId).toBe('cand-1');
    expect(result.proposals[0]?.confidence).toBeCloseTo(0.92, 5);
  });

  it('honors a modelOverride on the JudgeInput', async () => {
    const dispatchFn: DispatchFn = async () =>
      judgeResponse({
        proposals: [
          {
            candidateId: 'x',
            status: 'blessed',
            confidence: '0.5',
            reasoning: 'r at src/x.ts:1',
          },
        ],
      });
    const result = await runInternalJudge(
      { ...judgeInputWith([]), modelOverride: 'mock-model-7' },
      {
        dispatchFn,
        repoRoot: '/tmp/unused',
        configOverride: DEFAULT_LLM_CONFIG,
      },
    );
    expect(result.model).toBe('mock-model-7');
  });

  it('propagates DispatchRejected when the judge response violates grammar', async () => {
    // No grammar block at all — wrap() rejects.
    const dispatchFn: DispatchFn = async () =>
      [
        `PROPOSAL: foo`,
        `  status: blessed`,
        `  confidence: 0.5`,
        `  reasoning: r at src/x.ts:1`,
      ].join('\n');
    await expect(
      runInternalJudge(judgeInputWith([]), {
        dispatchFn,
        repoRoot: '/tmp/unused',
        configOverride: DEFAULT_LLM_CONFIG,
      }),
    ).rejects.toBeInstanceOf(DispatchRejected);
  });

  it('rejects forbidden-deferral phrases in the judge narrative via wrap()', async () => {
    // The Excluded reason contains "fix it later" — explicitly listed
    // in the dispatch-grammar FORBIDDEN_DEFERRAL_REGEXES.
    const dispatchFn: DispatchFn = async () =>
      [
        `PROPOSAL: foo`,
        `  status: blessed`,
        `  confidence: 0.5`,
        `  reasoning: r at src/x.ts:1`,
        ``,
        `Searched: x — 5 matches`,
        `Included: a:1`,
        `Excluded: b:2 — will fix it later`,
      ].join('\n');
    await expect(
      runInternalJudge(judgeInputWith([]), {
        dispatchFn,
        repoRoot: '/tmp/unused',
        configOverride: DEFAULT_LLM_CONFIG,
      }),
    ).rejects.toBeInstanceOf(DispatchRejected);
  });
});
