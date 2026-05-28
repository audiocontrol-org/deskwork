// Cross-source merger for /dw-lifecycle:close-shipped.
//
// Combines findings from the four evidence walkers (commit-log scanner,
// audit-log walker, tooling-feedback walker, workplan-checkbox walker)
// into a per-issue MergedIssueEvidence record. Per-issue:
//
//   - `sources` is the dedup'd, alphabetically-sorted list of source
//     identifiers that flagged the issue.
//   - `commits` carries every ScannedCommit that any source attributed
//     to the issue (commit-log direct; audit-log / tooling-feedback via
//     SHA resolution -- if the SHA matches one of the scanned commits,
//     that commit is added).
//   - `provenance` is the per-source-finding trail in stable order
//     (commit-log first, then audit-log, then tooling-feedback, then
//     workplan-checkbox).
//   - `orphanSource` is true when commit-log AND audit-log both name a
//     SHA for the issue and the two SHAs disagree -- a discrepancy that
//     warrants operator attention. Same logic applies between
//     commit-log/tooling-feedback and audit-log/tooling-feedback pairs.

import type { AuditLogFinding } from './audit-log-walker.js';
import type {
  EvidenceSource,
  IssueReferenceGroup,
  MergedIssueEvidence,
  ProvenanceEntry,
  ReferenceVerb,
  ScannedCommit,
} from './types.js';
import type { ToolingFeedbackFinding } from './tooling-feedback-walker.js';
import type { WorkplanFinding } from './workplan-walker.js';

export interface MergeArgs {
  readonly commits: readonly ScannedCommit[];
  readonly groups: readonly IssueReferenceGroup[];
  readonly auditFindings: readonly AuditLogFinding[];
  readonly tfFindings: readonly ToolingFeedbackFinding[];
  readonly workplanFindings: readonly WorkplanFinding[];
}

interface MergeAccumulator {
  sourcesSet: Set<EvidenceSource>;
  commits: ScannedCommit[];
  verbs: ReferenceVerb[];
  primarySubject: string;
  provenance: ProvenanceEntry[];
  commitLogShas: Set<string>;
  auditShas: Set<string>;
  tfShas: Set<string>;
}

function newAccumulator(): MergeAccumulator {
  return {
    sourcesSet: new Set<EvidenceSource>(),
    commits: [],
    verbs: [],
    primarySubject: '',
    provenance: [],
    commitLogShas: new Set<string>(),
    auditShas: new Set<string>(),
    tfShas: new Set<string>(),
  };
}

function pushCommitOnce(
  acc: MergeAccumulator,
  commit: ScannedCommit | undefined,
): void {
  if (commit === undefined) return;
  if (acc.commits.some((c) => c.sha === commit.sha)) return;
  acc.commits.push(commit);
}

function findCommitBySha(
  commits: readonly ScannedCommit[],
  sha: string,
): ScannedCommit | undefined {
  // Audit-log / tooling-feedback record full or partial SHA strings.
  // Match by prefix in either direction so the lookup is resilient to
  // either form.
  for (const commit of commits) {
    if (commit.sha === sha) return commit;
    if (commit.sha.startsWith(sha)) return commit;
    if (sha.startsWith(commit.sha)) return commit;
  }
  return undefined;
}

function ingestCommitLogGroup(
  acc: MergeAccumulator,
  group: IssueReferenceGroup,
): void {
  acc.sourcesSet.add('commit-log');
  for (const commit of group.commits) {
    pushCommitOnce(acc, commit);
    acc.commitLogShas.add(commit.sha);
  }
  for (const verb of group.verbs) {
    if (!acc.verbs.includes(verb)) acc.verbs.push(verb);
  }
  if (acc.primarySubject === '') {
    acc.primarySubject = group.primarySubject;
  }
  const summary =
    group.commits.length === 0
      ? '(no commits)'
      : group.commits
          .map((c) => `${c.sha}: ${c.subject}`)
          .join('; ');
  acc.provenance.push({
    source: 'commit-log',
    sha: group.commits[0]?.sha ?? null,
    path: null,
    detail: summary,
  });
}

function ingestAuditFinding(
  acc: MergeAccumulator,
  finding: AuditLogFinding,
  commits: readonly ScannedCommit[],
): void {
  acc.sourcesSet.add('audit-log');
  acc.auditShas.add(finding.sha);
  pushCommitOnce(acc, findCommitBySha(commits, finding.sha));
  const parts: string[] = [];
  if (finding.findingId !== null) parts.push(finding.findingId);
  parts.push(`status fixed-${finding.sha}`);
  if (finding.entryHeading !== '') parts.push(finding.entryHeading);
  acc.provenance.push({
    source: 'audit-log',
    sha: finding.sha,
    path: finding.auditLogPath,
    detail: parts.join(' — '),
  });
}

function ingestTfFinding(
  acc: MergeAccumulator,
  finding: ToolingFeedbackFinding,
  commits: readonly ScannedCommit[],
): void {
  acc.sourcesSet.add('tooling-feedback');
  acc.tfShas.add(finding.sha);
  pushCommitOnce(acc, findCommitBySha(commits, finding.sha));
  const parts: string[] = [];
  if (finding.tfId !== null) parts.push(finding.tfId);
  parts.push(`closed-by ${finding.sha}`);
  if (finding.entryHeading !== '') parts.push(finding.entryHeading);
  acc.provenance.push({
    source: 'tooling-feedback',
    sha: finding.sha,
    path: finding.tfPath,
    detail: parts.join(' — '),
  });
}

function ingestWorkplanFinding(
  acc: MergeAccumulator,
  finding: WorkplanFinding,
): void {
  acc.sourcesSet.add('workplan-checkbox');
  acc.provenance.push({
    source: 'workplan-checkbox',
    sha: null,
    path: finding.workplanPath,
    detail: `line ${finding.lineNumber}: ${finding.taskLine.trim()}`,
  });
}

interface OrphanDetectResult {
  readonly orphan: boolean;
  readonly reason: string | null;
}

function detectOrphan(acc: MergeAccumulator): OrphanDetectResult {
  const pairs: ReadonlyArray<{
    readonly a: ReadonlySet<string>;
    readonly aLabel: string;
    readonly b: ReadonlySet<string>;
    readonly bLabel: string;
  }> = [
    {
      a: acc.commitLogShas,
      aLabel: 'commit-log',
      b: acc.auditShas,
      bLabel: 'audit-log',
    },
    {
      a: acc.commitLogShas,
      aLabel: 'commit-log',
      b: acc.tfShas,
      bLabel: 'tooling-feedback',
    },
    {
      a: acc.auditShas,
      aLabel: 'audit-log',
      b: acc.tfShas,
      bLabel: 'tooling-feedback',
    },
  ];
  for (const pair of pairs) {
    if (pair.a.size === 0 || pair.b.size === 0) continue;
    const overlap = shaSetsOverlap(pair.a, pair.b);
    if (overlap) continue;
    const aList = Array.from(pair.a).sort().join(',');
    const bList = Array.from(pair.b).sort().join(',');
    return {
      orphan: true,
      reason: `${pair.aLabel} cites SHA(s) [${aList}]; ${pair.bLabel} cites SHA(s) [${bList}]; the two sets are disjoint.`,
    };
  }
  return { orphan: false, reason: null };
}

function shaSetsOverlap(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      if (x.startsWith(y) || y.startsWith(x)) return true;
    }
  }
  return false;
}

const SOURCE_ORDER: Readonly<Record<EvidenceSource, number>> = {
  'commit-log': 0,
  'audit-log': 1,
  'tooling-feedback': 2,
  'workplan-checkbox': 3,
};

function sortSources(
  set: ReadonlySet<EvidenceSource>,
): readonly EvidenceSource[] {
  return Array.from(set).sort((a, b) => SOURCE_ORDER[a] - SOURCE_ORDER[b]);
}

function bestPrimarySubject(
  current: string,
  fallback: string,
): string {
  if (current !== '') return current;
  return fallback;
}

export function mergeAll(args: MergeArgs): readonly MergedIssueEvidence[] {
  const { commits, groups, auditFindings, tfFindings, workplanFindings } = args;
  const byIssue = new Map<number, MergeAccumulator>();

  function getOrInit(issue: number): MergeAccumulator {
    let acc = byIssue.get(issue);
    if (acc === undefined) {
      acc = newAccumulator();
      byIssue.set(issue, acc);
    }
    return acc;
  }

  for (const group of groups) {
    const acc = getOrInit(group.issue);
    ingestCommitLogGroup(acc, group);
  }
  for (const finding of auditFindings) {
    if (finding.issueNumber === null) continue;
    const acc = getOrInit(finding.issueNumber);
    ingestAuditFinding(acc, finding, commits);
    acc.primarySubject = bestPrimarySubject(
      acc.primarySubject,
      finding.entryHeading,
    );
  }
  for (const finding of tfFindings) {
    if (finding.issueNumber === null) continue;
    const acc = getOrInit(finding.issueNumber);
    ingestTfFinding(acc, finding, commits);
    acc.primarySubject = bestPrimarySubject(
      acc.primarySubject,
      finding.entryHeading,
    );
  }
  for (const finding of workplanFindings) {
    const acc = getOrInit(finding.issueNumber);
    ingestWorkplanFinding(acc, finding);
    acc.primarySubject = bestPrimarySubject(
      acc.primarySubject,
      finding.taskLine.trim(),
    );
  }

  const merged: MergedIssueEvidence[] = [];
  for (const [issue, acc] of byIssue) {
    const orphan = detectOrphan(acc);
    merged.push({
      issue,
      sources: sortSources(acc.sourcesSet),
      commits: acc.commits,
      verbs: acc.verbs,
      primarySubject: acc.primarySubject,
      provenance: acc.provenance,
      orphanSource: orphan.orphan,
      orphanReason: orphan.reason,
    });
  }
  merged.sort((a, b) => a.issue - b.issue);
  return merged;
}

export const __testing = {
  detectOrphan,
  findCommitBySha,
  sortSources,
  shaSetsOverlap,
} as const;
