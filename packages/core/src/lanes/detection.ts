/**
 * artifactKind detection.
 *
 * `detectArtifactKind(artifactPath)` classifies an on-disk path as one
 * of the four supported artifact kinds (`markdown`, `html-mockup`,
 * `single-file-html`, `image`). Refuses unrecognized shapes with a
 * descriptive error listing every supported extension.
 *
 * Detection logic:
 *
 *   - `.md` extension                              → `'markdown'`
 *   - directory containing `<dir>/index.html`      → `'html-mockup'`
 *   - loose `.html` file                           → `'single-file-html'`
 *   - `.png` / `.jpg` / `.jpeg` / `.gif` /
 *     `.webp` / `.svg` extensions                  → `'image'`
 *   - anything else                                → throws
 *
 * The path may be a file OR a directory. The `html-mockup` case
 * specifically requires the path to be a directory AND for an
 * `index.html` to exist inside it; a directory with no index.html is
 * NOT an html-mockup and the function falls through to the
 * "unrecognized" refusal path.
 */

import { existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { ArtifactKind } from './types.ts';

const SUPPORTED_EXTENSIONS_HELP =
  '.md, <dir>/index.html, .html, .png, .jpg, .jpeg, .gif, .webp, .svg';

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
]);

/**
 * Classify `artifactPath` into one of the four supported artifact
 * kinds. Throws with a clear, listing-style error for unrecognized
 * extensions or shapes.
 */
export function detectArtifactKind(artifactPath: string): ArtifactKind {
  // Directory case takes precedence: if the path is an existing
  // directory with an index.html inside, it's an html-mockup. We
  // check existence first because `extname` on a directory path can
  // produce surprising results (e.g. `.com` for `foo.com/`); the
  // existsSync+statSync probe avoids that ambiguity.
  if (existsSync(artifactPath) && statSync(artifactPath).isDirectory()) {
    const indexHtml = join(artifactPath, 'index.html');
    if (existsSync(indexHtml)) {
      return 'html-mockup';
    }
    throw new Error(
      `detectArtifactKind: directory at ${artifactPath} has no index.html `
      + `and is not a recognized artifact shape. Supported: ${SUPPORTED_EXTENSIONS_HELP}`,
    );
  }

  const ext = extname(artifactPath).toLowerCase();
  if (ext === '.md') {
    return 'markdown';
  }
  if (ext === '.html') {
    return 'single-file-html';
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }

  throw new Error(
    `detectArtifactKind: unsupported artifact extension at ${artifactPath}. `
    + `Supported: ${SUPPORTED_EXTENSIONS_HELP}`,
  );
}
