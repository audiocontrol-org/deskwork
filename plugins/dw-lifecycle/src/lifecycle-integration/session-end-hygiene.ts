// session-end hygiene capture.
//
// Walks four sources to produce a per-session observation set + a forward
// recommendation block:
//
//   1. git log subjects in the range <sessionStartSha>..HEAD (or the last
//      ~10 commits when no session-start SHA was tracked) — extracting any
//      commit subject mentioning a hygiene-relevant token.
//   2. workplan markers in the feature workplan — any line that carries a
//      TBD-style marker (coalesced per line so a multi-marker line emits
//      one observation listing every matched marker). Filtered to lines
//      INTRODUCED BY THE SESSION DIFF (`git diff --unified=0
//      <boundarySha>..HEAD -- <workplan>`) so pre-existing prose doesn't
//      re-fire every session. The whole-file scan is the fallback when
//      no session boundary is resolvable (greenfield repos / fixtures).
//   3. issues actually touched by the session — derived from `#NNN`
//      references in `git log <boundarySha>..HEAD` commit subjects + bodies,
//      then `gh issue view <N>` per unique number. The session-boundary SHA
//      is the priority-ordered fallback: --session-start-sha → merge-base
//      with origin/main → HEAD~10. The pre-Phase-12 implementation queried
//      `gh issue list --author @me --search "created:>=<iso>"` which swept
//      in same-user issues filed from other branches in the same time
//      window (the #340-shaped scoping bug closed at #361 / Phase 12).
//   4. stale worktrees in the operator's worktree-base directory (Phase 11).
//
// The captured observations feed a small markdown block that gets appended
// to the journal entry under `### Hygiene observations` followed by the
// `### Next session recommendation (hygiene)` heading. The recommendation
// is intentionally lightweight: the operator can edit it before commit.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanSingleWorkplanFile } from '../debt-report/workplan-tbd.js';
import type { WorkplanMarkerKey } from '../debt-report/types.js';
import { runWorktreeReport } from '../worktree-report/scan.js';
import type {
  HygieneObservation,
  NextSessionRecommendation,
  RunGh,
  RunGit,
  SessionEndHygieneReport,
} from './types.js';
import {
  addedLineNumbersInRange,
  extractIssueRefsFromRange,
  resolveSessionBoundarySha,
} from './session-range.js';

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
  // Defensive posture matches `scanIssuesThisSession`: if the supplied SHA
  // is dangling (force-push / rebase / stale SHA from a prior session on a
  // different branch), `git log <bad-sha>..HEAD` exits non-zero and the
  // exception would crash the entire `captureSessionEndHygiene` pass. Try
  // the requested range first; on failure, retry with the `HEAD~10`
  // fallback. If THAT also fails (truly broken repo), surface zero rows
  // instead of throwing.
  let out: string;
  try {
    out = runGit(['log', '--format=%H%x09%s', ...range(sessionStartSha)]);
  } catch {
    if (sessionStartSha === null) return [];
    try {
      out = runGit(['log', '--format=%H%x09%s', ...range(null)]);
    } catch {
      return [];
    }
  }
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

// Display form for each marker key. Casing mirrors the spec brief's
// `TBD / defer / follow-up / out-of-scope` phrasing — `TBD` is uppercase as
// a proper noun; the remaining tokens are English words rendered lowercase
// with hyphen joins. This keeps the marker render consistent with the
// commit-subject token display (also uppercase `TBD`).
const MARKER_DISPLAY: Readonly<Record<WorkplanMarkerKey, string>> = {
  tbd: 'TBD',
  defer: 'defer',
  follow_up: 'follow-up',
  out_of_scope: 'out-of-scope',
};

// Coalesce the raw per-marker samples into one observation per workplan
// line. A line firing on N marker keywords collapses to a single entry
// whose `markerText` lists every matched marker; the line's text excerpt
// is shared by all samples (by construction in the scanner) so the first
// sample's `text` is authoritative.
//
// Phase 12: when a session boundary is resolvable, the per-line samples are
// filtered to lines INTRODUCED BY THE SESSION DIFF (`git diff --unified=0
// <boundarySha>..HEAD -- <workplan>`). Pre-existing prose stops re-firing
// every session. When no boundary is resolvable (greenfield repos, fixtures
// without git), the whole-file scan is the fallback so pre-Phase-12
// behavior is preserved.
function scanWorkplanTbds(
  args: SessionEndHygieneArgs,
): readonly HygieneObservation[] {
  const path = workplanPathFor(args);
  if (!existsSync(path)) return [];
  const result = scanSingleWorkplanFile(path);

  // Best-effort session-diff filter. Compute the set of added/modified
  // lines via `git diff --unified=0 <boundarySha>..HEAD -- <relPath>`. When
  // either the boundary or the diff cannot be computed, fall back to the
  // whole-file scan (sessionDiffLines = null).
  let sessionDiffLines: Set<number> | null = null;
  const boundary = resolveSessionBoundarySha(args.runGit, args.sessionStartSha);
  if (boundary.ok) {
    const relPath = relative(args.projectRoot, path);
    sessionDiffLines = addedLineNumbersInRange(args.runGit, boundary.sha, relPath);
  }

  const groups = new Map<number, { markers: Set<WorkplanMarkerKey>; text: string }>();
  for (const sample of result.samples) {
    if (sessionDiffLines !== null && !sessionDiffLines.has(sample.lineNumber)) {
      continue;
    }
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

// Look up a single issue via `gh issue view <N> --json number,title,state`
// and emit one observation. Returns null when the gh call fails or returns
// a malformed payload — the caller continues with the next ref instead of
// aborting the whole scan (best-effort per-issue dispatch).
function viewIssue(
  runGh: RunGh,
  issueNumber: number,
): HygieneObservation | null {
  let raw: string;
  try {
    raw = runGh(['issue', 'view', String(issueNumber), '--json', 'number,title,state']);
  } catch {
    return null;
  }
  if (raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRawIssue(parsed)) return null;
  const upper = parsed.state?.toUpperCase();
  const issueState: 'OPEN' | 'CLOSED' | undefined =
    upper === 'OPEN' ? 'OPEN' : upper === 'CLOSED' ? 'CLOSED' : undefined;
  return {
    category: 'issue-referenced-this-session',
    issueNumber: parsed.number,
    issueTitle: parsed.title,
    issueState,
  };
}

// Walk `git log <boundarySha>..HEAD`, parse `#NNN` refs from commit
// subjects + bodies, then `gh issue view <N>` per unique ref. The
// commit-range derivation is the authoritative record of what the session
// touched — replaces the pre-Phase-12 `gh issue list --author @me
// --search "created:>=<iso>"` which swept in same-user issues filed from
// other branches in the time window (the #340-shaped scoping bug).
function scanIssuesThisSession(
  args: SessionEndHygieneArgs,
): readonly HygieneObservation[] {
  const resolution = resolveSessionBoundarySha(args.runGit, args.sessionStartSha);
  if (!resolution.ok) {
    const shaPart =
      resolution.shaReason !== null
        ? `sha=${resolution.shaReason}`
        : 'sha=not-supplied';
    console.error(
      `session-end-hygiene: no session boundary resolvable (tried ${shaPart}, merge-base=${resolution.mergeBaseReason}, HEAD~${FALLBACK_RECENT_COMMITS}=${resolution.headReason}); skipping issue scan`,
    );
    return [];
  }
  const refs = extractIssueRefsFromRange(args.runGit, resolution.sha);
  if (refs.size === 0) return [];
  // Sort numerically so the observation order is stable across runs (the
  // commit-walk yields refs in commit order, which is fine for emission but
  // produces flaky test ordering when the same ref appears in multiple
  // commits).
  const sortedRefs = Array.from(refs).sort((a, b) => a - b);
  const observations: HygieneObservation[] = [];
  for (const ref of sortedRefs) {
    const observation = viewIssue(args.runGh, ref);
    if (observation !== null) observations.push(observation);
  }
  return observations;
}

function recommend(
  observations: readonly HygieneObservation[],
  args: SessionEndHygieneArgs,
): NextSessionRecommendation {
  const triageItems: string[] = [];
  const addressTbdItems: string[] = [];
  const dismantleCandidates: string[] = [];
  let resumeTask: string | null = null;

  for (const obs of observations) {
    if (obs.category === 'worktree-stale' && obs.worktreePath !== undefined) {
      const branchLabel = obs.worktreeBranch !== undefined && obs.worktreeBranch !== null
        ? ` (\`${obs.worktreeBranch}\`)`
        : '';
      const signalLabel = obs.staleSignalCount !== undefined
        ? ` — ${obs.staleSignalCount} of 9 signals`
        : '';
      dismantleCandidates.push(`${obs.worktreePath}${branchLabel}${signalLabel}`);
      continue;
    }
    if (obs.category === 'issue-referenced-this-session') {
      // Forward-looking Triage line carries OPEN issues only. CLOSED-but-
      // referenced issues stay in the observations block as historical
      // signal (the session touched their numbers in commit prose) but are
      // NOT triageable next session — they're already done.
      // Undefined-state issues (malformed gh JSON, schema drift) are also
      // excluded from the Triage line — they still appear in observations
      // with their absent state cited, but the operator-facing forward-
      // looking line gates strictly on OPEN per the #340 spec.
      if (
        obs.issueNumber !== undefined &&
        obs.issueTitle !== undefined &&
        obs.issueState === 'OPEN'
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

  return { resumeTask, triageItems, addressTbdItems, dismantleCandidates };
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
      } else if (obs.category === 'issue-referenced-this-session') {
        const badge = obs.issueState === 'CLOSED' ? ' [CLOSED]' : obs.issueState === 'OPEN' ? ' [OPEN]' : '';
        lines.push(`- issue #${obs.issueNumber ?? ''}${badge} referenced this session: ${obs.issueTitle ?? ''}`);
      } else if (obs.category === 'worktree-stale') {
        const branchLabel = obs.worktreeBranch !== undefined && obs.worktreeBranch !== null
          ? ` \`${obs.worktreeBranch}\``
          : '';
        const signalLabel = obs.staleSignalCount !== undefined
          ? ` — ${obs.staleSignalCount} of 9 staleness signals`
          : '';
        lines.push(`- worktree \`${obs.worktreePath ?? ''}\`${branchLabel}${signalLabel}`);
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
    lines.push('- Triage: (no issues referenced this session need disposition)');
  }
  if (recommendation.addressTbdItems.length > 0) {
    lines.push(`- Address TBD markers: ${recommendation.addressTbdItems.join('; ')}`);
  } else {
    lines.push('- Address TBD markers: (no bare TBD markers introduced this session)');
  }
  if (recommendation.dismantleCandidates.length > 0) {
    lines.push(`- Dismantle stale worktrees: ${recommendation.dismantleCandidates.join('; ')}`);
  } else {
    lines.push('- Dismantle stale worktrees: (no stale worktrees flagged)');
  }
  lines.push('');
  return lines.join('\n');
}

function readDirSafe(path: string): readonly string[] {
  try { return readdirSync(path); } catch { return []; }
}
function statDirSafe(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
function pathExistsSafe(path: string): boolean {
  try { statSync(path); return true; } catch { return false; }
}

function scanWorktreeStaleness(args: SessionEndHygieneArgs): readonly HygieneObservation[] {
  let report;
  try {
    report = runWorktreeReport({
      projectRoot: args.projectRoot,
      daysThreshold: 30,
      thresholdCount: 3,
      allowExternal: false,
      now: args.now,
      runGit: args.runGit,
      runGh: args.runGh,
      readDir: readDirSafe,
      statDir: statDirSafe,
      pathExists: pathExistsSafe,
    });
  } catch {
    return [];
  }
  const observations: HygieneObservation[] = [];
  for (const entry of report.entries) {
    if (entry.verdict !== 'stale' && entry.verdict !== 'orphan') continue;
    const heldCount = entry.signals.filter((s) => s.held).length;
    observations.push({
      category: 'worktree-stale',
      worktreePath: entry.path,
      worktreeBranch: entry.branch,
      staleSignalCount: heldCount,
    });
  }
  return observations;
}

export function captureSessionEndHygiene(
  args: SessionEndHygieneArgs,
): SessionEndHygieneReport {
  const rows = readCommits(args.runGit, args.sessionStartSha);
  const commitObservations = scanCommitMarkers(rows);
  const workplanObservations = scanWorkplanTbds(args);
  const issueObservations = scanIssuesThisSession(args);
  const worktreeObservations = scanWorktreeStaleness(args);
  const observations: readonly HygieneObservation[] = [
    ...commitObservations,
    ...workplanObservations,
    ...issueObservations,
    ...worktreeObservations,
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
