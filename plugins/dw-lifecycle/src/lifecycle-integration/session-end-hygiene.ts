// session-end hygiene capture.
//
// Walks three sources to produce a per-session observation set + a forward
// recommendation block:
//
//   1. git log subjects in the range <sessionStartSha>..HEAD (or the last
//      ~10 commits when no session-start SHA was tracked) — extracting any
//      commit subject mentioning a hygiene-relevant token.
//   2. workplan markers in the feature workplan — any line that carries a
//      TBD-style marker (coalesced per line so a multi-marker line emits
//      one observation listing every matched marker).
//   3. issues filed by the current user inside the session boundary —
//      surfaced via `gh issue list --json number,title,state` with a
//      `created:>=<iso>` search where `<iso>` is the committer date of
//      `--session-start-sha`. When the SHA is absent, fall back to the
//      committer date of the merge-base of HEAD with origin/main, and if
//      that is also unavailable, to the committer date of HEAD~10. The
//      fallback boundary is documented inline so it is never "today."
//
// The captured observations feed a small markdown block that gets appended
// to the journal entry under `### Hygiene observations` followed by the
// `### Next session recommendation (hygiene)` heading. The recommendation
// is intentionally lightweight: the operator can edit it before commit.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanSingleWorkplanFile } from '../debt-report/workplan-tbd.js';
import type { WorkplanMarkerKey } from '../debt-report/types.js';
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

// Display form for each marker key. Mirrors the operator-visible marker
// vocabulary documented in `Just for now is bullshit`.
const MARKER_DISPLAY: Readonly<Record<WorkplanMarkerKey, string>> = {
  tbd: 'tbd',
  defer: 'defer',
  follow_up: 'follow-up',
  out_of_scope: 'out-of-scope',
};

// Coalesce the raw per-marker samples into one observation per workplan
// line. A line firing on N marker keywords collapses to a single entry
// whose `markerText` lists every matched marker; the line's text excerpt
// is shared by all samples (by construction in the scanner) so the first
// sample's `text` is authoritative.
function scanWorkplanTbds(
  args: SessionEndHygieneArgs,
): readonly HygieneObservation[] {
  const path = workplanPathFor(args);
  if (!existsSync(path)) return [];
  const result = scanSingleWorkplanFile(path);
  const groups = new Map<number, { markers: Set<WorkplanMarkerKey>; text: string }>();
  for (const sample of result.samples) {
    const existing = groups.get(sample.lineNumber);
    if (existing === undefined) {
      groups.set(sample.lineNumber, {
        markers: new Set([sample.markerKey]),
        text: sample.text,
      });
    } else {
      existing.markers.add(sample.markerKey);
    }
  }
  // Preserve scan-order (insertion order of the map matches the first-hit
  // order of each line in the file).
  const observations: HygieneObservation[] = [];
  for (const [lineNumber, group] of groups) {
    const markerList = Array.from(group.markers)
      .map((key) => MARKER_DISPLAY[key])
      .join(', ');
    observations.push({
      category: 'workplan-tbd-introduced',
      path,
      lineNumber,
      markerText: `markers: ${markerList} — ${group.text}`,
    });
  }
  return observations;
}

interface RawIssue {
  readonly number: number;
  readonly title: string;
  readonly state?: string;
}

function isRawIssue(value: unknown): value is RawIssue {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { number?: unknown; title?: unknown; state?: unknown };
  return (
    typeof candidate.number === 'number' &&
    typeof candidate.title === 'string' &&
    (candidate.state === undefined || typeof candidate.state === 'string')
  );
}

// Run a git command that may fail (missing SHA, missing remote ref, etc.)
// and return null instead of throwing. Used for the session-boundary
// timestamp resolution, where each fallback step is allowed to fail.
function tryGit(runGit: RunGit, args: readonly string[]): string | null {
  try {
    return runGit(args).trim();
  } catch {
    return null;
  }
}

// Resolve the session-boundary ISO-8601 committer-date timestamp.
//
// Priority order (each step that yields a non-empty string wins):
//   1. The committer date of `--session-start-sha`.
//   2. The committer date of the merge-base of HEAD with origin/main.
//   3. The committer date of HEAD~10 (last-10-commits fallback, mirrored
//      from the commit-scanner's FALLBACK_RECENT_COMMITS).
//
// Returns null when every step fails. The caller treats null as "no usable
// boundary; skip the gh query" — better than emitting a calendar-date
// query that re-introduces the bug this method exists to close.
function resolveSessionBoundaryIso(
  runGit: RunGit,
  sessionStartSha: string | null,
): string | null {
  if (sessionStartSha !== null) {
    const fromSha = tryGit(runGit, ['show', '-s', '--format=%cI', sessionStartSha]);
    if (fromSha !== null && fromSha.length > 0) return fromSha;
  }
  const mergeBase = tryGit(runGit, ['merge-base', 'HEAD', 'origin/main']);
  if (mergeBase !== null && mergeBase.length > 0) {
    const fromMergeBase = tryGit(runGit, ['show', '-s', '--format=%cI', mergeBase]);
    if (fromMergeBase !== null && fromMergeBase.length > 0) return fromMergeBase;
  }
  const fromHead = tryGit(runGit, ['show', '-s', '--format=%cI', `HEAD~${FALLBACK_RECENT_COMMITS}`]);
  if (fromHead !== null && fromHead.length > 0) return fromHead;
  return null;
}

function scanIssuesThisSession(
  args: SessionEndHygieneArgs,
): readonly HygieneObservation[] {
  const sinceIso = resolveSessionBoundaryIso(args.runGit, args.sessionStartSha);
  if (sinceIso === null) return [];
  let raw: string;
  try {
    raw = args.runGh([
      'issue',
      'list',
      '--author',
      '@me',
      '--state',
      'all',
      '--search',
      `created:>=${sinceIso}`,
      '--json',
      'number,title,state',
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
    const upper = entry.state?.toUpperCase();
    const issueState: 'OPEN' | 'CLOSED' | undefined =
      upper === 'OPEN' ? 'OPEN' : upper === 'CLOSED' ? 'CLOSED' : undefined;
    observations.push({
      category: 'issue-filed-this-session',
      issueNumber: entry.number,
      issueTitle: entry.title,
      issueState,
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
      // Forward-looking Triage line only carries OPEN issues. CLOSED-this-
      // session issues stay in the observations block as historical signal
      // but they are NOT triageable next session — they are already done.
      if (
        obs.issueNumber !== undefined &&
        obs.issueTitle !== undefined &&
        obs.issueState !== 'CLOSED'
      ) {
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
        const badge = obs.issueState === 'CLOSED' ? ' [CLOSED]' : obs.issueState === 'OPEN' ? ' [OPEN]' : '';
        lines.push(`- issue #${obs.issueNumber ?? ''}${badge} filed this session: ${obs.issueTitle ?? ''}`);
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
