// Commit-log scanner for /dw-lifecycle:close-shipped.
//
// Reads `git log <from-tag>..<to-tag>` via the injected RunGit callback,
// parses each commit into {sha, subject, body}, and extracts referenced
// GitHub issue numbers. The scanner recognizes ONLY GitHub's own auto-
// close grammar — three fix-keyword shapes:
//
//   closes   -- `Closes #NNN` / `Close #NNN` / `Closed #NNN` (case-insensitive)
//   fixes    -- `Fixes #NNN` / `Fix #NNN` / `Fixed #NNN`
//   resolves -- `Resolves #NNN` / `Resolve #NNN` / `Resolved #NNN`
//
// Bare `#NNN` mentions, `Refs #NNN` citations, and `(#NNN)` end-of-subject
// PR-merge markers are NOT extracted as fix-shipping signals — they're
// references or PR-numbers, not claims that the commit fixed the issue.
// This aligns close-shipped's semantic with GitHub's own auto-close
// grammar (Phase 13 / #366; pre-fix scanner was permissive and produced
// false-positive verification comments on adjacent / cross-linked /
// PR-merge issues).
//
// Self-references (issue numbers embedded in URLs within the commit
// message) are skipped — `https://github.com/owner/repo/pull/123`'s
// `/pull/123` segment must not be misread as `#123`.
//
// PR-merge commits whose subject matches `^Merge pull request #N from `
// are dropped entirely — the merge ceremony's PR-number isn't a fix
// signal, and the actual fix commits travel inside the merge as their
// own scanned records.
//
// Deduplication groups multiple commits per issue. Verbs are accumulated
// per group so the operator-facing dry-run output can show the strongest
// link form.

import type {
  CommitIssueReference,
  IssueReferenceGroup,
  ReferenceVerb,
  RunGit,
  ScannedCommit,
} from './types.js';
import type { ScannerConfig } from './scanner-config.js';
import { DEFAULT_SCANNER_CONFIG } from './scanner-config.js';

export class CommitScanError extends Error {
  override name = 'CommitScanError';
}

// Sentinels chosen so they cannot appear in a normal commit message: U+001E
// ASCII RECORD SEPARATOR delimits commit records, U+001F UNIT SEPARATOR
// delimits fields within a record. `git log --format` substitutes the
// literal characters verbatim, so the scanner can reconstruct records
// unambiguously even when commit bodies contain blank lines, multi-line
// continuations, or other control bytes that line-based parsing would
// mishandle.
const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

function buildLogFormat(): string {
  // %H = full hash; we slice to short form ourselves so the scanner stays
  // independent of git's core.abbrev configuration.
  // %s = subject; %b = body. Newlines inside the body are preserved.
  return `%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`;
}

export interface ScanArgs {
  readonly fromTag: string;
  readonly toTag: string;
  readonly runGit: RunGit;
}

/**
 * Read commits in the range `<from-tag>..<to-tag>` via git log.
 *
 * Throws CommitScanError when the tag range is structurally invalid
 * (e.g. either tag is missing on the local repo). An empty range -- the
 * `to-tag` containing no commits beyond `from-tag` -- is legitimate and
 * returns an empty list.
 */
export function scanCommits(args: ScanArgs): readonly ScannedCommit[] {
  const { fromTag, toTag, runGit } = args;
  let raw: string;
  try {
    raw = runGit([
      'log',
      `${fromTag}..${toTag}`,
      `--format=${buildLogFormat()}`,
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CommitScanError(
      `git log ${fromTag}..${toTag} failed: ${msg.split('\n')[0] ?? msg}`,
    );
  }
  return parseLogOutput(raw);
}

export function parseLogOutput(raw: string): readonly ScannedCommit[] {
  const records = raw.split(RECORD_SEPARATOR);
  const commits: ScannedCommit[] = [];
  for (const record of records) {
    const trimmed = record.replace(/^\n+/, '');
    if (trimmed === '') continue;
    const parts = trimmed.split(FIELD_SEPARATOR);
    if (parts.length < 3) continue;
    const fullSha = parts[0] ?? '';
    const subject = parts[1] ?? '';
    const body = (parts[2] ?? '').replace(/\n+$/, '');
    if (fullSha === '') continue;
    commits.push({
      sha: fullSha.slice(0, 7),
      subject,
      body,
    });
  }
  return commits;
}

// Strip URL segments before issue-reference matching so `/pull/123` and
// `/issues/123` do not get mis-extracted as `#123`. The pattern matches
// any http(s) URL non-greedily up to the next whitespace, so the entire
// URL segment is removed before the issue-number patterns run.
function stripIssueLikeUrls(text: string): string {
  const urlPattern = /https?:\/\/\S*/g;
  return text.replace(urlPattern, '');
}

interface PatternEntry {
  readonly verb: ReferenceVerb;
  readonly pattern: RegExp;
}

// Patterns are evaluated in order. Each captures one named group `n` --
// the issue number. The `gi` flag is set so they can be matched globally
// + case-insensitively.
//
// Phase 13 / #366 narrowed the pattern set to GitHub's auto-close grammar
// only. `refs` / `parens` / `plain` are no longer extracted — they were
// the false-positive surface that produced misleading "Shipped in
// v<X>" comments on referenced / cross-linked / PR-merge issues during
// the v0.27.0 dogfood.
const PATTERNS: readonly PatternEntry[] = [
  {
    verb: 'closes',
    pattern: /(?<!\w)(?:closes?|closed)\s*[:#]?\s*#(?<n>\d+)/gi,
  },
  {
    verb: 'fixes',
    pattern: /(?<!\w)(?:fixes?|fixed)\s*[:#]?\s*#(?<n>\d+)/gi,
  },
  {
    verb: 'resolves',
    pattern: /(?<!\w)(?:resolves?|resolved)\s*[:#]?\s*#(?<n>\d+)/gi,
  },
];

// PR-merge commit subjects (`Merge pull request #N from <branch>`) are
// dropped entirely — see file-header rationale. The pattern is anchored
// at the subject start; bodies + non-prefixed subjects are unaffected.
const MERGE_PR_SUBJECT_RE = /^Merge pull request #\d+ from /;

// Phase 14 / #369: end-of-subject `(#NNN)` pattern. Only used when the
// project-level config knob `treat_end_of_subject_parens_as_fix_marker`
// is true. Anchored to end-of-subject (the regex is applied to the
// subject string alone, not to subject + body). Mid-subject parens and
// body parens stay dropped regardless because they don't reach this
// matcher.
const END_OF_SUBJECT_PARENS_RE = /\(#(\d+)\)\s*$/;

interface ExtractedMatch {
  readonly issue: number;
  readonly verb: ReferenceVerb;
  readonly start: number;
}

/**
 * Extract every issue reference from one commit. The same issue number
 * may appear via multiple verbs in the same commit -- only the
 * strongest-verb match is kept per issue per commit (closes > fixes >
 * resolves > refs > parens > plain). Returns one reference per (issue,
 * commit) pair so the deduplicator can group by issue without
 * double-counting.
 */
export function extractReferencesFromCommit(
  commit: ScannedCommit,
  config: ScannerConfig = DEFAULT_SCANNER_CONFIG,
): readonly CommitIssueReference[] {
  // PR-merge commits never contribute fix-shipped signals. The actual
  // fix commits travel inside the merge as their own records; the merge
  // ceremony is bookkeeping.
  if (MERGE_PR_SUBJECT_RE.test(commit.subject)) {
    return [];
  }
  const text = `${commit.subject}\n${commit.body}`;
  const stripped = stripIssueLikeUrls(text);
  const matches: ExtractedMatch[] = [];

  // Phase 14 / #369 opt-in: end-of-subject parens. Scanned on the
  // STRIPPED SUBJECT alone, not on subject + body. This ensures the
  // anchor `$` matches end-of-subject, not end-of-record. Mid-subject
  // and body parens stay invisible to this matcher.
  if (config.treatEndOfSubjectParensAsFixMarker) {
    const subjectStripped = stripIssueLikeUrls(commit.subject);
    const m = END_OF_SUBJECT_PARENS_RE.exec(subjectStripped);
    if (m !== null) {
      const n = m[1];
      if (n !== undefined) {
        const issue = Number.parseInt(n, 10);
        if (Number.isFinite(issue) && issue > 0) {
          matches.push({ issue, verb: 'parens', start: m.index });
        }
      }
    }
  }
  const consumed = new Set<string>();
  for (const entry of PATTERNS) {
    const re = new RegExp(entry.pattern.source, entry.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      const n = m.groups?.['n'];
      if (n === undefined) continue;
      const issue = Number.parseInt(n, 10);
      if (!Number.isFinite(issue) || issue <= 0) continue;
      const key = `${issue}@${m.index}`;
      if (consumed.has(key)) continue;
      consumed.add(key);
      matches.push({ issue, verb: entry.verb, start: m.index });
    }
  }
  // Per-issue strongest-verb selection. PATTERNS order = verb strength.
  const strengthByVerb: Record<ReferenceVerb, number> = {
    closes: 6,
    fixes: 5,
    resolves: 4,
    refs: 3,
    parens: 2,
    plain: 1,
  };
  const bestByIssue = new Map<number, ExtractedMatch>();
  for (const match of matches) {
    const existing = bestByIssue.get(match.issue);
    if (
      existing === undefined ||
      strengthByVerb[match.verb] > strengthByVerb[existing.verb]
    ) {
      bestByIssue.set(match.issue, match);
    }
  }
  return Array.from(bestByIssue.values()).map((m) => ({
    issue: m.issue,
    sha: commit.sha,
    subject: commit.subject,
    verb: m.verb,
  }));
}

/**
 * Deduplicate references by issue number, accumulating the contributing
 * commits + verbs per issue. The first commit in scan order becomes the
 * `primarySubject` -- by GitHub-PR-merge convention, the squashed merge
 * subject is the actionable summary of what landed for that issue.
 */
export function groupReferencesByIssue(
  references: readonly CommitIssueReference[],
  commits: readonly ScannedCommit[],
): readonly IssueReferenceGroup[] {
  const commitBySha = new Map<string, ScannedCommit>();
  for (const c of commits) commitBySha.set(c.sha, c);

  const groups = new Map<
    number,
    {
      commits: ScannedCommit[];
      verbs: ReferenceVerb[];
      primarySubject: string;
    }
  >();
  for (const ref of references) {
    let group = groups.get(ref.issue);
    if (group === undefined) {
      group = { commits: [], verbs: [], primarySubject: ref.subject };
      groups.set(ref.issue, group);
    }
    const commit = commitBySha.get(ref.sha);
    if (commit !== undefined && !group.commits.includes(commit)) {
      group.commits.push(commit);
    }
    if (!group.verbs.includes(ref.verb)) {
      group.verbs.push(ref.verb);
    }
  }
  const result: IssueReferenceGroup[] = [];
  for (const [issue, group] of groups) {
    result.push({
      issue,
      commits: group.commits,
      verbs: group.verbs,
      primarySubject: group.primarySubject,
    });
  }
  // Stable order: issue number ascending. The operator-facing output
  // surfaces the list in this order, which keeps the dry-run reproducible
  // across re-runs.
  result.sort((a, b) => a.issue - b.issue);
  return result;
}

export interface ScanAndGroupArgs extends ScanArgs {
  /** Phase 14 / #369 scanner config; defaults to strict (Phase 13). */
  readonly config?: ScannerConfig;
}

export function scanAndGroup(args: ScanAndGroupArgs): {
  readonly commits: readonly ScannedCommit[];
  readonly groups: readonly IssueReferenceGroup[];
} {
  const commits = scanCommits(args);
  const config = args.config ?? DEFAULT_SCANNER_CONFIG;
  const allRefs: CommitIssueReference[] = [];
  for (const commit of commits) {
    for (const ref of extractReferencesFromCommit(commit, config)) {
      allRefs.push(ref);
    }
  }
  const groups = groupReferencesByIssue(allRefs, commits);
  return { commits, groups };
}
