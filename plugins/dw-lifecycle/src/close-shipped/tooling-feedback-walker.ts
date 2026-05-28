// Tooling-feedback walker for /dw-lifecycle:close-shipped (Evidence source c).
//
// Walks every `docs/<v>/<inProgress>/<slug>/tooling-feedback.md` and
// surfaces findings where a TF entry's `Status:` line matches
// `Closed | <sha>` AND that SHA is reachable in the release range.
//
// TF entries name their id via a `## TF-NNN ...` heading. The walker
// associates a closing SHA with its surrounding TF entry id and
// best-effort issue association (Promoted to issue: #NNN / Tracked at:
// #NNN / inline `#NNN`). Features that don't ship tooling-feedback.md
// contribute zero findings — no error.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.types.js';
import type { EvidenceSource, RunGit } from './types.js';
import { __testing as auditTesting } from './audit-log-walker.js';
import { __dirWalk } from './audit-log-walker.dirwalk.js';
import { extractIssueFromBody } from './issue-extractor.js';

const { isReachable } = auditTesting;

export interface ToolingFeedbackFinding {
  readonly source: Extract<EvidenceSource, 'tooling-feedback'>;
  readonly issueNumber: number | null;
  readonly sha: string;
  readonly tfPath: string;
  readonly tfId: string | null;
  readonly entryHeading: string;
}

export interface ToolingFeedbackWalkArgs {
  readonly projectRoot: string;
  readonly config: Config;
  readonly fromTag: string;
  readonly toTag: string;
  readonly runGit: RunGit;
}

// `Status: Closed | <sha>` — `Closed` is case-insensitive; the pipe may
// be padded with whitespace. The SHA is the closing commit. Anchored
// at the start of a line via the /m flag.
const STATUS_CLOSED_PATTERN =
  /^Status:\s*Closed\s*\|\s*([0-9a-f]{7,40})\b/im;

// TF heading: `## TF-NNN · <category> · <severity> · <summary>`. The
// id is the literal `TF-NNN` token.
const TF_HEADING_PATTERN = /^##\s+(TF-\d+)\b/i;

// Issue-association patterns inside a TF entry, scanned in priority order.
const TF_ISSUE_PATTERNS: readonly RegExp[] = [
  /Promoted\s+to\s+issue\s*[:#]?\s*#(?<n>\d+)/gi,
  /Tracked\s+at\s*[:#]?\s*#(?<n>\d+)/gi,
  /(?<!\w)(?:closes?|closed|fixes?|fixed|resolves?|resolved)\s*[:#]?\s*#(?<n>\d+)/gi,
  /(?<![\w/])#(?<n>\d+)\b/g,
];

interface ParsedTfEntry {
  readonly tfId: string | null;
  readonly heading: string;
  readonly bodyText: string;
}

function splitIntoTfEntries(content: string): readonly ParsedTfEntry[] {
  const lines = content.split('\n');
  const entries: ParsedTfEntry[] = [];
  let currentHeading = '';
  let currentTfId: string | null = null;
  let buffer: string[] = [];

  function flush(): void {
    if (currentTfId === null && buffer.length === 0) return;
    entries.push({
      tfId: currentTfId,
      heading: currentHeading,
      bodyText: buffer.join('\n'),
    });
  }

  for (const line of lines) {
    const headingMatch = TF_HEADING_PATTERN.exec(line);
    if (headingMatch && headingMatch[1]) {
      flush();
      currentTfId = headingMatch[1];
      currentHeading = line.replace(/^##\s+/, '').trim();
      buffer = [line];
      continue;
    }
    buffer.push(line);
  }
  flush();
  return entries;
}

function extractTfIssue(bodyText: string): number | null {
  return extractIssueFromBody(bodyText, TF_ISSUE_PATTERNS);
}

function parseToolingFeedback(args: {
  readonly path: string;
  readonly fromTag: string;
  readonly toTag: string;
  readonly runGit: RunGit;
}): readonly ToolingFeedbackFinding[] {
  const { path, fromTag, toTag, runGit } = args;
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const entries = splitIntoTfEntries(content);
  const findings: ToolingFeedbackFinding[] = [];
  for (const entry of entries) {
    const statusMatch = STATUS_CLOSED_PATTERN.exec(entry.bodyText);
    if (!statusMatch || !statusMatch[1]) continue;
    const sha = statusMatch[1];
    if (!isReachable({ sha, fromTag, toTag, runGit })) continue;
    const issueNumber = extractTfIssue(entry.bodyText);
    findings.push({
      source: 'tooling-feedback',
      issueNumber,
      sha,
      tfPath: path,
      tfId: entry.tfId,
      entryHeading: entry.heading,
    });
  }
  return findings;
}

export function walkToolingFeedback(
  args: ToolingFeedbackWalkArgs,
): readonly ToolingFeedbackFinding[] {
  const { projectRoot, config, fromTag, toTag, runGit } = args;
  const slugDirs = __dirWalk.listAllFeatureSlugDirs({
    projectRoot,
    config,
  });
  const findings: ToolingFeedbackFinding[] = [];
  for (const slugDir of slugDirs) {
    const tfPath = join(slugDir, 'tooling-feedback.md');
    if (!existsSync(tfPath)) continue;
    for (const finding of parseToolingFeedback({
      path: tfPath,
      fromTag,
      toTag,
      runGit,
    })) {
      findings.push(finding);
    }
  }
  return findings;
}

export const __testing = {
  splitIntoTfEntries,
  extractTfIssue,
  parseToolingFeedback,
  STATUS_CLOSED_PATTERN,
} as const;
