// Pure issue-mention extractor used by the close-shipped bundle
// assembler. Phase 15 redesign — replaces the per-walker verb-filtered
// extraction with one mechanical pattern. No grammar, no judgment; the
// agent dispatches downstream do the filtering.

const URL_PATTERN = /https?:\/\/\S*/g;

// Mirror of session-range.ts's regex: `(?:^|[^&\w/])#(\d{1,7})\b`.
// The `[^&\w/]` exclusion drops HTML entities, id fragments, and
// cross-repo refs. The `\d{1,7}` cap matches GitHub's issue-number bound
// with margin.
const MENTION_PATTERN = /(?:^|[^&\w/])#(\d{1,7})\b/g;

export function extractMentions(text: string): ReadonlySet<number> {
  const stripped = text.replace(URL_PATTERN, '');
  const out = new Set<number>();
  MENTION_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_PATTERN.exec(stripped)) !== null) {
    const captured = m[1];
    if (captured === undefined) continue;
    const n = Number.parseInt(captured, 10);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return out;
}
