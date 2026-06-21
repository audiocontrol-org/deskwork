// Engine-level document chrome detection (FR-001/FR-002).
//
// "Chrome" is the content the grammar must never see: the document frontmatter
// and the single embedded grammar-declaration comment (the HTML comment whose
// first token is the `doc-grammar:` sentinel). This module is the single source
// of truth for finding that chrome — shared by block-stream (which blanks it
// so the grammar never parses it) and grammar-resolver (which extracts the
// embedded grammar text from it).

import { DocumentModelError } from './types.js';

/** The sentinel that marks an HTML comment as a grammar declaration (FR-001). */
export const GRAMMAR_SENTINEL = 'doc-grammar:';

export interface LineRange {
  /** 0-based inclusive start line index. */
  readonly start: number;
  /** 0-based inclusive end line index. */
  readonly end: number;
}

export interface GrammarComment {
  readonly range: LineRange;
  /** The grammar text inside the comment, after the `doc-grammar:` sentinel. */
  readonly grammarText: string;
}

/** Detect leading YAML frontmatter (`---` … `---`). Returns null when absent. */
export function detectFrontmatter(lines: readonly string[]): LineRange | null {
  if (lines.length === 0 || lines[0]!.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') return { start: 0, end: i };
  }
  return null;
}

/**
 * Detect a fenced-code-block delimiter line. A fence opens (and closes) on a
 * line whose trimmed content STARTS with a run of 3+ backticks or 3+ tildes
 * (the common CommonMark case; an info-string like ```markdown may follow).
 * Returns the fence character (`` ` `` or `~`) for a candidate delimiter, else
 * null. We keep this deliberately simple: a fence delimiter sits alone on its
 * line (modulo an info-string) — the common case the grammar-example docs use.
 */
export function fenceDelimiterChar(line: string): '`' | '~' | null {
  return fenceDelimiter(line)?.char ?? null;
}

/**
 * A fenced-code-block delimiter's character, run length, and closeability (027 FR-033 /
 * AUDIT-20260621-54/55). CommonMark: a CLOSING fence must use the SAME character with a run
 * length AT LEAST as long as the opener AND carry NO info string (only trailing spaces) —
 * so neither an inner ``` nested in an outer ```` (length) NOR an info-string line like
 * ```` ```typescript ```` (closeable=false) closes the outer fence. Callers tracking fence
 * state must require `char` + `length` + `closeable` for a close, or a fenced example is
 * silently corrupted.
 */
export function fenceDelimiter(
  line: string,
): { readonly char: '`' | '~'; readonly length: number; readonly closeable: boolean } | null {
  const run = /^(`{3,}|~{3,})/.exec(line.trimStart());
  if (run === null) return null;
  const delim = run[0];
  // delim[0] is the fence character; the whole match is a homogeneous run, so its length
  // is the run length. The remainder after the run is the info string (if any).
  const char = delim.charAt(0) === '`' ? '`' : '~';
  const closeable = line.trimStart().slice(delim.length).trim().length === 0;
  return { char, length: delim.length, closeable };
}

/**
 * Find every HTML comment whose first non-blank token is the grammar sentinel.
 * FR-001: a governable document has EXACTLY ONE; the resolver fails loud on
 * more than one (ambiguous declaration). Returns all matches so the caller can
 * enforce that.
 *
 * Fence-aware (AUDIT-20260608-51): stack-control documents its own grammar
 * syntax, so a `<!-- doc-grammar: ... -->` opener can legitimately appear INSIDE
 * a fenced code block as a documented EXAMPLE. Such an opener is code, never a
 * real declaration — detecting it would either override the document's real
 * grammar or trip the >1-declaration ambiguity fail-loud. We track fenced-code-
 * block state while scanning and SKIP any `<!--` opener that begins inside a
 * fence. The skip applies consistently to BOTH the terminated and unterminated
 * branches (a malformed example in a fence must not fail loud either). This
 * cannot use buildBlockStream — findGrammarComments is called (via blankChrome)
 * BY buildBlockStream, so the fence tracking lives directly in this line scan.
 */
export function findGrammarComments(lines: readonly string[]): GrammarComment[] {
  const found: GrammarComment[] = [];
  // Fence char of the currently-open fenced code block, or null when outside a
  // fence. A fence closes on a later delimiter line using the same fence char.
  let openFence: '`' | '~' | null = null;
  for (let i = 0; i < lines.length; i++) {
    const fenceChar = fenceDelimiterChar(lines[i]!);
    if (fenceChar !== null) {
      if (openFence === null) {
        openFence = fenceChar; // opening delimiter
      } else if (fenceChar === openFence) {
        openFence = null; // matching closing delimiter
      }
      // A fence delimiter line is never itself a grammar-comment opener.
      continue;
    }
    // Inside a fenced code block: any `<!--` here is a documented example, not a
    // real declaration. Skip it for both the terminated and unterminated cases.
    if (openFence !== null) continue;
    const open = lines[i]!.indexOf('<!--');
    if (open === -1) continue;
    // Locate the comment's closing `-->` (same line or a later line).
    let end = i;
    let closeFound = lines[i]!.indexOf('-->', open + 4) !== -1;
    while (!closeFound && end + 1 < lines.length) {
      end++;
      closeFound = lines[end]!.includes('-->');
    }
    if (!closeFound) {
      // An unterminated comment is normally just not-chrome. But if it CLEARLY
      // opens a grammar declaration (the content after `<!--`, trimmed, starts
      // with the sentinel) and never closes, silently skipping it would
      // misdiagnose a malformed grammar declaration as a MISSING one — pointing
      // the operator at the wrong repair ("add a grammar" vs. "close the `-->`").
      // Fail loud naming the unterminated grammar comment (AUDIT-20260608-45,
      // same fail-loud class as the AUDIT-35 frontmatter fix).
      //
      // The sentinel may sit on the SAME line as `<!--` OR on a later line (the
      // `<!--` line is bare). Compute the inner content the same way the
      // terminated-comment branch computes `inner` — slice from after `<!--` to
      // the end-of-document (there is no `-->`) — so the multi-line opener is
      // caught too (AUDIT-20260608-50). The same-line case is the prefix of this.
      const block = lines.slice(i).join('\n');
      const afterOpen = block.slice(block.indexOf('<!--') + 4);
      if (afterOpen.trimStart().startsWith(GRAMMAR_SENTINEL)) {
        throw new DocumentModelError(
          `unterminated grammar comment: the \`${GRAMMAR_SENTINEL}\` declaration opened on line ${i + 1} is never closed with \`-->\` through end-of-document; close the comment (this is a malformed grammar declaration, not a missing one)`,
        );
      }
      continue; // non-grammar unterminated comment — not chrome
    }
    // Inner text between <!-- and -->.
    const block = lines.slice(i, end + 1).join('\n');
    const inner = block.slice(block.indexOf('<!--') + 4, block.lastIndexOf('-->'));
    if (inner.trimStart().startsWith(GRAMMAR_SENTINEL)) {
      // Body = everything after the first newline following the sentinel (the
      // sentinel line may carry a format word, e.g. `doc-grammar: peg`). When
      // the whole declaration is on one line, the body is the trimmed remainder.
      const afterSentinel = inner.trimStart().slice(GRAMMAR_SENTINEL.length);
      const nl = afterSentinel.indexOf('\n');
      const grammarText = nl === -1 ? afterSentinel.trim() : afterSentinel.slice(nl + 1);
      found.push({ range: { start: i, end }, grammarText });
    }
    i = end;
  }
  return found;
}

/**
 * Blank the chrome line ranges in-place (replace with empty lines) so total
 * line count — and therefore every other block's original line numbers — is
 * preserved when the markdown parser runs (FR-002).
 */
export function blankChrome(source: string): string {
  const lines = source.split('\n');
  const ranges: LineRange[] = [];
  const fm = detectFrontmatter(lines);
  if (fm) ranges.push(fm);
  for (const c of findGrammarComments(lines)) ranges.push(c.range);
  for (const r of ranges) {
    for (let i = r.start; i <= r.end; i++) lines[i] = '';
  }
  return lines.join('\n');
}

/**
 * Resolve the single embedded grammar comment, enforcing FR-001 uniqueness.
 * Returns null when none is embedded (caller falls through to frontmatter ref).
 */
export function embeddedGrammar(source: string): GrammarComment | null {
  const comments = findGrammarComments(source.split('\n'));
  if (comments.length === 0) return null;
  if (comments.length > 1) {
    throw new DocumentModelError(
      `ambiguous grammar declaration: ${comments.length} embedded \`${GRAMMAR_SENTINEL}\` comments found; a governable document must declare exactly one`,
    );
  }
  return comments[0]!;
}
