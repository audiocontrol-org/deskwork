import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  apply,
  InvalidProposalFileError,
  parseApproval,
} from '../lifecycle-integration/parent-closure/apply.js';
import type {
  ProposalFile,
  ProposalItem,
} from '../lifecycle-integration/parent-closure/types.js';

interface Fixture {
  root: string;
  proposalPath: string;
}

function setup(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-parent-closure-apply-'));
  return { root, proposalPath: join(root, 'p.json') };
}

function baseItem(overrides: Partial<ProposalItem> = {}): ProposalItem {
  return {
    number: 1,
    title: 'parent',
    url: 'u',
    state: 'OPEN',
    child_issues: [],
    classification: 'close-all-children-closed',
    disposition: null,
    closure_comment: null,
    applied: null,
    apply_error: null,
    result: null,
    ...overrides,
  };
}

function baseFile(items: ProposalItem[], approval: string | null = 'y'): ProposalFile {
  return {
    generated_at: '2026-05-28T00:00:00.000Z',
    feature_slug: 'hygiene',
    parent_issue: 1,
    feature_complete_sha: 'sha',
    repo: 'o/r',
    approval,
    items,
  };
}

describe('parseApproval', () => {
  it('returns kind=all for y/yes', () => {
    expect(parseApproval('y', 3).kind).toBe('all');
    expect(parseApproval('Yes', 3).kind).toBe('all');
  });
  it('returns kind=none for n/no', () => {
    expect(parseApproval('n', 3).kind).toBe('none');
    expect(parseApproval('No', 3).kind).toBe('none');
  });
  it('parses subset indexes', () => {
    const token = parseApproval('1,3', 5);
    expect(token.kind).toBe('subset');
    if (token.kind === 'subset') expect(token.indexes).toEqual([1, 3]);
  });
  it('throws on null', () => {
    expect(() => parseApproval(null, 1)).toThrow(/approval field is null/);
  });
  it('throws on out-of-range', () => {
    expect(() => parseApproval('99', 3)).toThrow(/out of range/);
  });
});

describe('apply -- happy path', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = setup();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('dispatches `gh issue close` per approved close-all-children-closed row', () => {
    const file = baseFile([
      baseItem({
        number: 323,
        disposition: 'close-all-children-closed',
        closure_comment: 'Closing as feature-complete.',
        child_issues: [
          { number: 324, state: 'CLOSED', title: 'phase 0' },
          { number: 325, state: 'CLOSED', title: 'phase 1' },
        ],
      }),
    ]);
    writeFileSync(fx.proposalPath, JSON.stringify(file, null, 2));
    const calls: string[][] = [];
    const runGh = (args: readonly string[]): string => {
      calls.push([...args]);
      return '';
    };
    const result = apply({ proposalPath: fx.proposalPath, runGh });
    expect(result.aborted).toBe(false);
    expect(result.summary.applied).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      'issue',
      'close',
      '323',
      '--repo',
      'o/r',
      '--comment',
      'Closing as feature-complete.',
    ]);
    // Post-apply rewrite stores the outcome on disk.
    const round: ProposalFile = JSON.parse(readFileSync(fx.proposalPath, 'utf8'));
    expect(round.items[0]?.applied).toBe(true);
    expect(round.items[0]?.result).toContain('closed parent #323');
  });

  it('honors `skip` and `leave-open` dispositions without issuing gh calls', () => {
    const file = baseFile([
      baseItem({ number: 1, disposition: 'skip' }),
      baseItem({ number: 2, disposition: 'leave-open' }),
    ]);
    writeFileSync(fx.proposalPath, JSON.stringify(file, null, 2));
    const calls: string[][] = [];
    const runGh = (args: readonly string[]): string => {
      calls.push([...args]);
      return '';
    };
    const result = apply({ proposalPath: fx.proposalPath, runGh });
    expect(calls).toHaveLength(0);
    expect(result.summary.applied).toBe(0);
    expect(result.outcomes[0]?.result).toContain('skipped per operator');
    expect(result.outcomes[1]?.result).toContain('left open per operator');
  });

  it('emits a per-row warning when close-with-open-children fires with open children', () => {
    const file = baseFile([
      baseItem({
        number: 500,
        disposition: 'close-with-open-children',
        closure_comment: 'Operator-approved closure.',
        child_issues: [
          { number: 501, state: 'OPEN', title: 'still-open' },
          { number: 502, state: 'CLOSED', title: 'done' },
        ],
      }),
    ]);
    writeFileSync(fx.proposalPath, JSON.stringify(file, null, 2));
    const warnings: string[] = [];
    apply({
      proposalPath: fx.proposalPath,
      runGh: () => '',
      warn: (line) => warnings.push(line),
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('#501');
    expect(warnings[0]).toContain('open');
  });
});

describe('apply -- pre-validation gate', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = setup();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('exits via InvalidProposalFileError when an approved close-* row has empty closure_comment, NO gh calls', () => {
    const file = baseFile([
      baseItem({
        number: 1,
        disposition: 'close-all-children-closed',
        closure_comment: '',
      }),
    ]);
    writeFileSync(fx.proposalPath, JSON.stringify(file, null, 2));
    let ghCalls = 0;
    const runGh = (): string => {
      ghCalls += 1;
      return '';
    };
    expect(() =>
      apply({ proposalPath: fx.proposalPath, runGh }),
    ).toThrow(InvalidProposalFileError);
    expect(ghCalls).toBe(0);
  });

  it('exits via InvalidProposalFileError for unknown disposition values', () => {
    const file = baseFile([
      // Cast through unknown so we can stuff an invalid disposition value
      // into the on-disk fixture without bypassing TypeScript at the
      // call site.
      {
        ...baseItem({ number: 1 }),
        disposition: 'banana' as unknown as ProposalItem['disposition'],
      },
    ]);
    writeFileSync(fx.proposalPath, JSON.stringify(file, null, 2));
    let ghCalls = 0;
    expect(() =>
      apply({
        proposalPath: fx.proposalPath,
        runGh: () => {
          ghCalls += 1;
          return '';
        },
      }),
    ).toThrow(/unknown disposition/i);
    expect(ghCalls).toBe(0);
  });

  it('exits via InvalidProposalFileError on a structurally invalid file', () => {
    writeFileSync(fx.proposalPath, '{ this is not json');
    expect(() =>
      apply({ proposalPath: fx.proposalPath, runGh: () => '' }),
    ).toThrow(InvalidProposalFileError);
  });
});

describe('apply -- partial success', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = setup();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('records per-row apply_error when one gh close fails and the others succeed', () => {
    const file = baseFile([
      baseItem({
        number: 1,
        disposition: 'close-all-children-closed',
        closure_comment: 'c1',
      }),
      baseItem({
        number: 2,
        disposition: 'close-all-children-closed',
        closure_comment: 'c2',
      }),
      baseItem({
        number: 3,
        disposition: 'close-all-children-closed',
        closure_comment: 'c3',
      }),
    ]);
    writeFileSync(fx.proposalPath, JSON.stringify(file, null, 2));
    let calls = 0;
    const runGh = (): string => {
      calls += 1;
      if (calls === 2) throw new Error('gh: rate limit exceeded');
      return '';
    };
    const result = apply({ proposalPath: fx.proposalPath, runGh });
    expect(result.summary.applied).toBe(2);
    expect(result.summary.failed).toBe(1);
    const round: ProposalFile = JSON.parse(readFileSync(fx.proposalPath, 'utf8'));
    expect(round.items[1]?.apply_error).toContain('rate limit');
  });
});

describe('apply -- abort', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = setup();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('returns aborted=true and no mutations when approval is n', () => {
    const file = baseFile(
      [
        baseItem({
          disposition: 'close-all-children-closed',
          closure_comment: 'c',
        }),
      ],
      'n',
    );
    writeFileSync(fx.proposalPath, JSON.stringify(file, null, 2));
    let ghCalls = 0;
    const result = apply({
      proposalPath: fx.proposalPath,
      runGh: () => {
        ghCalls += 1;
        return '';
      },
    });
    expect(result.aborted).toBe(true);
    expect(ghCalls).toBe(0);
  });
});
