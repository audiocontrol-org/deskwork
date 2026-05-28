import { describe, it, expect } from 'vitest';
import {
  backfillWorkplanPhaseHeadings,
  backfillReadmeStatusTable,
  backfillReadmeKeyLinksParent,
  type PhaseIssueLink,
} from '../subcommands/issues-backfill-prose.js';

const PHASE_LINKS: PhaseIssueLink[] = [
  {
    name: 'Phase 1: Prior-art research',
    number: 302,
    url: 'https://github.com/audiocontrol-org/deskwork/issues/302',
  },
  {
    name: 'Phase 2: Pipeline template loader',
    number: 303,
    url: 'https://github.com/audiocontrol-org/deskwork/issues/303',
  },
  {
    name: 'Phase 3: Lane data model',
    number: 304,
    url: 'https://github.com/audiocontrol-org/deskwork/issues/304',
  },
];

describe('backfillWorkplanPhaseHeadings', () => {
  it('appends issue links to each Phase heading', () => {
    const input = [
      '# Workplan: Test',
      '',
      '## Phase 1: Prior-art research',
      '',
      'Body.',
      '',
      '## Phase 2: Pipeline template loader',
      '',
      'Body.',
      '',
      '## Phase 3: Lane data model',
      '',
      'Body.',
      '',
    ].join('\n');

    const out = backfillWorkplanPhaseHeadings(input, PHASE_LINKS);

    expect(out).toContain(
      '## Phase 1: Prior-art research  ·  [#302](https://github.com/audiocontrol-org/deskwork/issues/302)',
    );
    expect(out).toContain(
      '## Phase 2: Pipeline template loader  ·  [#303](https://github.com/audiocontrol-org/deskwork/issues/303)',
    );
    expect(out).toContain(
      '## Phase 3: Lane data model  ·  [#304](https://github.com/audiocontrol-org/deskwork/issues/304)',
    );
    // Body content untouched.
    expect(out.match(/^Body\.$/gm)?.length).toBe(3);
  });

  it('is idempotent — re-running replaces existing link rather than double-appending', () => {
    const input = [
      '## Phase 1: Prior-art research  ·  [#999](https://github.com/old/repo/issues/999)',
      '',
      '## Phase 2: Pipeline template loader',
      '',
      '## Phase 3: Lane data model  ·  [#888](https://github.com/old/repo/issues/888)',
    ].join('\n');

    const out = backfillWorkplanPhaseHeadings(input, PHASE_LINKS);

    expect(out).toContain('[#302]');
    expect(out).not.toContain('#999');
    expect(out).not.toContain('#888');
    // No double-append — at most one ` · [#NNN]` per phase line.
    const phase1Lines = out.split('\n').filter((l) => l.startsWith('## Phase 1:'));
    expect(phase1Lines).toHaveLength(1);
    expect((phase1Lines[0]?.match(/\[#\d+\]/g) ?? []).length).toBe(1);
  });

  it('returns input unchanged when phases is empty', () => {
    const input = '## Phase 1: Foo\n## Phase 2: Bar\n';
    expect(backfillWorkplanPhaseHeadings(input, [])).toBe(input);
  });

  it('stops applying when more phase headings exist than created issues', () => {
    const input = [
      '## Phase 1: First',
      '## Phase 2: Second',
      '## Phase 3: Third',
      '## Phase 4: Extra',
    ].join('\n');

    const out = backfillWorkplanPhaseHeadings(input, PHASE_LINKS);
    expect(out).toContain('## Phase 1: First  ·  [#302]');
    expect(out).toContain('## Phase 2: Second  ·  [#303]');
    expect(out).toContain('## Phase 3: Third  ·  [#304]');
    // Phase 4 untouched — no extra issue exists.
    expect(out).toContain('## Phase 4: Extra');
    expect(out).not.toMatch(/Phase 4: Extra\s+·/);
  });

  it('does not touch the Closing milestone heading', () => {
    const input = [
      '## Phase 1: First',
      '## Closing milestone: wrap up',
    ].join('\n');
    const out = backfillWorkplanPhaseHeadings(input, [PHASE_LINKS[0]!]);
    expect(out).toContain('## Phase 1: First  ·  [#302]');
    expect(out).toContain('## Closing milestone: wrap up');
    expect(out).not.toMatch(/Closing milestone.*·/);
  });
});

describe('backfillReadmeStatusTable', () => {
  const WORKPLAN_PHASES = [
    { name: 'Phase 1: Prior-art research' },
    { name: 'Phase 2: Pipeline template loader' },
    { name: 'Phase 3: Lane data model' },
  ];

  it('replaces the 3-column template placeholder with a 4-column issue-augmented table', () => {
    const input = [
      '# Feature: Test',
      '',
      '## Status',
      '',
      '| Phase | Description | Status |',
      '|---|---|---|',
      '| 1 | [Phase 1 name] | Not started |',
      '',
      '## Key Links',
    ].join('\n');

    const out = backfillReadmeStatusTable(input, PHASE_LINKS, WORKPLAN_PHASES);

    expect(out).toContain('| Phase | Description | Issue | Status |');
    expect(out).toContain('|---|---|---|---|');
    expect(out).toContain(
      '| 1 | Prior-art research | [#302](https://github.com/audiocontrol-org/deskwork/issues/302) | Not started |',
    );
    expect(out).toContain(
      '| 2 | Pipeline template loader | [#303](https://github.com/audiocontrol-org/deskwork/issues/303) | Not started |',
    );
    expect(out).toContain(
      '| 3 | Lane data model | [#304](https://github.com/audiocontrol-org/deskwork/issues/304) | Not started |',
    );
    // The placeholder row is gone.
    expect(out).not.toContain('[Phase 1 name]');
    // Surrounding sections preserved.
    expect(out).toContain('## Key Links');
  });

  it('preserves an operator-rewritten table; only fills the Issue column for matching phase rows', () => {
    const input = [
      '## Status',
      '',
      '| Phase | Description | Issue | Status |',
      '|---|---|---|---|',
      '| 1 | Custom phase 1 desc | TBD | In progress — Task 1.1 done |',
      '| 2 | Custom phase 2 desc | TBD | Not started |',
      '| 3 | Custom phase 3 desc | TBD | Not started |',
      '| Closing | Final cleanup | — | Not started |',
      '',
    ].join('\n');

    const out = backfillReadmeStatusTable(input, PHASE_LINKS, WORKPLAN_PHASES);

    // Operator-written Description + Status preserved verbatim.
    expect(out).toContain('Custom phase 1 desc');
    expect(out).toContain('In progress — Task 1.1 done');
    expect(out).toContain('Custom phase 2 desc');
    expect(out).toContain('Custom phase 3 desc');
    // Issue column back-filled.
    expect(out).toContain('[#302](https://github.com/audiocontrol-org/deskwork/issues/302)');
    expect(out).toContain('[#303](https://github.com/audiocontrol-org/deskwork/issues/303)');
    expect(out).toContain('[#304](https://github.com/audiocontrol-org/deskwork/issues/304)');
    expect(out).not.toMatch(/\|\s*TBD\s*\|/);
    // Closing row left untouched — no matching phase number.
    expect(out).toContain('Closing | Final cleanup | — |');
  });

  it('is idempotent — re-running on a fully back-filled operator table is a no-op modulo whitespace', () => {
    const stage1Input = [
      '## Status',
      '',
      '| Phase | Description | Status |',
      '|---|---|---|',
      '| 1 | [Phase 1 name] | Not started |',
      '',
    ].join('\n');
    const afterFirst = backfillReadmeStatusTable(stage1Input, PHASE_LINKS, WORKPLAN_PHASES);
    const afterSecond = backfillReadmeStatusTable(afterFirst, PHASE_LINKS, WORKPLAN_PHASES);
    expect(afterSecond).toBe(afterFirst);
  });

  it('returns input unchanged when no Status section exists', () => {
    const input = '# Feature: Test\n\nDescription only.\n';
    expect(backfillReadmeStatusTable(input, PHASE_LINKS, WORKPLAN_PHASES)).toBe(input);
  });

  it('skips back-fill when operator table has no Issue column', () => {
    const input = [
      '## Status',
      '',
      '| Phase | Description | Status |',
      '|---|---|---|',
      '| 1 | Custom row | In progress |',
      '',
    ].join('\n');
    // No '[Phase N name]' placeholder text → not the template shape.
    // No Issue column → leave alone.
    expect(backfillReadmeStatusTable(input, PHASE_LINKS, WORKPLAN_PHASES)).toBe(input);
  });
});

describe('backfillReadmeKeyLinksParent', () => {
  const PARENT = {
    number: 301,
    url: 'https://github.com/audiocontrol-org/deskwork/issues/301',
  };

  it('fills an empty Parent Issue bullet', () => {
    const input = [
      '## Key Links',
      '',
      '- Branch: `feature/test`',
      '- PRD: `prd.md`',
      '- Parent Issue:',
      '- Workplan: `workplan.md`',
    ].join('\n');
    const out = backfillReadmeKeyLinksParent(input, PARENT);
    expect(out).toContain(
      '- Parent Issue: [#301](https://github.com/audiocontrol-org/deskwork/issues/301)',
    );
    // Other bullets preserved.
    expect(out).toContain('- Branch: `feature/test`');
    expect(out).toContain('- Workplan: `workplan.md`');
  });

  it('fills the templated <parentIssue> form', () => {
    const input = [
      '## Key Links',
      '',
      '- Parent Issue: <parentIssue>',
    ].join('\n');
    const out = backfillReadmeKeyLinksParent(input, PARENT);
    expect(out).toContain('- Parent Issue: [#301]');
    expect(out).not.toContain('<parentIssue>');
  });

  it('is idempotent — replaces an existing link rather than duplicating', () => {
    const input = [
      '## Key Links',
      '',
      '- Parent Issue: [#999](https://github.com/old/repo/issues/999)',
    ].join('\n');
    const out = backfillReadmeKeyLinksParent(input, PARENT);
    expect(out).toContain('[#301]');
    expect(out).not.toContain('#999');
    expect((out.match(/Parent Issue:/g) ?? []).length).toBe(1);
  });

  it('returns input unchanged when no Key Links section exists', () => {
    const input = '## Status\n\nNothing here.\n';
    expect(backfillReadmeKeyLinksParent(input, PARENT)).toBe(input);
  });

  it('does not cross into a sibling section that has a Parent Issue mention', () => {
    const input = [
      '## Key Links',
      '',
      '- Branch: `feature/test`',
      '',
      '## Notes',
      '',
      '- Parent Issue: somewhere else',
    ].join('\n');
    const out = backfillReadmeKeyLinksParent(input, PARENT);
    // Key Links had no Parent Issue bullet → input unchanged.
    expect(out).toBe(input);
  });
});
