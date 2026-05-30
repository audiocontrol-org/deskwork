// Session-range helpers shared by session-end-hygiene.
//
// Three concerns live here:
//   1. resolveSessionBoundarySha — pick a base SHA for the session range.
//   2. extractIssueRefsFromRange — parse `#NNN` references from commit
//      subjects + bodies inside <sha>..HEAD.
//   3. addedLineNumbersInRange — parse `@@ +A,B @@` hunk headers from
//      `git diff --unified=0 <sha>..HEAD -- <path>` and return the set of
//      line numbers added/modified in that range.
//
// These helpers used to be inline in session-end-hygiene.ts; they were
// pulled out when Phase 12 added the commit-range issue scan + session-diff
// workplan-TBD filter and pushed session-end-hygiene.ts past the file cap.

import type { RunGit } from './types.js';

// Mirror of session-end-hygiene's FALLBACK_RECENT_COMMITS. Re-declared here
// rather than imported to keep the dependency direction one-way (the
// session-end module imports from us, not vice versa).
const FALLBACK_RECENT_COMMITS = 10;

// Result of a git invocation the caller is willing to fail. Carries the
// reason on the failure branch so a downstream diagnostic can name WHICH
// step failed and with what message.
type GitAttempt =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string };

function tryGit(runGit: RunGit, args: readonly string[]): GitAttempt {
  try {
    return { ok: true, value: runGit(args).trim() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
  }
}

// Result of the session-boundary SHA resolution.
//
// Pre-Phase-12 the equivalent helper returned an ISO timestamp (consumed by
// `gh issue list --search "created:>=<iso>"`). Phase 12 switched the issue
// scan + workplan-TBD filter to commit-range operations (`git log
// <sha>..HEAD`, `git diff <sha>..HEAD -- <path>`), so the boundary is the
// SHA itself — no committer-date detour.
export type BoundaryShaResolution =
  | { readonly ok: true; readonly sha: string }
  | {
      readonly ok: false;
      readonly shaReason: string | null;
      readonly mergeBaseReason: string;
      readonly headReason: string;
    };

// Resolve the session-boundary SHA.
//
// Priority order (each step that yields a non-empty SHA wins):
//   1. `--session-start-sha` verified via `rev-parse --verify`.
//   2. The merge-base of HEAD with origin/main.
//   3. HEAD~10 (last-10-commits fallback).
//
// Returns a failure object when every step fails. The caller treats that as
// "no usable boundary; skip the commit-range scan" — and surfaces a one-
// line stderr diagnostic so the operator can tell the failure mode apart
// from "no issues referenced this session."
export function resolveSessionBoundarySha(
  runGit: RunGit,
  sessionStartSha: string | null,
): BoundaryShaResolution {
  let shaReason: string | null = null;
  if (sessionStartSha !== null) {
    const probe = tryGit(runGit, ['rev-parse', '--verify', sessionStartSha]);
    if (probe.ok && probe.value.length > 0) {
      return { ok: true, sha: probe.value };
    }
    shaReason = probe.ok ? 'empty-output' : probe.reason;
  }
  const mergeBase = tryGit(runGit, ['merge-base', 'HEAD', 'origin/main']);
  if (mergeBase.ok && mergeBase.value.length > 0) {
    return { ok: true, sha: mergeBase.value };
  }
  const mergeBaseReason = mergeBase.ok ? 'empty-output' : mergeBase.reason;
  const head = tryGit(runGit, [
    'rev-parse',
    '--verify',
    `HEAD~${FALLBACK_RECENT_COMMITS}`,
  ]);
  if (head.ok && head.value.length > 0) {
    return { ok: true, sha: head.value };
  }
  const headReason = head.ok ? 'empty-output' : head.reason;
  return { ok: false, shaReason, mergeBaseReason, headReason };
}

// Match `#NNN` references. `[^&\w/]` excludes:
//   - `&`  HTML-entity prefixes (`&#39;`).
//   - `\w` alphanumeric (avoids `id#section`-style fragments).
//   - `/`  cross-repo `org/repo#NNN` references — those are not OUR-repo
//          issues so we drop them.
// The `^` anchor handles a `#NNN` at the very start of the haystack.
// Max 7 digits matches GitHub's current issue-number bound with margin.
const ISSUE_REF_RE = /(?:^|[^&\w/])#(\d{1,7})\b/g;

// Walk `git log <boundarySha>..HEAD` and return the set of unique `#NNN`
// references found in commit SUBJECTS + BODIES. Subject + body are joined
// per-commit before scanning so a ref like `Closes #123` in a body line
// is picked up even when the subject has none.
//
// Record format: `%H\x1f%s\x1f%b\x1e` — fields separated by ASCII unit
// separator (0x1f); records separated by record separator (0x1e). Both
// chars are extremely unlikely in commit text and keep the parser robust
// against subject/body characters that would otherwise confuse a CSV-ish
// split. Trailing empty record after split is filtered.
export function extractIssueRefsFromRange(
  runGit: RunGit,
  boundarySha: string,
): ReadonlySet<number> {
  let out: string;
  try {
    out = runGit([
      'log',
      `--format=%H%x1f%s%x1f%b%x1e`,
      `${boundarySha}..HEAD`,
    ]);
  } catch {
    return new Set();
  }
  const refs = new Set<number>();
  for (const record of out.split('\x1e')) {
    if (record.trim().length === 0) continue;
    const fields = record.split('\x1f');
    const subject = fields[1] ?? '';
    const body = fields[2] ?? '';
    const haystack = `${subject}\n${body}`;
    let match: RegExpExecArray | null;
    // Reset lastIndex; the regex is shared (`g` flag) across calls.
    ISSUE_REF_RE.lastIndex = 0;
    while ((match = ISSUE_REF_RE.exec(haystack)) !== null) {
      const captured = match[1];
      if (captured === undefined) continue;
      refs.add(parseInt(captured, 10));
    }
  }
  return refs;
}

// Parse `@@ -A,B +C,D @@` hunk headers from a unified diff.
//
// C is the 1-based start line of the new file; D is the count (defaults to
// 1 when omitted). The contiguous range `[C, C+D)` is the set of lines
// added or modified by the hunk. D=0 means "this hunk removed lines and
// added none" — no entries get added in that case.
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;

function parseAddedLines(diff: string): Set<number> {
  const added = new Set<number>();
  HUNK_HEADER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HUNK_HEADER_RE.exec(diff)) !== null) {
    const startStr = match[1];
    if (startStr === undefined) continue;
    const start = parseInt(startStr, 10);
    const lenStr = match[2];
    const len = lenStr !== undefined ? parseInt(lenStr, 10) : 1;
    for (let i = 0; i < len; i += 1) added.add(start + i);
  }
  return added;
}

// Set of line numbers (1-based, in the current HEAD file) that the diff
// `<boundarySha>..HEAD -- <relPath>` reports as added or modified.
//
// Returns null when the diff cannot be computed (git failure, unknown
// boundary). Callers treat null as "no session-diff filter available;
// fall back to whole-file scan" — which preserves the pre-Phase-12
// behavior on greenfield repos and on fixtures that don't wire a real
// git tree.
export function addedLineNumbersInRange(
  runGit: RunGit,
  boundarySha: string,
  relPath: string,
): Set<number> | null {
  let diff: string;
  try {
    diff = runGit(['diff', '--unified=0', `${boundarySha}..HEAD`, '--', relPath]);
  } catch {
    return null;
  }
  return parseAddedLines(diff);
}
