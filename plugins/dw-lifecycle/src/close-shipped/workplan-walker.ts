// Workplan-checkbox walker for /dw-lifecycle:close-shipped (source d).
//
// Walks every `docs/<v>/<inProgress>/<slug>/workplan.md` and surfaces
// findings where a `[x]` checkbox line carries an embedded
// `· [#NNN](url)` back-fill (the `dw-lifecycle issues` Phase-heading
// back-fill format).
//
// Note: source (d) has NO SHA association — the checkbox is the
// "fixed" signal. The walker emits each match unconditionally; release
// reachability for these findings is implied by the cross-source merge
// (when commit-log / audit-log / tooling-feedback corroborate the
// issue's presence in the range).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.types.js';
import type { EvidenceSource } from './types.js';
import { __dirWalk } from './audit-log-walker.dirwalk.js';

export interface WorkplanFinding {
  readonly source: Extract<EvidenceSource, 'workplan-checkbox'>;
  readonly issueNumber: number;
  readonly workplanPath: string;
  readonly taskLine: string;
  readonly lineNumber: number;
}

export interface WorkplanWalkArgs {
  readonly projectRoot: string;
  readonly config: Config;
}

// Matches a workplan line shaped like:
//   - [x] Step N: ... · [#NNN](url)
// or any heading/task line ending in the back-fill pattern. The middle
// dot `·` (U+00B7) is the delimiter the `dw-lifecycle issues` skill
// emits between the task text and the issue link.
const CHECKED_ITEM_PATTERN =
  /^\s*-\s*\[x\]\s+.*?·\s*\[#(\d+)\]\(([^)]+)\)/i;

function parseWorkplan(path: string): readonly WorkplanFinding[] {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const findings: WorkplanFinding[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = CHECKED_ITEM_PATTERN.exec(line);
    if (!match || !match[1]) continue;
    const issue = Number.parseInt(match[1], 10);
    if (!Number.isFinite(issue) || issue <= 0) continue;
    findings.push({
      source: 'workplan-checkbox',
      issueNumber: issue,
      workplanPath: path,
      taskLine: line,
      lineNumber: i + 1,
    });
  }
  return findings;
}

export function walkWorkplans(
  args: WorkplanWalkArgs,
): readonly WorkplanFinding[] {
  const { projectRoot, config } = args;
  const slugDirs = __dirWalk.listAllFeatureSlugDirs({ projectRoot, config });
  const findings: WorkplanFinding[] = [];
  for (const slugDir of slugDirs) {
    const workplanPath = join(slugDir, 'workplan.md');
    if (!existsSync(workplanPath)) continue;
    for (const finding of parseWorkplan(workplanPath)) {
      findings.push(finding);
    }
  }
  return findings;
}

export const __testing = {
  parseWorkplan,
  CHECKED_ITEM_PATTERN,
} as const;
