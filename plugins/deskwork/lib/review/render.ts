/**
 * Render a draft's markdown body as HTML for the studio review surface.
 *
 * Frontmatter parsing reuses the main lib/frontmatter module so shape
 * stays consistent across deskwork. Markdown → HTML uses unified +
 * remark + rehype; the studio renders the HTML into the same
 * BlogLayout-equivalent that the published site would use.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { parseFrontmatter } from '../frontmatter.ts';

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
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return String(result);
}
