// Audit-log walker for /dw-lifecycle:close-shipped (Evidence source b).
//
// Walks every `docs/<v>/<inProgress>/<slug>/audit-log.md` and surfaces
// findings where an entry's `Status:` line is `fixed-<sha>` AND that
// `<sha>` is reachable in the release range (`<fromTag>..<toTag>`).
//
// Reachability uses `git merge-base --is-ancestor <sha> <toTag>` AND
// the inverse check that the SHA is NOT already in `<fromTag>` — both
// must hold for the SHA to be "in the range, not before it."
//
// Per-finding issue-number association is best-effort: the walker scans
// the entry body (Refs / Closes / Fixes prose, fallback to any inline
// `#NNN` reference within ~40 lines of the Finding-ID line) and surfaces
// the first reachable issue number. Entries with no recoverable issue
// are emitted as `issueNumber: null` so the merge layer can surface
// them as orphan-source warnings.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.types.js';
import type { EvidenceSource, RunGit } from './types.js';
import { __dirWalk } from './audit-log-walker.dirwalk.js';
import { extractIssueFromBody } from './issue-extractor.js';

export interface AuditLogFinding {
  readonly source: Extract<EvidenceSource, 'audit-log'>;
  readonly issueNumber: number | null;
  readonly sha: string;
  readonly auditLogPath: string;
  readonly findingId: string | null;
  readonly entryHeading: string;
}

export interface AuditLogWalkArgs {
  readonly projectRoot: string;
  readonly config: Config;
  readonly fromTag: string;
  readonly toTag: string;
  readonly runGit: RunGit;
}

// Match a `Status: fixed-<sha>` line; capture group is the SHA. The SHA
// can be 7–40 hex characters (git supports any prefix length). Anchored
// case-insensitively to the start of a line via the /m flag.
const STATUS_FIXED_PATTERN = /^Status:\s*fixed-([0-9a-f]{7,40})\b/im;

// Find-id regex anchors a single audit-log entry; the entry runs from
// one Finding-ID line to the next (or to EOF).
const FINDING_ID_PATTERN = /^Finding-ID:\s+([A-Z0-9\-]+)\s*$/im;

// Issue-number extraction patterns. Closes/Fixes/Resolves/Refs win
// over a plain inline `#NNN`. Each captures one named group `n`.
const ISSUE_PATTERNS: readonly RegExp[] = [
  /(?<!\w)(?:closes?|closed)\s*[:#]?\s*#(?<n>\d+)/gi,
  /(?<!\w)(?:fixes?|fixed)\s*[:#]?\s*#(?<n>\d+)/gi,
  /(?<!\w)(?:resolves?|resolved)\s*[:#]?\s*#(?<n>\d+)/gi,
  /(?<!\w)(?:refs?|ref)\s*[:#]?\s*#(?<n>\d+)/gi,
  /(?<!\w)acknowledged-#(?<n>\d+)/gi,
  /(?<![\w/])#(?<n>\d+)\b/g,
];

interface ParsedEntry {
  readonly findingId: string | null;
  readonly heading: string;
  readonly bodyText: string;
}

function splitIntoEntries(content: string): readonly ParsedEntry[] {
  const lines = content.split('\n');
  const entries: ParsedEntry[] = [];
  let currentHeading = '';
  let currentFindingId: string | null = null;
  let buffer: string[] = [];

  function flush(): void {
    if (currentFindingId === null && buffer.length === 0) return;
    entries.push({
      findingId: currentFindingId,
      heading: currentHeading,
      bodyText: buffer.join('\n'),
    });
  }

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flush();
      currentHeading = line.slice(4).trim();
      currentFindingId = null;
      buffer = [line];
      continue;
    }
    buffer.push(line);
    const m = FINDING_ID_PATTERN.exec(line);
    if (m && m[1]) {
      currentFindingId = m[1];
    }
  }
  flush();
  return entries;
}

function extractIssueFromEntry(bodyText: string): number | null {
  return extractIssueFromBody(bodyText, ISSUE_PATTERNS);
}

function isReachable(args: {
  readonly sha: string;
  readonly fromTag: string;
  readonly toTag: string;
  readonly runGit: RunGit;
}): boolean {
  const { sha, fromTag, toTag, runGit } = args;
  // Ancestor of toTag means the SHA landed on/before toTag.
  if (!isAncestor(sha, toTag, runGit)) return false;
  // Ancestor of fromTag means the SHA was ALREADY in fromTag — exclude.
  if (isAncestor(sha, fromTag, runGit)) return false;
  return true;
}

function isAncestor(sha: string, ref: string, runGit: RunGit): boolean {
  try {
    runGit(['merge-base', '--is-ancestor', sha, ref]);
    return true;
  } catch {
    return false;
  }
}

function parseAuditLog(args: {
  readonly path: string;
  readonly fromTag: string;
  readonly toTag: string;
  readonly runGit: RunGit;
}): readonly AuditLogFinding[] {
  const { path, fromTag, toTag, runGit } = args;
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const entries = splitIntoEntries(content);
  const findings: AuditLogFinding[] = [];
  for (const entry of entries) {
    const statusMatch = STATUS_FIXED_PATTERN.exec(entry.bodyText);
    if (!statusMatch || !statusMatch[1]) continue;
    const sha = statusMatch[1];
    if (!isReachable({ sha, fromTag, toTag, runGit })) continue;
    const issueNumber = extractIssueFromEntry(entry.bodyText);
    findings.push({
      source: 'audit-log',
      issueNumber,
      sha,
      auditLogPath: path,
      findingId: entry.findingId,
      entryHeading: entry.heading,
    });
  }
  return findings;
}

export function walkAuditLogs(
  args: AuditLogWalkArgs,
): readonly AuditLogFinding[] {
  const { projectRoot, config, fromTag, toTag, runGit } = args;
  const slugDirs = __dirWalk.listAllFeatureSlugDirs({ projectRoot, config });
  const findings: AuditLogFinding[] = [];
  for (const slugDir of slugDirs) {
    const auditLogPath = join(slugDir, 'audit-log.md');
    if (!existsSync(auditLogPath)) continue;
    for (const finding of parseAuditLog({
      path: auditLogPath,
      fromTag,
      toTag,
      runGit,
    })) {
      findings.push(finding);
    }
  }
  return findings;
}

// Exposed for unit tests.
export const __testing = {
  splitIntoEntries,
  extractIssueFromEntry,
  parseAuditLog,
  isReachable,
  STATUS_FIXED_PATTERN,
} as const;
