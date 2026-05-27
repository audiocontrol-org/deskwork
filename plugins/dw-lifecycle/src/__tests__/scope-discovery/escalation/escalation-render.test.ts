/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/escalation/escalation-render.test.ts
 *
 * Phase 11 Task 9 — Markdown renderer tests.
 *
 * Verifies that the renderer:
 *   - Produces operator-readable sections for each part of an
 *     EscalationRequest.
 *   - Surfaces a RESOLVED banner when the escalation has been resolved.
 *   - Embeds sentinel comments so the orchestrator can read back the
 *     operator's decision (via `extractOperatorDecision`).
 *   - The option-id matcher recognizes the operator's plain-prose
 *     mention of an option id without confusing it with substrings.
 */

import { describe, expect, it } from 'vitest';
import {
  extractOperatorDecision,
  matchOperatorOptionId,
  renderEscalationMarkdown,
} from '../../../scope-discovery/escalation/escalation-render.js';
import type {
  EscalationOption,
  EscalationRequest,
} from '../../../scope-discovery/escalation/escalation-types.js';

const sampleOptions: ReadonlyArray<EscalationOption> = [
  {
    id: 'cursed-blanket',
    summary: 'Apply cursed status across the negative-space class.',
    detail: 'Treats all 4 candidates as the same pattern; aggressive.',
  },
  {
    id: 'cursed-narrow',
    summary: 'Apply cursed only to the audiocontrol-specific case.',
  },
  {
    id: 'defer',
    summary: 'Hold the dispositions in pending; collect more evidence.',
  },
];

function makeRequest(
  overrides: Partial<EscalationRequest> = {},
): EscalationRequest {
  return {
    version: 1,
    id: '20260526120000-abc123',
    queuedAt: '2026-05-26T12:00:00Z',
    actionProposed:
      'Set status=cursed on negative-space-12 across the catalog.',
    evidence: {
      summary:
        '3 of 4 negative-space findings overturned by auditor this week.',
      links: [
        'docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md',
        'https://github.com/audiocontrol-org/deskwork/issues/315',
      ],
      excerpts: [
        'AUDIT-2026-05-25-01: disagreed with disposition on cand-7',
      ],
    },
    reasoning:
      'Auditor disagreement rate on this pattern class has exceeded the controller threshold.',
    question:
      'Should this become a blanket-cursed pattern, or is audiocontrol the only valid hit?',
    options: sampleOptions,
    resolution: null,
    ...overrides,
  };
}

describe('renderEscalationMarkdown — unresolved', () => {
  it('emits a heading with the id + queued-at', () => {
    const md = renderEscalationMarkdown(makeRequest());
    expect(md).toMatch(/^# Escalation 20260526120000-abc123\n/);
    expect(md).toContain('Queued at: 2026-05-26T12:00:00Z');
  });

  it('renders Action proposed / Question / Reasoning sections', () => {
    const md = renderEscalationMarkdown(makeRequest());
    expect(md).toContain('## Action proposed');
    expect(md).toContain(
      'Set status=cursed on negative-space-12 across the catalog.',
    );
    expect(md).toContain('## Question');
    expect(md).toContain('blanket-cursed pattern');
    expect(md).toContain('## Reasoning');
    expect(md).toContain('Auditor disagreement rate');
  });

  it('renders Evidence with links and excerpts', () => {
    const md = renderEscalationMarkdown(makeRequest());
    expect(md).toContain('## Evidence');
    expect(md).toContain(
      '- docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md',
    );
    expect(md).toContain(
      '- https://github.com/audiocontrol-org/deskwork/issues/315',
    );
    expect(md).toContain('```\nAUDIT-2026-05-25-01');
  });

  it('renders Options with id badges + details', () => {
    const md = renderEscalationMarkdown(makeRequest());
    expect(md).toContain('## Options');
    expect(md).toContain(
      '- `cursed-blanket` — Apply cursed status across the negative-space class.',
    );
    expect(md).toContain(
      '  Treats all 4 candidates as the same pattern; aggressive.',
    );
    expect(md).toContain(
      '- `cursed-narrow` — Apply cursed only to the audiocontrol-specific case.',
    );
    expect(md).toContain('- `defer` — Hold the dispositions in pending;');
  });

  it('renders an Operator decision footer with sentinel comments', () => {
    const md = renderEscalationMarkdown(makeRequest());
    expect(md).toContain('## Operator decision');
    expect(md).toContain('<!-- BEGIN OPERATOR DECISION -->');
    expect(md).toContain('<!-- END OPERATOR DECISION -->');
    expect(md).toContain('(write your decision here)');
  });

  it('lists all option ids in the footer guidance', () => {
    const md = renderEscalationMarkdown(makeRequest());
    // The footer prose mentions each option id in backticks.
    for (const id of ['cursed-blanket', 'cursed-narrow', 'defer']) {
      expect(md).toContain(`\`${id}\``);
    }
  });

  it('handles options without a detail field', () => {
    const md = renderEscalationMarkdown(
      makeRequest({
        options: [{ id: 'only-one', summary: 'just one option, no detail' }],
      }),
    );
    expect(md).toContain('- `only-one` — just one option, no detail');
    // No bullet should be emitted for an absent detail.
    expect(md).not.toMatch(/^  $/m);
  });
});

describe('renderEscalationMarkdown — resolved', () => {
  it('emits a RESOLVED banner with the selected option id', () => {
    const md = renderEscalationMarkdown(
      makeRequest({
        resolution: {
          resolvedAt: '2026-05-26T14:00:00Z',
          selectedOptionId: 'cursed-narrow',
          decisionTaken: 'go with cursed-narrow',
        },
      }),
    );
    expect(md).toMatch(
      /> RESOLVED at 2026-05-26T14:00:00Z — option `cursed-narrow`/,
    );
    expect(md).toContain('> Decision taken: go with cursed-narrow');
  });

  it('emits a free-form banner when no option id was selected', () => {
    const md = renderEscalationMarkdown(
      makeRequest({
        resolution: {
          resolvedAt: '2026-05-26T14:00:00Z',
          selectedOptionId: null,
          decisionTaken: 'widen the catalog first',
        },
      }),
    );
    expect(md).toContain('> RESOLVED');
    expect(md).toContain('(free-form decision)');
    expect(md).toContain('> Decision taken: widen the catalog first');
  });

  it('replaces the decision footer with an "already resolved" notice', () => {
    const md = renderEscalationMarkdown(
      makeRequest({
        resolution: {
          resolvedAt: '2026-05-26T14:00:00Z',
          selectedOptionId: 'defer',
          decisionTaken: 'defer',
        },
      }),
    );
    expect(md).toContain('_Already resolved — see the RESOLVED banner above._');
    expect(md).not.toContain('<!-- BEGIN OPERATOR DECISION -->');
  });
});

describe('extractOperatorDecision', () => {
  it('reads back the body between the sentinel comments', () => {
    const md = [
      '## Operator decision',
      '',
      '<!-- BEGIN OPERATOR DECISION -->',
      '',
      'go with cursed-narrow; the audiocontrol case is the only valid hit',
      '',
      '<!-- END OPERATOR DECISION -->',
    ].join('\n');
    expect(extractOperatorDecision(md)).toBe(
      'go with cursed-narrow; the audiocontrol case is the only valid hit',
    );
  });

  it('returns null when the sentinels are missing', () => {
    expect(extractOperatorDecision('## Heading\n\nbody')).toBeNull();
  });

  it('returns null when the body is the placeholder', () => {
    const md = renderEscalationMarkdown(makeRequest());
    expect(extractOperatorDecision(md)).toBeNull();
  });

  it('returns null when the body is whitespace-only', () => {
    const md = [
      '<!-- BEGIN OPERATOR DECISION -->',
      '   ',
      '',
      '<!-- END OPERATOR DECISION -->',
    ].join('\n');
    expect(extractOperatorDecision(md)).toBeNull();
  });

  it('returns null when END appears before BEGIN', () => {
    const md = [
      '<!-- END OPERATOR DECISION -->',
      'body',
      '<!-- BEGIN OPERATOR DECISION -->',
    ].join('\n');
    expect(extractOperatorDecision(md)).toBeNull();
  });
});

describe('matchOperatorOptionId', () => {
  const optionIds: ReadonlyArray<string> = [
    'cursed-blanket',
    'cursed-narrow',
    'defer',
  ];

  it('matches a verbatim option id mention', () => {
    expect(matchOperatorOptionId('go with cursed-narrow', optionIds)).toBe(
      'cursed-narrow',
    );
  });

  it('matches when the option id appears at the start of a line', () => {
    expect(
      matchOperatorOptionId('defer — collect more evidence first', optionIds),
    ).toBe('defer');
  });

  it('does NOT match a substring of a longer word', () => {
    // 'deferment' contains 'defer' but should not match since the token
    // is not at a word boundary.
    expect(
      matchOperatorOptionId(
        'we agreed on deferment for now without further discussion',
        optionIds,
      ),
    ).toBeNull();
  });

  it('returns null when no option id is present', () => {
    expect(
      matchOperatorOptionId('widen the catalog before deciding', optionIds),
    ).toBeNull();
  });

  it('prefers the first listed option when multiple match', () => {
    // cursed-blanket is listed first; both ids appear in the decision.
    expect(
      matchOperatorOptionId(
        'cursed-blanket beats cursed-narrow here',
        optionIds,
      ),
    ).toBe('cursed-blanket');
  });

  it('handles option ids with regex special characters literally', () => {
    expect(
      matchOperatorOptionId('go with opt.1 today', ['opt.1', 'opt.2']),
    ).toBe('opt.1');
  });
});
