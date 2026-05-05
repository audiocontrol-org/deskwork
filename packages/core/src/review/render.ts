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
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { parseFrontmatter } from '../frontmatter.ts';
// @ts-expect-error — JS module without a .d.ts; the plugin is plain mdast traversal.
import remarkImageFigure from '../remark-image-figure.mjs';
// @ts-expect-error — JS module without a .d.ts; the plugin is plain mdast traversal.
import remarkStripFirstH1 from '../remark-strip-first-h1.mjs';
// @ts-expect-error — JS module without a .d.ts; the plugin is a plain hast visitor.
import rehypeRewriteScrapbookImages from '../rehype-rewrite-scrapbook-images.mjs';

/** Optional rendering context. When the renderer is invoked from a
 *  surface that has an entry binding (e.g. the studio's review surface),
 *  pass `{ entryId, site }` to enable rewriting of relative
 *  `./scrapbook/<file>` image URLs to the absolute scrapbook-file route
 *  URL the studio serves. Other surfaces leave relative URLs alone so
 *  the markdown source stays portable across renderers. */
export interface RenderOptions {
  readonly entryId?: string;
  readonly site?: string;
}

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
export async function renderMarkdownToHtml(
  markdown: string,
  options: RenderOptions = {},
): Promise<string> {
  // remark-gfm adds GitHub Flavored Markdown — tables, strikethrough,
  // task lists, footnotes, autolinks. Operator-authored content
  // routinely uses tables (audit docs, comparison matrices); without
  // gfm those rendered as raw `| col | col |` text on the review
  // surface.
  // Studio-surface scrapbook URL rewrite — only fires when both
  // `entryId` and `site` are provided. The markdown source is expected
  // to use portable relative URLs like `./scrapbook/<file>`; the
  // rewrite produces the absolute scrapbook-file route URL that the
  // studio serves at runtime. Other call sites (published-site
  // rendering, tests with no entry binding) leave the relative URLs
  // alone so the markdown stays renderable in GitHub / VS Code / any
  // other markdown viewer.
  const studioRewrite =
    options.entryId && options.site
      ? { entryId: options.entryId, site: options.site }
      : null;
  const base = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkStripFirstH1)
    .use(remarkImageFigure)
    .use(remarkRehype);
  const withRewrite = studioRewrite
    ? base.use(rehypeRewriteScrapbookImages, studioRewrite)
    : base;
  const result = await withRewrite.use(rehypeStringify).process(markdown);
  return String(result);
}
