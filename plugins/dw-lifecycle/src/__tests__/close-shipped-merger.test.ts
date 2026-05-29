import { describe, expect, it } from 'vitest';
import { mergeAll, __testing } from '../close-shipped/merger.js';
import type {
  IssueReferenceGroup,
  ScannedCommit,
} from '../close-shipped/types.js';
import type { AuditLogFinding } from '../close-shipped/audit-log-walker.js';
import type { ToolingFeedbackFinding } from '../close-shipped/tooling-feedback-walker.js';
import type { WorkplanFinding } from '../close-shipped/workplan-walker.js';

function mkCommit(sha: string, subject: string): ScannedCommit {
  return { sha, subject, body: '' };
}

function mkGroup(
  issue: number,
  commits: readonly ScannedCommit[],
): IssueReferenceGroup {
  return {
    issue,
    commits,
    verbs: ['closes'],
    primarySubject: commits[0]?.subject ?? '',
  };
}

function mkAudit(args: {
  readonly issue: number | null;
  readonly sha: string;
  readonly findingId?: string | null;
  readonly heading?: string;
}): AuditLogFinding {
  return {
    source: 'audit-log',
    issueNumber: args.issue,
    sha: args.sha,
    auditLogPath: '/x/audit-log.md',
    findingId: args.findingId ?? null,
    entryHeading: args.heading ?? '',
  };
}

function mkTf(args: {
  readonly issue: number | null;
  readonly sha: string;
  readonly tfId?: string | null;
}): ToolingFeedbackFinding {
  return {
    source: 'tooling-feedback',
    issueNumber: args.issue,
    sha: args.sha,
    tfPath: '/x/tooling-feedback.md',
    tfId: args.tfId ?? null,
    entryHeading: '',
  };
}

function mkWp(issue: number): WorkplanFinding {
  return {
    source: 'workplan-checkbox',
    issueNumber: issue,
    workplanPath: '/x/workplan.md',
    taskLine: `- [x] Step 1 · [#${issue}](url)`,
    lineNumber: 1,
  };
}

describe('mergeAll', () => {
  it('merges commit-log findings only when no other sources', () => {
    const commits = [mkCommit('aaa1', 'feat: x (#10)')];
    const groups = [mkGroup(10, commits)];
    const merged = mergeAll({
      commits,
      groups,
      auditFindings: [],
      tfFindings: [],
      workplanFindings: [],
    });
    expect(merged.length).toBe(1);
    const first = merged[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.issue).toBe(10);
    expect(first.sources).toEqual(['commit-log']);
    expect(first.commits.length).toBe(1);
    expect(first.orphanSource).toBe(false);
  });

  it('combines sources by issue number with dedup', () => {
    const commits = [mkCommit('aaa1', 'feat (#10)')];
    const groups = [mkGroup(10, commits)];
    const audits = [mkAudit({ issue: 10, sha: 'aaa1' })];
    const tfs = [mkTf({ issue: 10, sha: 'aaa1' })];
    const wps = [mkWp(10)];
    const merged = mergeAll({
      commits,
      groups,
      auditFindings: audits,
      tfFindings: tfs,
      workplanFindings: wps,
    });
    expect(merged.length).toBe(1);
    const first = merged[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.sources).toEqual([
      'commit-log',
      'audit-log',
      'tooling-feedback',
      'workplan-checkbox',
    ]);
    expect(first.commits.length).toBe(1); // dedup'd
    expect(first.provenance.length).toBe(4);
    expect(first.orphanSource).toBe(false);
  });

  it('sorts merged entries by issue number ascending', () => {
    const groups = [
      mkGroup(100, [mkCommit('aaa1', 's100')]),
      mkGroup(1, [mkCommit('bbb1', 's1')]),
      mkGroup(50, [mkCommit('ccc1', 's50')]),
    ];
    const merged = mergeAll({
      commits: groups.flatMap((g) => g.commits),
      groups,
      auditFindings: [],
      tfFindings: [],
      workplanFindings: [],
    });
    expect(merged.map((m) => m.issue)).toEqual([1, 50, 100]);
  });

  it('drops audit findings with null issueNumber', () => {
    const audits = [mkAudit({ issue: null, sha: 'abc1' })];
    const merged = mergeAll({
      commits: [],
      groups: [],
      auditFindings: audits,
      tfFindings: [],
      workplanFindings: [],
    });
    expect(merged).toEqual([]);
  });

  it('detects orphan-source when commit-log and audit-log cite disjoint SHAs', () => {
    const commits = [mkCommit('aaaaaaa', 'feat (#10)')];
    const groups = [mkGroup(10, commits)];
    const audits = [
      mkAudit({ issue: 10, sha: 'bbbbbbb', findingId: 'AUDIT-1' }),
    ];
    const merged = mergeAll({
      commits,
      groups,
      auditFindings: audits,
      tfFindings: [],
      workplanFindings: [],
    });
    const first = merged[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.orphanSource).toBe(true);
    expect(first.orphanReason).toContain('aaaaaaa');
    expect(first.orphanReason).toContain('bbbbbbb');
  });

  it('does NOT flag orphan when sources share at least one SHA', () => {
    const commits = [
      mkCommit('aaaaaaa', 'feat (#10)'),
      mkCommit('ccccccc', 'more #10'),
    ];
    const groups = [mkGroup(10, commits)];
    const audits = [mkAudit({ issue: 10, sha: 'aaaaaaa' })];
    const merged = mergeAll({
      commits,
      groups,
      auditFindings: audits,
      tfFindings: [],
      workplanFindings: [],
    });
    expect(merged[0]?.orphanSource).toBe(false);
  });

  it('does NOT flag orphan when only one source provides any SHA', () => {
    const commits = [mkCommit('aaaaaaa', 'feat (#10)')];
    const groups = [mkGroup(10, commits)];
    const wps = [mkWp(10)];
    const merged = mergeAll({
      commits,
      groups,
      auditFindings: [],
      tfFindings: [],
      workplanFindings: wps,
    });
    expect(merged[0]?.orphanSource).toBe(false);
  });

  it('attaches commit lookup when audit-log SHA matches a scanned commit prefix', () => {
    const commits = [mkCommit('abc1234', 'feat')];
    const audits = [mkAudit({ issue: 10, sha: 'abc1234deadbeef' })];
    const merged = mergeAll({
      commits,
      groups: [],
      auditFindings: audits,
      tfFindings: [],
      workplanFindings: [],
    });
    const first = merged[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.commits.length).toBe(1);
  });
});

describe('sortSources', () => {
  it('returns sources in canonical order', () => {
    const sorted = __testing.sortSources(
      new Set([
        'workplan-checkbox',
        'commit-log',
        'tooling-feedback',
        'audit-log',
      ] as const),
    );
    expect(sorted).toEqual([
      'commit-log',
      'audit-log',
      'tooling-feedback',
      'workplan-checkbox',
    ]);
  });
});

describe('findCommitBySha', () => {
  it('matches exact SHA', () => {
    const c = __testing.findCommitBySha(
      [mkCommit('abc1234', 's')],
      'abc1234',
    );
    expect(c?.sha).toBe('abc1234');
  });

  it('matches by prefix (audit-log SHA shorter than scanned)', () => {
    const c = __testing.findCommitBySha(
      [mkCommit('abc1234', 's')],
      'abc12',
    );
    expect(c?.sha).toBe('abc1234');
  });

  it('returns undefined when no match', () => {
    expect(
      __testing.findCommitBySha([mkCommit('abc1234', 's')], 'deadbee'),
    ).toBeUndefined();
  });
});
