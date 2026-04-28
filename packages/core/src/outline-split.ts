/*
 * outline-split.ts — shared utility for separating the `## Outline`
 * section from the rest of a dispatch markdown document.
 *
 * The outline lives in the source file (SSOT: the markdown file IS
 * the article, including its outline). But during body editing the
 * operator doesn't want the outline cluttering the source view —
 * it's reference material, not editing material, once the
 * Outlining phase is approved. The editor splits on mount, presents
 * only the body for editing, and rejoins on save so the disk file
 * is never lossy.
 *
 * Shape:
 *   splitOutline(md)          → { outline, body, present }
 *   joinOutline(outline, body) → md
 *
 * The split round-trips losslessly: `joinOutline(...splitOutline(x))`
 * equals the original document whenever `splitOutline(x).present`
 * is true. When no outline is present, `outline` is empty and join
 * returns just the body.
 */

export interface SplitOutline {
  /** The full outline section including the heading, or empty. */
  outline: string;
  /** Everything else in the document (frontmatter + title + body). */
  body: string;
  /** True if the document has an outline section to split. */
  present: boolean;
  /** Line index where the outline started (for structural rejoin). */
  startLine: number;
  /** Line index where the outline ended (exclusive). */
  endLine: number;
}

/**
 * Detect and separate the `## Outline` section. The section runs
 * from its `## Outline` heading through the next `## ` heading
 * (non-inclusive) or end of file. Anything before the outline is
 * prepended to `body`; anything after is appended. Rejoin via
 * `joinOutline`.
 *
 * This mirrors the line-wise logic in `scripts/lib/editorial/
 * body-state.ts` (kept separate so the browser-side bundle
 * doesn't have to drag in the server's fs/path imports).
 */
export function splitOutline(md: string): SplitOutline {
  const lines = md.split('\n');
  const startIdx = lines.findIndex((line) => /^##[ \t]+Outline\b/.test(line));
  if (startIdx < 0) {
    return { outline: '', body: md, present: false, startLine: -1, endLine: -1 };
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##[ \t]+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const outline = lines.slice(startIdx, endIdx).join('\n');
  const body = [...lines.slice(0, startIdx), ...lines.slice(endIdx)].join('\n');
  return { outline, body, present: true, startLine: startIdx, endLine: endIdx };
}

/**
 * Rejoin an outline section with body content. If `outline` is
 * empty, returns `body` unchanged. Otherwise splices the outline
 * back at the same structural position it was extracted from —
 * which for the scaffold shape (frontmatter + H1 + outline + body
 * sections) is right after the H1.
 *
 * Strategy: find the first `## ` heading in `body` and insert the
 * outline immediately before it, separated by a blank line on each
 * side. If the body has no H2 (e.g., pre-drafting, still just
 * frontmatter + H1), append outline at the end.
 */
export function joinOutline(outline: string, body: string): string {
  if (!outline) return body;
  const outlineTrimmed = outline.replace(/\n+$/, '');
  const bodyLines = body.split('\n');
  const firstH2 = bodyLines.findIndex((line) => /^##[ \t]+/.test(line));
  if (firstH2 < 0) {
    // No H2 in body — append outline to the end. Preserves the
    // scaffold shape where only frontmatter + H1 exist yet.
    const trailingNewline = body.endsWith('\n') ? '' : '\n';
    return `${body}${trailingNewline}\n${outlineTrimmed}\n`;
  }
  const before = bodyLines.slice(0, firstH2);
  const after = bodyLines.slice(firstH2);
  // Ensure exactly one blank line separates outline from the
  // following H2, and that the outline ends without trailing
  // newlines (we control the separator).
  while (before.length > 0 && before[before.length - 1] === '') {
    before.pop();
  }
  return [...before, '', outlineTrimmed, '', ...after].join('\n');
}
