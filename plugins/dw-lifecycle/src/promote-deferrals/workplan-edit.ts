// Workplan in-place edits for the promote-deferrals apply step.
//
// Two edit shapes:
//   - appendBacklink: append ` [debt: #N]` to the recorded TBD line.
//   - replaceWithWontfix: strip the marker keyword and append
//     ` (wontfix: <reason>)` to the recorded TBD line.
//
// Both edits run against an in-memory file content string (the apply layer
// reads the file once at the start of the run and writes the post-edit
// content once at the end). The caller is responsible for passing the
// CURRENT content; the edit functions do NOT re-read the file.
//
// Each edit performs a drift check: the live line at the recorded
// `lineNumber` must contain the recorded `expectedText` excerpt as a
// substring. When the check fails, the edit throws WorkplanDriftError and
// the apply layer records the failure per-item without mutating the file.
//
// Multi-marker-per-line: when a single line carries multiple TBD markers
// (e.g. "TBD: defer to next quarter"), the apply layer treats the LINE
// as the unit of edit — one back-link or one wontfix wrapper, even if
// the line carried multiple markers. The operator can split the line by
// hand if they need per-marker dispositions.

export class WorkplanDriftError extends Error {
  override name = 'WorkplanDriftError';
}

// The marker substrings the workplan-tbd scanner recognized. inline-wontfix
// strips ONE of these from the line (the first one that matches case-
// insensitively); the rest of the original text is preserved verbatim.
// Listed longest-first so the regex engine prefers `follow-up:` over `defer`
// when both appear adjacent (a defensive ordering — the scanner's per-line
// `defer` rule already wouldn't double-count, but the strip order needs to
// be stable for the edit).
const MARKER_STRIP_PATTERNS: readonly RegExp[] = [
  /\bfollow-up:\s*/i,
  /\bout of scope\s*/i,
  /\bTBD:?\s*/i,
  /\bdefer\b\s*/i,
];

export interface WorkplanLineSample {
  // 1-based line number recorded by the scanner.
  readonly lineNumber: number;
  // Excerpt of the matched line (post-trim, capped at 200 chars). Used as
  // the drift-check substring against the live file line.
  readonly expectedText: string;
}

interface EditContext {
  readonly content: string;
  readonly sample: WorkplanLineSample;
}

interface SplitContent {
  readonly lines: string[];
  // Pre-edit line at the 0-based index. Caller has already drift-checked.
  readonly originalLine: string;
}

function splitAndLocate(ctx: EditContext): SplitContent {
  const lines = ctx.content.split('\n');
  const idx = ctx.sample.lineNumber - 1;
  if (idx < 0 || idx >= lines.length) {
    throw new WorkplanDriftError(
      `recorded line ${ctx.sample.lineNumber} is out of range for the current workplan (${lines.length} lines).`,
    );
  }
  const line = lines[idx];
  if (line === undefined) {
    // Defensive: split should have populated the index above.
    throw new WorkplanDriftError(
      `recorded line ${ctx.sample.lineNumber} was unexpectedly empty in the current workplan.`,
    );
  }
  // Drift check. The sample stores a trimmed excerpt (capped at 200 chars).
  // We require the live line, when trimmed, to START WITH the recorded
  // excerpt (a startsWith check rather than includes catches a workplan that
  // appended text to the line — the marker is still there but the operator
  // has already annotated it, e.g. with a [debt: #N] tag).
  const trimmedLive = line.trim();
  if (!trimmedLive.startsWith(ctx.sample.expectedText)) {
    throw new WorkplanDriftError(
      `recorded line ${ctx.sample.lineNumber} text drifted: expected to start with '${ctx.sample.expectedText.slice(0, 60)}' but live line is '${trimmedLive.slice(0, 60)}'. Re-run propose to refresh.`,
    );
  }
  return { lines, originalLine: line };
}

function joinLines(lines: readonly string[]): string {
  return lines.join('\n');
}

export interface AppendBacklinkArgs {
  readonly content: string;
  readonly sample: WorkplanLineSample;
  readonly issueNumber: number;
}

// Append ` [debt: #N]` to the recorded TBD line. Preserves the line's
// existing content (including the marker keyword) — the back-link is the
// audit trail signal that the deferral has been tracked.
export function appendBacklink(args: AppendBacklinkArgs): string {
  if (!Number.isInteger(args.issueNumber) || args.issueNumber <= 0) {
    throw new Error(
      `appendBacklink requires a positive integer issueNumber (got ${args.issueNumber}).`,
    );
  }
  const { lines, originalLine } = splitAndLocate({
    content: args.content,
    sample: args.sample,
  });
  const idx = args.sample.lineNumber - 1;
  // Be defensive: if the line already carries a back-link, the apply step
  // should have skipped it via the scanner's PROMOTED_RE guard. If it didn't,
  // refuse the edit so we don't end up with a doubled back-link.
  if (/\[debt:\s*#\d+\]/i.test(originalLine)) {
    throw new WorkplanDriftError(
      `recorded line ${args.sample.lineNumber} already carries a [debt: #N] back-link; refusing to append a second one.`,
    );
  }
  // Append the back-link as a trailing space + tag. Preserves any trailing
  // whitespace by trimming only what we need to (the original RIGHT-trim is
  // intentional to avoid leaving a hanging space before the new tag).
  const rightTrimmed = originalLine.replace(/\s+$/, '');
  lines[idx] = `${rightTrimmed} [debt: #${args.issueNumber}]`;
  return joinLines(lines);
}

export interface ReplaceWithWontfixArgs {
  readonly content: string;
  readonly sample: WorkplanLineSample;
  readonly reason: string;
}

// Strip the first matched marker keyword from the recorded line and append
// ` (wontfix: <reason>)`. The marker keyword strip is intentionally minimal:
// the rest of the line content is preserved so a workplan item that read
// "TBD: figure out auth flow" becomes "figure out auth flow (wontfix: ...)".
//
// When no marker keyword can be located on the recorded line (e.g. the line
// is `defer to next milestone` and `defer` was the trigger), the strip leaves
// the original line intact and just appends the wontfix tag. This is a
// conservative choice — the line still reads correctly, and the wontfix tag
// is the unambiguous signal that the deferral was dispositioned.
export function replaceWithWontfix(args: ReplaceWithWontfixArgs): string {
  const trimmedReason = args.reason.trim();
  if (trimmedReason === '') {
    throw new Error(
      `replaceWithWontfix requires a non-empty reason after trimming.`,
    );
  }
  const { lines, originalLine } = splitAndLocate({
    content: args.content,
    sample: args.sample,
  });
  const idx = args.sample.lineNumber - 1;
  if (/\[debt:\s*#\d+\]/i.test(originalLine)) {
    throw new WorkplanDriftError(
      `recorded line ${args.sample.lineNumber} already carries a [debt: #N] back-link; cannot apply wontfix (a back-link signals the deferral is already tracked).`,
    );
  }
  let stripped = originalLine;
  for (const pattern of MARKER_STRIP_PATTERNS) {
    if (pattern.test(stripped)) {
      stripped = stripped.replace(pattern, '');
      break;
    }
  }
  // Collapse internal double-spaces created by the strip, but preserve
  // leading whitespace (bullet indent, list-marker spacing).
  const leadingMatch = /^(\s*)/.exec(stripped);
  const leading = leadingMatch ? leadingMatch[1] ?? '' : '';
  const rest = stripped.slice(leading.length).replace(/ {2,}/g, ' ').replace(/\s+$/, '');
  lines[idx] = `${leading}${rest} (wontfix: ${trimmedReason})`;
  return joinLines(lines);
}
