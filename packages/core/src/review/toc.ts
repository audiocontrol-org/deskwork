/**
 * Table-of-contents extractor for the review surface (#244).
 *
 * Walks the rendered HTML for h2/h3/h4 elements and returns a flat list
 * of `{ depth, id, text }` entries. The renderer (`renderMarkdownToHtml`)
 * runs `rehype-slug` so every heading already has a slugified `id`
 * attribute — the extractor here just reads them.
 *
 * Intentionally lightweight: pattern-matches the rendered HTML rather
 * than re-parsing through hast. The renderer's HTML shape is stable
 * (rehype-stringify always emits the same canonical form: lowercase
 * tag, attributes in encounter order, `id` first because rehype-slug
 * sets it before any other attribute we add). If a future renderer
 * change emits different shape, the extractor's tests will catch it.
 *
 * Why h2/h3/h4 only:
 *   - h1 is stripped from the body via `remarkStripFirstH1` (the title
 *     comes from frontmatter; the body's leading h1 is throat-clearing).
 *   - h5/h6 are deeper than the operator's mental "shape of this doc"
 *     framing — including them produces a TOC that's noisier than the
 *     document.
 */

export interface TocEntry {
  /** Heading depth: 2, 3, or 4. */
  readonly depth: 2 | 3 | 4;
  /** Slugified id assigned by `rehype-slug`. */
  readonly id: string;
  /** Plain-text of the heading's content (HTML tags stripped). */
  readonly text: string;
}

const HEADING_RE = /<h([234])([^>]*)>([\s\S]*?)<\/h\1>/g;
const ID_RE = /\bid="([^"]+)"/;

export function extractToc(html: string): TocEntry[] {
  const out: TocEntry[] = [];
  for (const match of html.matchAll(HEADING_RE)) {
    const depth = Number(match[1]) as 2 | 3 | 4;
    const attrs = match[2] ?? '';
    const inner = match[3] ?? '';
    const idMatch = ID_RE.exec(attrs);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (!id) continue;
    const text = stripTags(inner).trim();
    if (!text) continue;
    out.push({ depth, id, text });
  }
  return out;
}

/** Strip HTML tags from a fragment, leaving only text content. */
function stripTags(html: string): string {
  // Decode the small set of entities we know rehype-stringify emits in
  // heading text. Anything else passes through.
  const stripped = html.replace(/<[^>]+>/g, '');
  return stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
