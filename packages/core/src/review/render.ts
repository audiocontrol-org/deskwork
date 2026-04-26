/**
 * Render a draft's markdown body as HTML for the studio review surface.
 *
 * Frontmatter parsing reuses the main lib/frontmatter module so the
 * shape stays consistent across deskwork. Markdown → HTML uses unified
 * + remark + rehype; the studio renders the HTML into the same
 * BlogLayout-equivalent that the published site would use.
 *
 * Mirrors the public Astro pipeline: the body's leading `# Title` is
 * stripped (BlogLayout / review shell renders title from frontmatter,
 * the body repeat is a print-magazine convention that reads as
 * throat-clearing on the web) and standalone images are wrapped in
 * `<figure><figcaption>`. Outline-strip is NOT added here on purpose —
 * the review surface needs the outline visible for annotate-and-iterate
 * work.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { parseFrontmatter } from '../frontmatter.ts';
// @ts-expect-error — JS module without a .d.ts; the plugin is plain mdast traversal.
import remarkImageFigure from '../remark-image-figure.mjs';
// @ts-expect-error — JS module without a .d.ts; the plugin is plain mdast traversal.
import remarkStripFirstH1 from '../remark-strip-first-h1.mjs';

export interface ParsedDraft {
  /** Frontmatter values. Values are whatever YAML parses them to. */
  frontmatter: Record<string, unknown>;
  /** Everything after the closing `---`. */
  body: string;
}

/** Split a draft into its frontmatter and body. */
export function parseDraftFrontmatter(markdown: string): ParsedDraft {
  const { data, body } = parseFrontmatter(markdown);
  return { frontmatter: data, body };
}

/** Render a markdown string as HTML. */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkStripFirstH1)
    .use(remarkImageFigure)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return String(result);
}
