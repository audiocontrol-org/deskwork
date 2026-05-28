import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, parseApproval, readProposalFile } from '../triage-issues/apply.js';
import type { ProposalFile, ProposalItem } from '../triage-issues/types.js';

describe('parseApproval', () => {
  it('parses y / yes as all', () => {
    expect(parseApproval('y', 5)).toEqual({ kind: 'all' });
    expect(parseApproval('Y', 5)).toEqual({ kind: 'all' });
    expect(parseApproval('yes', 5)).toEqual({ kind: 'all' });
  });

  it('parses n / no as none', () => {
    expect(parseApproval('n', 5)).toEqual({ kind: 'none' });
    expect(parseApproval('No', 5)).toEqual({ kind: 'none' });
  });

  it('parses a comma-separated 1-based subset', () => {
    expect(parseApproval('1,3,5', 5)).toEqual({
      kind: 'subset',
      indexes: [1, 3, 5],
    });
  });

  it('is whitespace-tolerant', () => {
    expect(parseApproval('  1 , 3 ,5  ', 5)).toEqual({
      kind: 'subset',
      indexes: [1, 3, 5],
    });
  });

  it('rejects null approval', () => {
    expect(() => parseApproval(null, 5)).toThrow(/approval field is null/);
  });

  it('rejects empty string', () => {
    expect(() => parseApproval('', 5)).toThrow(/empty/);
  });

  it('rejects non-integer entries', () => {
    expect(() => parseApproval('1,foo', 5)).toThrow(/non-integer entry/);
  });

  it('rejects out-of-range indexes', () => {
    expect(() => parseApproval('1,10', 5)).toThrow(/out of range/);
  });

  it('rejects zero indexes (1-based)', () => {
    expect(() => parseApproval('0', 5)).toThrow(/out of range/);
  });
});

function makeItem(overrides: Partial<ProposalItem>): ProposalItem {
  return {
    number: 1,
    title: 't',
    url: 'u',
    age_days: 1,
    comment_age_days: null,
    labels: [],
    body_excerpt: '',
    disposition: null,
    disposition_fields: null,
    applied: null,
    apply_error: null,
    result: null,
    ...overrides,
  };
}

function writeProposal(path: string, file: ProposalFile): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

describe('readProposalFile', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'apply-read-'));
  });

  it('round-trips a well-formed proposal', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: null,
      items: [makeItem({ number: 7 })],
    };
    writeProposal(path, file);
    const out = readProposalFile(path);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.number).toBe(7);
  });

  it('throws on malformed JSON', () => {
    const path = join(projectRoot, 'p.json');
    writeFileSync(path, 'not-json');
    expect(() => readProposalFile(path)).toThrow(/Could not parse/);
  });

  it('throws when required fields are missing', () => {
    const path = join(projectRoot, 'p.json');
    writeFileSync(path, JSON.stringify({ bucket: 'x' }));
    expect(() => readProposalFile(path)).toThrow(/not a valid proposal file/);
  });
});

describe('apply', () => {
  const calls: Array<readonly string[]> = [];
  let runGh: (args: readonly string[]) => string;
  let projectRoot: string;

  beforeEach(() => {
    calls.length = 0;
    runGh = (args: readonly string[]) => {
      calls.push(args);
      return '';
    };
    projectRoot = mkdtempSync(join(tmpdir(), 'apply-'));
  });

  it('aborts when approval is "n"', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'n',
      items: [
        makeItem({
          number: 1,
          disposition: 'close-wontfix',
          disposition_fields: { reason: 'r' },
        }),
      ],
    };
    writeProposal(path, file);
    const result = apply({ proposalPath: path, runGh });
    expect(result.aborted).toBe(true);
    expect(calls).toHaveLength(0);
    expect(result.summary.skipped).toBe(1);
  });

  it('applies all items when approval is "y"', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'y',
      items: [
        makeItem({
          number: 1,
          disposition: 'close-wontfix',
          disposition_fields: { reason: 'duplicate of #200' },
        }),
        makeItem({
          number: 2,
          disposition: 'label',
          disposition_fields: { labels: ['bug'] },
        }),
      ],
    };
    writeProposal(path, file);
    const result = apply({ proposalPath: path, runGh });
    expect(result.aborted).toBe(false);
    expect(result.summary.applied).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(calls).toHaveLength(2);

    // The file was rewritten with applied: true on each item.
    const round: ProposalFile = JSON.parse(readFileSync(path, 'utf8'));
    expect(round.items[0]?.applied).toBe(true);
    expect(round.items[0]?.result).toContain('closed-wontfix');
    expect(round.items[1]?.applied).toBe(true);
  });

  it('applies only selected indexes for a subset approval', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: '1,3',
      items: [
        makeItem({
          number: 10,
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'still tracking' },
        }),
        makeItem({
          number: 20,
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'skip me' },
        }),
        makeItem({
          number: 30,
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'still tracking' },
        }),
      ],
    };
    writeProposal(path, file);
    const result = apply({ proposalPath: path, runGh });
    expect(result.summary.applied).toBe(2);
    expect(result.summary.skipped).toBe(1);
    expect(calls).toHaveLength(2);
    // Item 2 was skipped (its issue number is 20).
    expect(calls.flat()).not.toContain('20');
  });

  it('surfaces partial-success with per-item errors and continues', () => {
    let callCount = 0;
    runGh = (args: readonly string[]) => {
      callCount += 1;
      calls.push(args);
      // Fail the second invocation.
      if (callCount === 2) {
        throw new Error('gh: not authenticated\nrun gh auth login');
      }
      return '';
    };
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'y',
      items: [
        makeItem({
          number: 1,
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'ok' },
        }),
        makeItem({
          number: 2,
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'will fail' },
        }),
        makeItem({
          number: 3,
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'continues' },
        }),
      ],
    };
    writeProposal(path, file);
    const result = apply({ proposalPath: path, runGh });
    expect(result.summary.applied).toBe(2);
    expect(result.summary.failed).toBe(1);
    const failed = result.outcomes.find((o) => !o.applied && !o.skipped);
    expect(failed?.error).toBe('gh: not authenticated');
    expect(failed?.issueNumber).toBe(2);

    // The post-apply file records the failure inline.
    const round: ProposalFile = JSON.parse(readFileSync(path, 'utf8'));
    expect(round.items[1]?.applied).toBe(false);
    expect(round.items[1]?.apply_error).toBe('gh: not authenticated');
    expect(round.items[0]?.applied).toBe(true);
    expect(round.items[2]?.applied).toBe(true);
  });

  it('records an error when an approved row has no disposition', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'y',
      items: [makeItem({ number: 1 })],
    };
    writeProposal(path, file);
    const result = apply({ proposalPath: path, runGh });
    expect(result.summary.applied).toBe(0);
    expect(result.summary.failed).toBe(1);
    expect(result.outcomes[0]?.error).toMatch(/no disposition/);
  });

  it('uses the explicit --repo override when supplied', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'baked/in',
      approval: 'y',
      items: [
        makeItem({
          number: 1,
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'c' },
        }),
      ],
    };
    writeProposal(path, file);
    apply({ proposalPath: path, runGh, repo: 'over/ride' });
    const flat = calls.flat();
    expect(flat).toContain('over/ride');
    expect(flat).not.toContain('baked/in');
  });
});
