/**
 * remark plugin: strip the first H1 from rendered markdown output.
 *
 * Many voice patterns repeat the title above the body (a print-magazine
 * convention that reorients the reader after a page turn). On a scrolling
 * web document the convention reads as repetition — the BlogLayout header
 * already renders the title from frontmatter, so the markdown body's
 * leading `# Title` appears as a second copy right under the feature
 * image. This plugin drops that first H1 from the rendered tree while
 * leaving the markdown file intact (so the `.md` still validates as a
 * standalone document and the operator keeps writing `# Title` at the
 * top of the body per voice guidance).
 *
 * Stripping shape: find the first top-level H1 in the document and
 * remove it. All other H1s (rare in these posts, but possible) are
 * preserved. No-op when the document has no leading H1.
 */

export default function remarkStripFirstH1() {
  return (tree) => {
    const children = tree.children;
    const idx = children.findIndex((n) => n.type === 'heading' && n.depth === 1);
    if (idx < 0) return;
    children.splice(idx, 1);
  };
}
