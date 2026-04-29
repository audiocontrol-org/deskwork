/**
 * remark plugin: wrap standalone markdown images in <figure> with a
 * <figcaption> sourced from the alt text.
 *
 * Why: authors writing `![caption](src)` expect the alt text to
 * double as a visible figure caption (magazine convention). Plain
 * Astro rendering emits `<p><img alt="caption"/></p>`, which hides
 * the caption and nests the image inside a paragraph — wrong shape
 * for a figure.
 *
 * What we do: find paragraphs containing exactly one image (and no
 * other meaningful content), rewrite that paragraph as a `<figure>`,
 * and emit a `<figcaption>` with the alt text. The alt attribute on
 * the image is preserved for accessibility — screen readers still
 * hear it, sighted readers now see it too.
 *
 * Scoped to paragraphs where the image stands alone. Inline images
 * (text + `![]()` on the same line) are left as-is — those are
 * intentionally mid-flow and shouldn't become block-level figures.
 *
 * No-op when the document has no standalone images. Safe to register
 * alongside `remark-strip-outline`.
 */

/**
 * A paragraph "wraps" a single image iff its children are either
 * (a) an image node, or (b) whitespace-only text — nothing else.
 * Handles the trailing-newline case that some parsers emit.
 */
function findSoloImage(paragraph) {
  if (!paragraph.children || paragraph.children.length === 0) return null;
  let image = null;
  for (const child of paragraph.children) {
    if (child.type === 'image') {
      if (image) return null; // two images → not a solo figure
      image = child;
      continue;
    }
    if (child.type === 'text' && child.value.trim() === '') continue;
    return null; // non-whitespace, non-image content → not a solo figure
  }
  return image;
}

export default function remarkImageFigure() {
  return (tree) => {
    for (const node of tree.children) {
      if (node.type !== 'paragraph') continue;
      const image = findSoloImage(node);
      if (!image) continue;
      const alt = typeof image.alt === 'string' ? image.alt : '';
      // Convert the paragraph itself into the figure. The image node
      // renders as-is via mdast-util-to-hast's default handler; we
      // append a synthetic caption node that rehype emits as
      // `<figcaption>`.
      node.data = node.data || {};
      node.data.hName = 'figure';
      node.data.hProperties = { className: ['blog-figure'] };
      // When alt is empty, emit the figure without a caption (rare —
      // typically hero images use an empty alt to avoid double-
      // captioning the visible heading above them).
      if (alt.length > 0) {
        node.children = [
          image,
          {
            type: 'paragraph',
            data: {
              hName: 'figcaption',
              hProperties: { className: ['blog-figcaption'] },
            },
            children: [{ type: 'text', value: alt }],
          },
        ];
      }
    }
  };
}
