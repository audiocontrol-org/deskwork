import { describe, it, expect, beforeEach } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  apply,
  InvalidProposalFileError,
  parseApproval,
  readProposalFile,
} from '../promote-deferrals/apply.js';
import {
  parseIssueNumberFromGhOutput,
} from '../promote-deferrals/dispositions.js';
import type {
  ProposalFile,
  ProposalItem,
} from '../promote-deferrals/types.js';

const GOOD_REASON =
  'this conflicts with the lane-immutability invariant Phase 4 codified; surfaces require redesign';
const GOOD_BODY =
  'Promoted from workplan TBD line. Context: Phase 1 / Task 1. Needs schema design + migration plan.';

function makeItem(overrides: Partial<ProposalItem>): ProposalItem {
  return {
    lineNumber: 1,
    markerKey: 'tbd',
    text: '- [ ] TBD: marker',
    containingTask: 'Task 1: T',
    parentPhase: 'Phase 1: P',
    containingTaskLine: null,
    parentPhaseLine: null,
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

function fixtureWorkplan(projectRoot: string): string {
  const path = join(projectRoot, 'workplan.md');
  writeFileSync(
    path,
    `# Workplan
## Phase 1: Setup
- [ ] TBD: figure out schema
- [ ] defer to next milestone — auth redesign
`,
    'utf8',
  );
  return path;
}

describe('parseApproval', () => {
  it('parses y / n / subset / whitespace cases', () => {
    expect(parseApproval('y', 3)).toEqual({ kind: 'all' });
    expect(parseApproval('n', 3)).toEqual({ kind: 'none' });
    expect(parseApproval('1,3', 3)).toEqual({
      kind: 'subset',
      indexes: [1, 3],
    });
  });

  it('rejects null and empty', () => {
    expect(() => parseApproval(null, 3)).toThrow(/null/);
    expect(() => parseApproval('', 3)).toThrow(/empty/);
  });

  it('rejects out-of-range and non-integer', () => {
    expect(() => parseApproval('1,9', 3)).toThrow(/out of range/);
    expect(() => parseApproval('1,foo', 3)).toThrow(/non-integer/);
  });
});

describe('parseIssueNumberFromGhOutput', () => {
  it('extracts the trailing integer from an issue URL', () => {
    expect(
      parseIssueNumberFromGhOutput('https://github.com/owner/repo/issues/189\n'),
    ).toBe(189);
  });

  it('handles preceding prelude lines', () => {
    expect(
      parseIssueNumberFromGhOutput(
        `Creating issue in owner/repo\n\nhttps://github.com/owner/repo/issues/42\n`,
      ),
    ).toBe(42);
  });

  it('throws on empty output', () => {
    expect(() => parseIssueNumberFromGhOutput('')).toThrow(/empty/);
  });

  it('throws when no URL is present', () => {
    expect(() => parseIssueNumberFromGhOutput('something else')).toThrow(/URL/i);
  });
});

describe('apply — gate behavior', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'apply-gate-'));
  });

  it('aborts when approval is "n"', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'n',
      items: [makeItem({})],
    });
    const result = apply({ proposalPath, runGh: () => '' });
    expect(result.aborted).toBe(true);
    expect(result.summary.applied).toBe(0);
  });

  it('throws InvalidProposalFileError on malformed JSON', () => {
    const proposalPath = join(projectRoot, 'p.json');
    writeFileSync(proposalPath, '{not valid json', 'utf8');
    expect(() => apply({ proposalPath, runGh: () => '' })).toThrow(
      InvalidProposalFileError,
    );
  });

  it('throws InvalidProposalFileError on missing required fields', () => {
    const proposalPath = join(projectRoot, 'p.json');
    writeFileSync(proposalPath, '{"approval":"y"}', 'utf8');
    expect(() => apply({ proposalPath, runGh: () => '' })).toThrow(
      InvalidProposalFileError,
    );
  });

  it('throws InvalidProposalFileError when an item is missing the disposition_fields key', () => {
    // The guard validates EVERY declared field on ProposalItem. A row
    // that omits `disposition_fields` (one of the 11 declared fields)
    // must be caught at gate time — pre-Fix-4, the row would have
    // passed the 5-field guard and tripped a TypeError later.
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    const before = readFileSync(wpPath, 'utf8');
    writeFileSync(
      proposalPath,
      JSON.stringify({
        generated_at: '2026-05-28T00:00:00.000Z',
        workplan_path: wpPath,
        repo: 'owner/repo',
        approval: 'y',
        items: [
          {
            lineNumber: 3,
            markerKey: 'tbd',
            text: '- [ ] TBD: figure out schema',
            containingTask: null,
            parentPhase: null,
            containingTaskLine: null,
            parentPhaseLine: null,
            disposition: null,
            // disposition_fields intentionally omitted
            applied: null,
            apply_error: null,
            result: null,
          },
        ],
      }),
      'utf8',
    );
    expect(() => apply({ proposalPath, runGh: () => '' })).toThrow(
      /malformed item at index 0: missing field 'disposition_fields'/,
    );
    // No workplan mutation happened.
    expect(readFileSync(wpPath, 'utf8')).toBe(before);
  });

  it('throws InvalidProposalFileError on half-filled item', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [makeItem({ disposition: 'inline-wontfix' })],
    });
    expect(() => apply({ proposalPath, runGh: () => '' })).toThrow(
      InvalidProposalFileError,
    );
  });

  it('throws InvalidProposalFileError when wontfix reason has a banned phrase', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'inline-wontfix',
          disposition_fields: {
            reason:
              'we will fix this in the next sprint once the storage team finishes the migration',
          },
        }),
      ],
    });
    expect(() => apply({ proposalPath, runGh: () => '' })).toThrow(
      InvalidProposalFileError,
    );
  });

  it('throws InvalidProposalFileError when promote-to-issue body is too short', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'promote-to-issue',
          disposition_fields: { title: 'X', body: 'short' },
        }),
      ],
    });
    expect(() => apply({ proposalPath, runGh: () => '' })).toThrow(
      InvalidProposalFileError,
    );
  });
});

describe('apply — happy path', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'apply-happy-'));
  });

  it('runs promote-to-issue: gh dispatch + workplan back-link append', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'promote-to-issue',
          disposition_fields: { title: 'Figure out schema', body: GOOD_BODY },
        }),
      ],
    });
    const calls: readonly string[][] = [];
    const runGh = (a: readonly string[]): string => {
      (calls as string[][]).push([...a]);
      return 'https://github.com/owner/repo/issues/42\n';
    };
    const result = apply({ proposalPath, runGh });
    expect(result.summary).toEqual({ applied: 1, failed: 0, skipped: 0 });
    expect(calls[0]?.[0]).toBe('issue');
    expect(calls[0]?.[1]).toBe('create');
    // Workplan now carries the back-link
    const wp = readFileSync(wpPath, 'utf8');
    expect(wp).toMatch(/TBD: figure out schema \[debt: #42\]/);
    // Outcome carries the issue number
    expect(result.outcomes[0]?.issueNumber).toBe(42);
  });

  it('runs inline-wontfix: workplan rewrite, no gh call', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'inline-wontfix',
          disposition_fields: { reason: GOOD_REASON },
        }),
      ],
    });
    let ghCalls = 0;
    const runGh = (): string => {
      ghCalls += 1;
      return '';
    };
    const result = apply({ proposalPath, runGh });
    expect(result.summary.applied).toBe(1);
    expect(ghCalls).toBe(0);
    const wp = readFileSync(wpPath, 'utf8');
    expect(wp).toMatch(/figure out schema \(wontfix: this conflicts with/);
    expect(wp).not.toMatch(/TBD: figure out schema$/m);
  });

  it('subset approval applies only listed indexes', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: '2',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'inline-wontfix',
          disposition_fields: { reason: GOOD_REASON },
        }),
        makeItem({
          lineNumber: 4,
          text: '- [ ] defer to next milestone — auth redesign',
          disposition: 'inline-wontfix',
          disposition_fields: { reason: GOOD_REASON },
        }),
      ],
    });
    const result = apply({ proposalPath, runGh: () => '' });
    expect(result.summary.applied).toBe(1);
    expect(result.summary.skipped).toBe(1);
    const wp = readFileSync(wpPath, 'utf8');
    // Line 3 untouched; line 4 rewritten.
    expect(wp).toMatch(/- \[ \] TBD: figure out schema/);
    expect(wp).toMatch(/auth redesign \(wontfix:/);
  });

  it('records workplan drift as per-item failure without aborting', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: something completely different',
          disposition: 'inline-wontfix',
          disposition_fields: { reason: GOOD_REASON },
        }),
        makeItem({
          lineNumber: 4,
          text: '- [ ] defer to next milestone — auth redesign',
          disposition: 'inline-wontfix',
          disposition_fields: { reason: GOOD_REASON },
        }),
      ],
    });
    const result = apply({ proposalPath, runGh: () => '' });
    expect(result.summary.applied).toBe(1);
    expect(result.summary.failed).toBe(1);
    const failed = result.outcomes.find((o) => !o.applied && !o.skipped);
    expect(failed?.error).toMatch(/workplan file changed since proposal; re-propose/);
  });

  it('records gh failure as per-item failure (partial success)', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'promote-to-issue',
          disposition_fields: { title: 'X', body: GOOD_BODY },
        }),
      ],
    });
    const runGh = (): string => {
      throw new Error('gh: not authenticated');
    };
    const result = apply({ proposalPath, runGh });
    expect(result.summary.applied).toBe(0);
    expect(result.summary.failed).toBe(1);
    expect(result.outcomes[0]?.error).toMatch(/not authenticated/);
  });

  it('leaves the workplan unchanged when the proposal-file write fails', () => {
    // Write ordering: proposal file FIRST, workplan SECOND. If the
    // proposal-file write throws, the workplan must be untouched so the
    // operator can re-run from the original state. We simulate the
    // proposal-write failure by making the proposal-path directory
    // read-only after the workplan fixture is written.
    const wpPath = fixtureWorkplan(projectRoot);
    const originalWorkplan = readFileSync(wpPath, 'utf8');
    // Place the proposal file in a subdir we can chmod-readonly. We
    // first write the proposal, then chmod the parent directory so the
    // subsequent atomic-write (tmp file create) inside the same dir
    // fails — but the workplan write (which is in a DIFFERENT parent
    // directory) would still succeed if write-ordering were wrong.
    const proposalDir = join(projectRoot, 'subdir');
    mkdirSync(proposalDir);
    const proposalPath = join(proposalDir, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'inline-wontfix',
          disposition_fields: { reason: GOOD_REASON },
        }),
      ],
    });
    chmodSync(proposalDir, 0o500);
    try {
      expect(() =>
        apply({ proposalPath, runGh: () => '' }),
      ).toThrow();
    } finally {
      // Restore so test cleanup can proceed.
      chmodSync(proposalDir, 0o700);
    }
    // Workplan content must be the pre-apply original — proposal-file
    // write failed before any workplan mutation hit disk.
    expect(readFileSync(wpPath, 'utf8')).toBe(originalWorkplan);
  });

  it('overwrites proposal file with per-row outcomes', () => {
    const wpPath = fixtureWorkplan(projectRoot);
    const proposalPath = join(projectRoot, 'p.json');
    writeProposal(proposalPath, {
      generated_at: '2026-05-28T00:00:00.000Z',
      workplan_path: wpPath,
      repo: 'owner/repo',
      approval: 'y',
      items: [
        makeItem({
          lineNumber: 3,
          text: '- [ ] TBD: figure out schema',
          disposition: 'inline-wontfix',
          disposition_fields: { reason: GOOD_REASON },
        }),
      ],
    });
    apply({ proposalPath, runGh: () => '' });
    const after = readProposalFile(proposalPath);
    expect(after.items[0]?.applied).toBe(true);
    expect(after.items[0]?.result).toMatch(/inline-wontfix/);
  });
});
