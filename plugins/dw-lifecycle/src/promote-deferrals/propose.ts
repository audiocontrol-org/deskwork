// propose: scans a single workplan, extracts containing-task + parent-phase
// context for each TBD line, writes a JSON proposal file, and emits a
// markdown table for the orchestrator agent to fill in.
//
// Context extraction:
//   - parentPhase: the most recent `## Phase N: ...` heading above the line.
//   - containingTask: the most recent `### Task N: ...` heading above the
//     line, but only if it appears AFTER the most recent phase heading
//     (a task heading from a previous phase shouldn't be claimed as the
//     container for a marker that sits in a later phase).
//
// The two headings are surfaced in the proposal file so the agent has
// enough context to write a meaningful issue body or wontfix reason
// without re-opening the workplan. The markdown table shows the headings
// inline so the agent's first pass can be done at-a-glance.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { scanSingleWorkplanFile } from '../debt-report/workplan-tbd.js';
import type { WorkplanMarkerSample } from '../debt-report/types.js';
import type { ProposalFile, ProposalItem } from './types.js';

export class ProposalOutputExistsError extends Error {
  override name = 'ProposalOutputExistsError';
}

export interface ProposeArgs {
  readonly workplanPath: string;
  readonly repo: string;
  readonly projectRoot: string;
  readonly now: Date;
  // Override for the proposal file path; otherwise computed under
  // `<projectRoot>/.dw-lifecycle/promote-deferrals/proposals-<iso>.json`.
  readonly outputPath?: string;
  // When true, an existing file at outputPath is silently overwritten.
  readonly force?: boolean;
}

export interface ProposeResult {
  readonly proposalFile: ProposalFile;
  readonly outputPath: string;
  readonly markdownTable: string;
  readonly itemCount: number;
}

// Heading regexes. The phase heading captures `## Phase N: ...` (any number
// of trailing chars). The task heading captures `### Task N: ...` (same).
// Both are anchored to the line start so `### Task 2 (do not do)` in body
// prose doesn't trigger.
const PHASE_HEADING_RE = /^##\s+Phase\b/i;
const TASK_HEADING_RE = /^###\s+Task\b/i;

interface HeadingContext {
  readonly containingTask: string | null;
  readonly parentPhase: string | null;
  readonly containingTaskLine: number | null;
  readonly parentPhaseLine: number | null;
}

function collectHeadingContext(
  lines: readonly string[],
  oneBasedLine: number,
): HeadingContext {
  let containingTask: string | null = null;
  let parentPhase: string | null = null;
  let containingTaskLine: number | null = null;
  let parentPhaseLine: number | null = null;
  // Walk backwards from the marker line (0-based index oneBasedLine - 1)
  // to line 0. The first task heading we hit is the containingTask; the
  // first phase heading is the parentPhase. We stop early once both are
  // set.
  for (let i = oneBasedLine - 2; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    if (containingTask === null && TASK_HEADING_RE.test(line)) {
      containingTask = line.replace(/^#+\s*/, '').trim();
      containingTaskLine = i + 1;
    }
    if (parentPhase === null && PHASE_HEADING_RE.test(line)) {
      parentPhase = line.replace(/^#+\s*/, '').trim();
      parentPhaseLine = i + 1;
      // Once we've found the phase, any task we haven't yet matched
      // belongs to an earlier phase — not the container for our marker.
      break;
    }
  }
  // Sanity: if we found a task heading but it sits BEFORE the parent phase
  // heading (i.e. it belongs to a prior phase), the task is not the
  // container. Re-null it.
  if (
    containingTaskLine !== null &&
    parentPhaseLine !== null &&
    containingTaskLine < parentPhaseLine
  ) {
    containingTask = null;
    containingTaskLine = null;
  }
  return { containingTask, parentPhase, containingTaskLine, parentPhaseLine };
}

function toItem(
  sample: WorkplanMarkerSample,
  context: HeadingContext,
): ProposalItem {
  return {
    lineNumber: sample.lineNumber,
    markerKey: sample.markerKey,
    text: sample.text,
    containingTask: context.containingTask,
    parentPhase: context.parentPhase,
    containingTaskLine: context.containingTaskLine,
    parentPhaseLine: context.parentPhaseLine,
    disposition: null,
    disposition_fields: null,
    applied: null,
    apply_error: null,
    result: null,
  };
}

function defaultOutputPath(projectRoot: string, now: Date): string {
  // ISO-ish timestamp with colons replaced so the path is filesystem-safe.
  const stamp = now.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
  return join(
    projectRoot,
    '.dw-lifecycle',
    'promote-deferrals',
    `proposals-${stamp}.json`,
  );
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdownTable(items: readonly ProposalItem[]): string {
  const header = [
    '| # | Line | Marker | Phase | Task | Text | Proposed disposition (FILL IN) | Disposition fields (FILL IN) |',
    '|---|---|---|---|---|---|---|---|',
  ];
  const rows = items.map((item, idx) => {
    const phase = item.parentPhase ?? '_(none)_';
    const task = item.containingTask ?? '_(none)_';
    return `| ${idx + 1} | ${item.lineNumber} | ${item.markerKey} | ${escapeTableCell(phase)} | ${escapeTableCell(task)} | ${escapeTableCell(item.text)} | _(fill in)_ | _(fill in)_ |`;
  });
  return [...header, ...rows].join('\n');
}

export function propose(args: ProposeArgs): ProposeResult {
  // The scan returns the marker samples (line numbers + excerpt). We then
  // re-read the file once more to walk headings — the scan doesn't surface
  // heading context, so we layer it on here.
  const scan = scanSingleWorkplanFile(args.workplanPath);
  const content = readFileSync(args.workplanPath, 'utf8');
  const lines = content.split('\n');

  const items = scan.samples.map((sample) => {
    const context = collectHeadingContext(lines, sample.lineNumber);
    return toItem(sample, context);
  });

  const proposalFile: ProposalFile = {
    generated_at: args.now.toISOString(),
    workplan_path: args.workplanPath,
    repo: args.repo,
    approval: null,
    items,
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
    markdownTable: renderMarkdownTable(items),
    itemCount: items.length,
  };
}
