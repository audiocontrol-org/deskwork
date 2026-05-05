/**
 * Scrapbook text-content helpers — pure Buffer/string utilities for
 * rendering closed-state previews and per-kind meta strings.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip a YAML frontmatter block from the top of an md file. Only strips
 * the leading `---\n...\n---\n` block; body-level `---` separators (Setext
 * H2 underline, thematic break) are preserved because the function only
 * looks at the first 4 chars for the opener.
 */
export function stripFrontmatter(text: string): string {
  if (!text.startsWith('---\n')) return text;
  const closeIdx = text.indexOf('\n---\n', 4);
  if (closeIdx < 0) return text;
  return text.slice(closeIdx + 5).replace(/^\n+/, '');
}

/**
 * Build the closed-state preview excerpt for md/json/txt. Returns null
 * when there's nothing useful to render — empty file, frontmatter-only
 * file, or binary masquerading as text — so the caller can omit the
 * preview block entirely (matches "other" kind treatment, avoids the
 * 6rem min-height void).
 *
 * For json: pretty-print via JSON.parse + JSON.stringify(_, null, 2) so
 * minified single-line files still render multi-line. Falls back to raw
 * content on parse error (bad JSON is still readable as text).
 *
 * Binary detection: NUL byte presence after UTF-8 decode. Real text
 * almost never has NUL; binary files have it within the first KB.
 */
export function previewExcerpt(buf: Buffer, kind: 'md' | 'json' | 'txt'): string | null {
  let text = buf.subarray(0, Math.min(buf.byteLength, 2400)).toString('utf-8');
  if (text.indexOf('\0') >= 0) return null;
  if (kind === 'md') text = stripFrontmatter(text);
  if (kind === 'json') {
    try {
      const fullText = buf.toString('utf-8');
      text = JSON.stringify(JSON.parse(fullText), null, 2);
    } catch {
      // Invalid JSON — fall through to the raw-text excerpt below.
    }
  }
  const excerpt = text.split('\n').slice(0, 8).join('\n').slice(0, 600);
  if (excerpt.trim() === '') return null;
  return excerpt;
}

/**
 * Count lines in a text file: number of `\n` bytes plus 1 if the last
 * byte isn't `\n` (so a 3-line file whether or not it has a trailing
 * newline reports 3).
 */
export function countLines(buf: Buffer): number {
  let count = 0;
  for (const b of buf) if (b === 0x0a) count++;
  if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) count++;
  return count;
}

/**
 * Count top-level keys in a JSON object. Returns null if the file is not
 * valid JSON or its root is not a plain object (arrays, primitives →
 * null; caller renders no extra meta).
 */
export function countJsonKeys(buf: Buffer): number | null {
  try {
    const obj: unknown = JSON.parse(buf.toString('utf-8'));
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.keys(obj).length;
    }
    return null;
  } catch {
    return null;
  }
}
