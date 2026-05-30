// Bundle assembler. Walks the four close-shipped evidence sources
// (commits, audit-log entries, workplan back-fills, PR metadata),
// extracts every #NNN mention via the pure mention-scanner, and groups
// the evidence per-candidate into a CandidateBundle the agent reads.
//
// Phase 15 redesign — replaces the per-walker verb-filtered grammar
// approach with one mechanical aggregator. No judgment; bundles every
// referenced issue regardless of context. The agent dispatches
// downstream of this filter the noise.

import { extractMentions } from './mention-scanner.js';
import type { CandidateBundle, ScannedCommit } from './types.js';

const COMMIT_BODY_CAP = 500;
const ISSUE_BODY_CAP = 1000;
const PR_BODY_CAP = 1000;
const AUDIT_BODY_CAP = 500;
const COMMENT_CAP = 300;
const COMMENTS_PER_ISSUE_MAX = 3;

function truncate(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)}…`;
}

export interface AuditLogEntryInput {
  readonly finding_id: string | null;
  readonly status: string;
  readonly tracks_issue: number | null;
  readonly surface: string;
  readonly body: string;
}

export interface WorkplanBackfillInput {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export interface PrInput {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

export interface IssueInfo {
  readonly number: number;
  readonly title: string;
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly body: string;
  readonly recent_comments: readonly string[];
}

export interface AssembleArgs {
  readonly commits: readonly ScannedCommit[];
  readonly auditLogEntries: readonly AuditLogEntryInput[];
  readonly workplanBackfills: readonly WorkplanBackfillInput[];
  readonly pr: PrInput | null;
  readonly issueInfo: (n: number) => IssueInfo;
}

interface Aggregation {
  readonly commits: ScannedCommit[];
  readonly auditEntries: AuditLogEntryInput[];
  readonly workplan: WorkplanBackfillInput[];
}

export function assembleBundles(args: AssembleArgs): readonly CandidateBundle[] {
  const byIssue = new Map<number, Aggregation>();

  function ensure(issue: number): Aggregation {
    let a = byIssue.get(issue);
    if (a === undefined) {
      a = { commits: [], auditEntries: [], workplan: [] };
      byIssue.set(issue, a);
    }
    return a;
  }

  // Step 1: walk commits, extract mentions from subject+body, attach.
  for (const c of args.commits) {
    const mentions = extractMentions(`${c.subject}\n${c.body}`);
    for (const issue of mentions) {
      ensure(issue).commits.push(c);
    }
  }

  // Step 2: walk audit-log entries; tracks_issue OR body mentions count.
  for (const e of args.auditLogEntries) {
    const fromBody = extractMentions(e.body);
    const set = new Set<number>(fromBody);
    if (e.tracks_issue !== null) set.add(e.tracks_issue);
    for (const issue of set) {
      ensure(issue).auditEntries.push(e);
    }
  }

  // Step 3: walk workplan back-fills; text mentions count.
  for (const w of args.workplanBackfills) {
    const mentions = extractMentions(w.text);
    for (const issue of mentions) {
      ensure(issue).workplan.push(w);
    }
  }

  // Step 4: PR mentions attach to every issue the PR description references.
  const prIssues = args.pr === null ? new Set<number>() : extractMentions(args.pr.body);

  // Step 5: compose bundles.
  const out: CandidateBundle[] = [];
  for (const [issue, agg] of byIssue) {
    const info = args.issueInfo(issue);
    out.push({
      issue: {
        number: info.number,
        title: info.title,
        state: info.state,
        body: truncate(info.body, ISSUE_BODY_CAP),
        recent_comments: info.recent_comments
          .slice(0, COMMENTS_PER_ISSUE_MAX)
          .map((c) => truncate(c, COMMENT_CAP)),
      },
      commits: agg.commits.map((c) => ({
        sha: c.sha,
        subject: c.subject,
        body: truncate(c.body, COMMIT_BODY_CAP),
        diff_stat: '',
      })),
      pr:
        args.pr !== null && prIssues.has(issue)
          ? {
              number: args.pr.number,
              title: args.pr.title,
              body: truncate(args.pr.body, PR_BODY_CAP),
            }
          : null,
      audit_log_entries: agg.auditEntries.map((e) => ({
        finding_id: e.finding_id,
        status: e.status,
        tracks_issue: e.tracks_issue,
        surface: e.surface,
        body: truncate(e.body, AUDIT_BODY_CAP),
      })),
      workplan_backfills: agg.workplan.map((w) => ({
        file: w.file,
        line: w.line,
        text: w.text,
      })),
    });
  }

  out.sort((a, b) => a.issue.number - b.issue.number);
  return out;
}
