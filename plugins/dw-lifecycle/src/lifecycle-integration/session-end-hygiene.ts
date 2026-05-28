// session-end hygiene capture.
//
// Walks three sources to produce a per-session observation set + a forward
// recommendation block:
//
//   1. git log subjects in the range <sessionStartSha>..HEAD (or the last
//      ~10 commits when no session-start SHA was tracked) — extracting any
//      commit subject mentioning a hygiene-relevant token.
//   2. workplan diffs across the same range — any new/modified line that
//      introduces a TBD-style marker.
//   3. open issues filed by the current user this session — surfaced via
//      `gh issue list --search "author:@me created:<today>"`.
//
// The captured observations feed a small markdown block that gets appended
// to the journal entry under `### Hygiene observations` followed by the
// `### Next session recommendation (hygiene)` heading. The recommendation
// is intentionally lightweight: the operator can edit it before commit.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanSingleWorkplanFile } from '../debt-report/workplan-tbd.js';
import type {
  HygieneObservation,
  NextSessionRecommendation,
  RunGh,
  RunGit,
  SessionEndHygieneReport,
} from './types.js';

// Commit-subject token list. Matches case-insensitively as whole words where
// the token has natural word boundaries; the `[debt: #NNN]` and
// `keep-with-reason` shapes are matched literally as substrings.
const COMMIT_SUBJECT_TOKENS: readonly { display: string; pattern: RegExp }[] = [
  { display: 'TBD', pattern: /\bTBD\b/i },
  { display: 'defer', pattern: /\bdefer\b/i },
  { display: 'follow-up', pattern: /\bfollow-up\b/i },
  { display: 'wontfix', pattern: /\bwontfix\b/i },
  { display: 'keep-with-reason', pattern: /keep-with-reason/i },
  { display: '[debt: #NNN]', pattern: /\[debt:\s*#\d+\]/i },
];

// Maximum commits scanned when no session-start SHA is tracked. Keeps the
// session-end pass cheap on long-running worktrees.
const FALLBACK_RECENT_COMMITS = 10;

export interface SessionEndHygieneArgs {
  readonly projectRoot: string;
  readonly featureSlug: string;
  readonly targetVersion: string;
  readonly inProgressDirName: string;
  readonly sessionStartSha: string | null;
  readonly runGit: RunGit;
  readonly runGh: RunGh;
  readonly now: Date;
}

interface CommitRow {
  readonly sha: string;
  readonly subject: string;
}

function range(
  sessionStartSha: string | null,
): readonly string[] {
  if (sessionStartSha !== null) {
    return [`${sessionStartSha}..HEAD`];
  }
  return [`-${FALLBACK_RECENT_COMMITS}`];
}

function readCommits(runGit: RunGit, sessionStartSha: string | null): readonly CommitRow[] {
  const out = runGit(['log', '--format=%H%x09%s', ...range(sessionStartSha)]);
  const rows: CommitRow[] = [];
  for (const line of out.split('\n')) {
    if (line.length === 0) continue;
    const tabIndex = line.indexOf('\t');
    if (tabIndex < 0) continue;
    const sha = line.slice(0, tabIndex);
    const subject = line.slice(tabIndex + 1);
    rows.push({ sha, subject });
  }
  return rows;
}

function scanCommitMarkers(
  rows: readonly CommitRow[],
): readonly HygieneObservation[] {
  const observations: HygieneObservation[] = [];
  for (const row of rows) {
    const matched: string[] = [];
    for (const token of COMMIT_SUBJECT_TOKENS) {
      if (token.pattern.test(row.subject)) {
        matched.push(token.display);
      }
    }
    if (matched.length > 0) {
      observations.push({
        category: 'commit-marker',
        sha: row.sha.slice(0, 12),
        subject: row.subject,
        markerText: matched.join(', '),
      });
    }
  }
  return observations;
}

function workplanPathFor(
  args: SessionEndHygieneArgs,
): string {
  const { projectRoot, featureSlug, targetVersion, inProgressDirName } = args;
  return join(
    projectRoot,
    'docs',
    targetVersion,
    inProgressDirName,
    featureSlug,
    'workplan.md',
  );
}

function scanWorkplanTbds(
  args: SessionEndHygieneArgs,
): readonly HygieneObservation[] {
  const path = workplanPathFor(args);
  if (!existsSync(path)) return [];
  const result = scanSingleWorkplanFile(path);
  return result.samples.map<HygieneObservation>((sample) => ({
    category: 'workplan-tbd-introduced',
    path,
    lineNumber: sample.lineNumber,
    markerText: sample.text,
  }));
}

interface RawIssue {
  readonly number: number;
  readonly title: string;
}

function isRawIssue(value: unknown): value is RawIssue {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { number?: unknown; title?: unknown };
  return (
    typeof candidate.number === 'number' &&
    typeof candidate.title === 'string'
  );
}

function isoDate(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function scanIssuesThisSession(
  args: SessionEndHygieneArgs,
): readonly HygieneObservation[] {
  const today = isoDate(args.now);
  let raw: string;
  try {
    raw = args.runGh([
      'issue',
      'list',
      '--state',
      'open',
      '--author',
      '@me',
      '--search',
      `created:${today}`,
      '--json',
      'number,title',
    ]);
  } catch {
    return [];
  }
  if (raw.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const observations: HygieneObservation[] = [];
  for (const entry of parsed) {
    if (!isRawIssue(entry)) continue;
    observations.push({
      category: 'issue-filed-this-session',
      issueNumber: entry.number,
      issueTitle: entry.title,
    });
  }
  return observations;
}

function recommend(
  observations: readonly HygieneObservation[],
  args: SessionEndHygieneArgs,
): NextSessionRecommendation {
  const triageItems: string[] = [];
  const addressTbdItems: string[] = [];
  let resumeTask: string | null = null;

  for (const obs of observations) {
    if (obs.category === 'issue-filed-this-session') {
      if (obs.issueNumber !== undefined && obs.issueTitle !== undefined) {
        triageItems.push(`#${obs.issueNumber} (${obs.issueTitle})`);
      }
    } else if (obs.category === 'workplan-tbd-introduced') {
      if (obs.lineNumber !== undefined && obs.markerText !== undefined) {
        addressTbdItems.push(`line ${obs.lineNumber}: ${obs.markerText}`);
      }
    }
  }

  // Most-recently-touched unchecked workplan task: read the workplan, find
  // the first unchecked `- [ ] ` line, surface its trimmed text. Cheap, no
  // need to consult git's per-line history here.
  const workplanPath = workplanPathFor(args);
  if (existsSync(workplanPath)) {
    const content = readFileSync(workplanPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = /^[\s-]*\[ \]\s+(.+)$/.exec(line);
      if (match && match[1]) {
        resumeTask = match[1].trim();
        break;
      }
    }
  }

  return { resumeTask, triageItems, addressTbdItems };
}

function renderMarkdownBlock(
  observations: readonly HygieneObservation[],
  recommendation: NextSessionRecommendation,
): string {
  const lines: string[] = [];
  lines.push('### Hygiene observations');
  lines.push('');
  if (observations.length === 0) {
    lines.push('- (no hygiene-relevant signals captured this session)');
  } else {
    for (const obs of observations) {
      if (obs.category === 'commit-marker') {
        lines.push(`- commit ${obs.sha ?? ''} — \`${obs.markerText ?? ''}\` in subject: ${obs.subject ?? ''}`);
      } else if (obs.category === 'workplan-tbd-introduced') {
        lines.push(`- workplan ${obs.path ?? ''}:${obs.lineNumber ?? ''} — ${obs.markerText ?? ''}`);
      } else if (obs.category === 'issue-filed-this-session') {
        lines.push(`- issue #${obs.issueNumber ?? ''} filed this session: ${obs.issueTitle ?? ''}`);
      }
    }
  }
  lines.push('');
  lines.push('### Next session recommendation (hygiene)');
  lines.push('');
  if (recommendation.resumeTask !== null) {
    lines.push(`- Resume: ${recommendation.resumeTask}`);
  } else {
    lines.push('- Resume: (no unchecked workplan task found)');
  }
  if (recommendation.triageItems.length > 0) {
    lines.push(`- Triage: ${recommendation.triageItems.join('; ')}`);
  } else {
    lines.push('- Triage: (no issues filed this session need disposition)');
  }
  if (recommendation.addressTbdItems.length > 0) {
    lines.push(`- Address TBD markers: ${recommendation.addressTbdItems.join('; ')}`);
  } else {
    lines.push('- Address TBD markers: (no bare TBD markers introduced this session)');
  }
  lines.push('');
  return lines.join('\n');
}

export function captureSessionEndHygiene(
  args: SessionEndHygieneArgs,
): SessionEndHygieneReport {
  const rows = readCommits(args.runGit, args.sessionStartSha);
  const commitObservations = scanCommitMarkers(rows);
  const workplanObservations = scanWorkplanTbds(args);
  const issueObservations = scanIssuesThisSession(args);
  const observations: readonly HygieneObservation[] = [
    ...commitObservations,
    ...workplanObservations,
    ...issueObservations,
  ];
  const recommendation = recommend(observations, args);
  const markdownBlock = renderMarkdownBlock(observations, recommendation);
  return { observations, recommendation, markdownBlock };
}

// Surfaced for the session-start helper: the markdown block emitted by this
// module is bracketed by these heading lines. The reader uses them to locate
// the prior recommendation in DEVELOPMENT-NOTES.md.
export const HYGIENE_OBSERVATIONS_HEADING = '### Hygiene observations';
export const NEXT_RECOMMENDATION_HEADING = '### Next session recommendation (hygiene)';
