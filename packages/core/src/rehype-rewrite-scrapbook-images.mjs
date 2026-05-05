/**
 * Rewrite relative `<img src>` paths that point into the entry's
 * scrapbook so the studio's review surface can serve them via the
 * scrapbook-file route.
 *
 * Why this exists: an audit doc / draft / spec authored alongside a
 * `scrapbook/` directory will reference its assets with relative URLs
 * like `![alt](./scrapbook/figure-1.png)` or `![alt](scrapbook/figure-1.png)`.
 * Those relative URLs render correctly in any normal markdown viewer
 * (GitHub, VS Code, IDE preview) because the renderer resolves them
 * against the file's location on disk. On the studio's review surface
 * the page URL is `/dev/editorial-review/entry/<uuid>`, so the same
 * relative URL would resolve to a path the studio doesn't serve. This
 * plugin rewrites those `<img src>` values to the absolute scrapbook-file
 * route URL, which the studio DOES serve.
 *
 * The markdown source stays portable. The plugin only fires when the
 * renderer is given `{ entryId, site }` options (i.e. the studio's
 * review surface). Other call sites (e.g. published-site rendering)
 * leave the relative URLs alone.
 *
 * @typedef {object} Options
 * @property {string} entryId  Entry UUID. Required.
 * @property {string} site     Site/collection slug. Required.
 *
 * @param {Options} options
 * @returns {(tree: any) => void}
 */
export default function rehypeRewriteScrapbookImages(options) {
  const { entryId, site } = options || {};
  if (!entryId || !site) {
    throw new Error(
      'rehypeRewriteScrapbookImages: { entryId, site } are required',
    );
  }

  const baseUrl =
    `/api/dev/scrapbook-file` +
    `?site=${encodeURIComponent(site)}` +
    `&entryId=${encodeURIComponent(entryId)}`;

  /** @param {string} src */
  function rewrite(src) {
    // Match leading `./scrapbook/<filename>` or `scrapbook/<filename>`.
    // Don't rewrite absolute URLs (`http://`, `https://`, `/api/...`),
    // anchor links (`#...`), data URIs (`data:...`), or paths into a
    // sibling directory other than scrapbook.
    const m = src.match(/^(?:\.\/)?scrapbook\/([^/?#]+)$/);
    if (!m) return null;
    const filename = m[1];
    return `${baseUrl}&name=${encodeURIComponent(filename)}`;
  }

  return function transformer(tree) {
    visit(tree, 'element', (node) => {
      if (!node || node.tagName !== 'img') return;
      if (!node.properties || typeof node.properties.src !== 'string') return;
      const newSrc = rewrite(node.properties.src);
      if (newSrc) node.properties.src = newSrc;
    });
  };
}

/**
 * Minimal hast visitor — walks every node depth-first, calls visitor
 * for nodes whose `type` matches.
 *
 * @param {any} tree
 * @param {string} typeFilter
 * @param {(node: any) => void} fn
 */
function visit(tree, typeFilter, fn) {
  if (!tree) return;
  if (tree.type === typeFilter) fn(tree);
  if (Array.isArray(tree.children)) {
    for (const child of tree.children) visit(child, typeFilter, fn);
  }
}
