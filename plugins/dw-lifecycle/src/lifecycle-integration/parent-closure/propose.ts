// Propose layer for /dw-lifecycle:complete-parent-closure.
//
// Walks the closing feature's GitHub issue tree, classifies each parent
// candidate, drafts an auto-generated closure comment for each
// close-eligible row, writes the proposal JSON file, and emits a markdown
// table for the operator to fill in (disposition + closure_comment).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { walk } from './walk.js';
import type {
  ChildIssueRef,
  ClassificationKind,
  ProposalFile,
  ProposalItem,
  RunGh,
  RunGit,
} from './types.js';

export class ProposalOutputExistsError extends Error {
  override name = 'ProposalOutputExistsError';
}

export interface ProposeArgs {
  readonly slug: string;
  readonly parentIssue: number;
  readonly workplanPath: string;
  readonly featureDir: string;
  readonly repo: string;
  readonly projectRoot: string;
  readonly now: Date;
  readonly runGh: RunGh;
  readonly runGit: RunGit;
  // Override for the proposal output path; otherwise computed under
  // `<projectRoot>/.dw-lifecycle/complete-parent-closure/proposals-<iso>.json`.
  readonly outputPath?: string;
  // When true, an existing file at outputPath is silently overwritten.
  readonly force?: boolean;
}

export interface ProposeResult {
  readonly proposalFile: ProposalFile;
  readonly outputPath: string;
  readonly markdownTable: string;
  // The full classified set, including the `skip-*` rows that were dropped
  // from the proposal items. Surfaced for the subcommand summary so the
  // operator sees which candidates were filtered and why.
  readonly skipped: readonly {
    readonly number: number;
    readonly title: string;
    readonly classification: ClassificationKind;
  }[];
}

function defaultOutputPath(projectRoot: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
  return join(
    projectRoot,
    '.dw-lifecycle',
    'complete-parent-closure',
    `proposals-${stamp}.json`,
  );
}

function resolveHeadSha(runGit: RunGit): string {
  try {
    const raw = runGit(['rev-parse', 'HEAD']);
    return raw.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not resolve feature-complete commit SHA via 'git rev-parse HEAD': ${message}`,
    );
  }
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderChildrenCell(children: readonly ChildIssueRef[]): string {
  if (children.length === 0) return '_(none)_';
  const tokens = children.map((c) => {
    const state =
      c.state === 'OPEN' ? 'open' : c.state === 'CLOSED' ? 'closed' : 'unknown';
    return `#${c.number} (${state})`;
  });
  return tokens.join(', ');
}

function buildClosureComment(args: {
  readonly slug: string;
  readonly featureDir: string;
  readonly featureCompleteSha: string;
  readonly children: readonly ChildIssueRef[];
}): string {
  const { slug, featureDir, featureCompleteSha, children } = args;
  // The closure comment cites the feature-complete commit + the closed
  // children + the feature directory so a future reader can trace the
  // closure trail without re-running the gate.
  const closedChildren = children.filter((c) => c.state === 'CLOSED');
  const childListLine =
    closedChildren.length === 0
      ? 'No child phase issues enumerated.'
      : `Closed child phase issues: ${closedChildren
          .map((c) => `#${c.number}`)
          .join(', ')}.`;
  return [
    `Closing as feature-complete for \`${slug}\`.`,
    '',
    childListLine,
    `Feature shipped via ${featureCompleteSha}.`,
    `See ${featureDir}/README.md for the full status table and ${featureDir}/DEVELOPMENT-NOTES.md entry for the journal.`,
  ].join('\n');
}

function toItem(args: {
  readonly slug: string;
  readonly featureDir: string;
  readonly featureCompleteSha: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly children: readonly ChildIssueRef[];
  readonly classification: ClassificationKind;
}): ProposalItem {
  // Pre-fill the closure_comment for close-* classifications so the
  // operator can edit-in-place rather than write the comment from scratch.
  // skip-* classifications never reach this function (filtered upstream),
  // but defensively render an empty comment for unrecognized shapes.
  const drafted =
    args.classification === 'close-all-children-closed' ||
    args.classification === 'close-with-open-children'
      ? buildClosureComment({
          slug: args.slug,
          featureDir: args.featureDir,
          featureCompleteSha: args.featureCompleteSha,
          children: args.children,
        })
      : '';
  return {
    number: args.number,
    title: args.title,
    url: args.url,
    state: args.state,
    child_issues: args.children,
    classification: args.classification,
    disposition: null,
    closure_comment: drafted === '' ? null : drafted,
    applied: null,
    apply_error: null,
    result: null,
  };
}

function renderMarkdownTable(items: readonly ProposalItem[]): string {
  const header = [
    '| # | Parent | Title | State | Children | Classification | Disposition (FILL IN) | Closure comment (FILL IN / edit) |',
    '|---|---|---|---|---|---|---|---|',
  ];
  const rows = items.map((item, idx) => {
    const children = renderChildrenCell(item.child_issues);
    const stateCell = item.state.toLowerCase();
    return `| ${idx + 1} | #${item.number} | ${escapeTableCell(item.title)} | ${stateCell} | ${escapeTableCell(children)} | ${item.classification} | _(fill in)_ | ${escapeTableCell(item.closure_comment ?? '_(fill in)_')} |`;
  });
  return [...header, ...rows].join('\n');
}

export function propose(args: ProposeArgs): ProposeResult {
  const headSha = resolveHeadSha(args.runGit);

  const walked = walk({
    slug: args.slug,
    parentIssue: args.parentIssue,
    workplanPath: args.workplanPath,
    repo: args.repo,
    runGh: args.runGh,
  });

  // Split into proposal-eligible rows and skipped rows. Skipped rows do
  // NOT enter the proposal file (operator can't act on them); they are
  // returned to the caller for the summary line only.
  const skipped: {
    number: number;
    title: string;
    classification: ClassificationKind;
  }[] = [];
  const proposalItems: ProposalItem[] = [];
  for (const w of walked) {
    if (
      w.classification === 'skip-already-closed' ||
      w.classification === 'skip-not-this-feature'
    ) {
      skipped.push({
        number: w.number,
        title: w.title,
        classification: w.classification,
      });
      continue;
    }
    proposalItems.push(
      toItem({
        slug: args.slug,
        featureDir: args.featureDir,
        featureCompleteSha: headSha,
        number: w.number,
        title: w.title,
        url: w.url,
        state: w.state,
        children: w.child_issues,
        classification: w.classification,
      }),
    );
  }

  const proposalFile: ProposalFile = {
    generated_at: args.now.toISOString(),
    feature_slug: args.slug,
    parent_issue: args.parentIssue,
    feature_complete_sha: headSha,
    repo: args.repo,
    approval: null,
    items: proposalItems,
  };

  const outputPath =
    args.outputPath ?? defaultOutputPath(args.projectRoot, args.now);
  if (!(args.force ?? false) && existsSync(outputPath)) {
    throw new ProposalOutputExistsError(
      `output file already exists at ${outputPath}; pass --force to overwrite (or move the existing file aside / pass a different --output path).`,
    );
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(proposalFile, null, 2)}\n`, 'utf8');

  return {
    proposalFile,
    outputPath,
    markdownTable: renderMarkdownTable(proposalItems),
    skipped,
  };
}
