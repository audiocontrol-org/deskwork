import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveBucket } from './buckets.js';
import type {
  ProposalFile,
  ProposalItem,
  RawIssueForProposal,
  RunGh,
} from './types.js';

export interface ProposeArgs {
  readonly bucket: string;
  readonly limit: number;
  readonly repo: string;
  readonly projectRoot: string;
  readonly now: Date;
  readonly runGh: RunGh;
  // Override for the proposal file path; otherwise computed under
  // `<projectRoot>/.dw-lifecycle/triage-issues/proposals-<iso>.json`.
  readonly outputPath?: string;
}

export interface ProposeResult {
  readonly proposalFile: ProposalFile;
  readonly outputPath: string;
  readonly markdownTable: string;
}

const BODY_EXCERPT_CHARS = 240;

function isLabelShape(value: unknown): value is { name: string } {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { name?: unknown }).name === 'string';
}

function isCommentShape(value: unknown): value is { createdAt: string } {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { createdAt?: unknown }).createdAt === 'string';
}

function isRawIssue(value: unknown): value is RawIssueForProposal {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.number !== 'number' ||
    typeof v.title !== 'string' ||
    typeof v.url !== 'string' ||
    typeof v.createdAt !== 'string' ||
    typeof v.updatedAt !== 'string' ||
    typeof v.body !== 'string' ||
    !Array.isArray(v.labels) ||
    !Array.isArray(v.comments)
  ) {
    return false;
  }
  for (const label of v.labels) if (!isLabelShape(label)) return false;
  for (const comment of v.comments) if (!isCommentShape(comment)) return false;
  return true;
}

function parseIssues(raw: string): RawIssueForProposal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not parse gh issue list output as JSON: ${message}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `gh issue list output was not a JSON array (got ${typeof parsed}).`,
    );
  }
  const issues: RawIssueForProposal[] = [];
  for (const item of parsed) {
    if (!isRawIssue(item)) {
      throw new Error(
        `gh issue list output contained an item missing expected fields: ${JSON.stringify(item).slice(0, 200)}`,
      );
    }
    issues.push(item);
  }
  return issues;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400_000);
}

function latestCommentDate(issue: RawIssueForProposal): Date | null {
  if (issue.comments.length === 0) return null;
  let latest = new Date(0);
  for (const c of issue.comments) {
    const d = new Date(c.createdAt);
    if (d.getTime() > latest.getTime()) latest = d;
  }
  return latest;
}

function buildExcerpt(body: string): string {
  // Collapse runs of whitespace to single spaces so the excerpt is
  // table-friendly; truncate with an ellipsis when the body exceeds the
  // budget. Trim first to avoid leading/trailing newlines bleeding into
  // the visible cell.
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= BODY_EXCERPT_CHARS) return compact;
  return `${compact.slice(0, BODY_EXCERPT_CHARS - 1)}…`;
}

function toItem(issue: RawIssueForProposal, now: Date): ProposalItem {
  const createdAt = new Date(issue.createdAt);
  const ageDays = daysBetween(now, createdAt);
  const latestComment = latestCommentDate(issue);
  const commentAgeDays =
    latestComment === null ? null : daysBetween(now, latestComment);
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    age_days: ageDays,
    comment_age_days: commentAgeDays,
    labels: issue.labels.map((l) => l.name),
    body_excerpt: buildExcerpt(issue.body),
    disposition: null,
    disposition_fields: null,
    applied: null,
    apply_error: null,
    result: null,
  };
}

function defaultOutputPath(projectRoot: string, now: Date): string {
  // Use a sortable, filesystem-safe ISO-ish timestamp so adopters can browse
  // proposals chronologically. Colons would break Windows filenames.
  const stamp = now.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
  return join(
    projectRoot,
    '.dw-lifecycle',
    'triage-issues',
    `proposals-${stamp}.json`,
  );
}

function escapeTableCell(value: string): string {
  // Markdown table cells: pipes and line breaks would break the row layout.
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdownTable(items: readonly ProposalItem[]): string {
  const header = [
    '| # | Number | Title | Labels | Age | Comment-age | Body (excerpt) | Proposed disposition (FILL IN) | Rationale (FILL IN) |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const rows = items.map((item, idx) => {
    const labels = item.labels.length === 0 ? '_(none)_' : item.labels.join(', ');
    const commentAge =
      item.comment_age_days === null ? '_(none)_' : `${item.comment_age_days}d`;
    return `| ${idx + 1} | #${item.number} | ${escapeTableCell(item.title)} | ${escapeTableCell(labels)} | ${item.age_days}d | ${commentAge} | ${escapeTableCell(item.body_excerpt)} | _(fill in)_ | _(fill in)_ |`;
  });
  return [...header, ...rows].join('\n');
}

export function propose(args: ProposeArgs): ProposeResult {
  const resolved = resolveBucket({
    bucket: args.bucket,
    projectRoot: args.projectRoot,
    now: args.now,
  });

  const ghArgs: readonly string[] = [
    'issue',
    'list',
    '--repo',
    args.repo,
    '--search',
    resolved.query,
    '--limit',
    String(args.limit),
    '--json',
    'number,title,url,createdAt,updatedAt,body,labels,comments',
  ];
  const raw = args.runGh(ghArgs);
  const issues = parseIssues(raw);

  const items = issues.map((issue) => toItem(issue, args.now));

  const proposalFile: ProposalFile = {
    generated_at: args.now.toISOString(),
    bucket: resolved.name,
    query: resolved.query,
    repo: args.repo,
    approval: null,
    items,
  };

  const outputPath =
    args.outputPath ?? defaultOutputPath(args.projectRoot, args.now);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(proposalFile, null, 2)}\n`, 'utf8');

  return {
    proposalFile,
    outputPath,
    markdownTable: renderMarkdownTable(items),
  };
}
