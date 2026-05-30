/**
 * artifactKind detection.
 *
 * `detectArtifactKind(artifactPath)` classifies an on-disk path as one
 * of the four supported artifact kinds (`markdown`, `html-mockup`,
 * `single-file-html`, `image`). Refuses unrecognized shapes with a
 * descriptive error listing every supported extension, AND refuses
 * non-existent paths with a separate actionable error.
 *
 * Detection logic:
 *
 *   - non-existent path                            → throws (AUDIT-20260530-09)
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
 *
 * Per AUDIT-20260530-09 (cross-model: claude + codex), the existence
 * probe runs FIRST for every dispatch branch. Pre-fix, only the
 * html-mockup branch touched disk, so `detectArtifactKind('/deleted/
 * post.md')` returned `'markdown'` for a non-existent file while a
 * deleted html-mockup threw. Asymmetric failure modes for the same
 * root cause. The probe now refuses the missing-artifact case loudly
 * regardless of extension.
 */

import { existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { ArtifactKind } from './types.ts';

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
]);

// Derived from IMAGE_EXTENSIONS so a future image-extension addition
// auto-updates the error message. Sorted for deterministic test output.
const SUPPORTED_EXTENSIONS_HELP = [
  '.md',
  '<dir>/index.html',
  '.html',
  ...[...IMAGE_EXTENSIONS].sort(),
].join(', ');

/**
 * Classify `artifactPath` into one of the four supported artifact
 * kinds. Throws with a clear, listing-style error for unrecognized
 * extensions or shapes.
 */
export function detectArtifactKind(artifactPath: string): ArtifactKind {
  // Up-front existence probe — every dispatch branch downstream
  // depends on the artifact actually existing on disk. Pre-AUDIT-09
  // only the html-mockup branch touched disk; .md / .html / image
  // branches dispatched on extname alone, so a missing markdown
  // path returned 'markdown' while a missing html-mockup directory
  // threw. The probe normalizes the failure mode: any non-existent
  // path throws the same actionable "artifact does not exist" error
  // regardless of extension.
  if (!existsSync(artifactPath)) {
    throw new Error(
      `detectArtifactKind: artifact does not exist at ${artifactPath}. `
      + `The caller must hand a path that exists on disk; this function `
      + `does not synthesize a kind for missing artifacts. Supported: `
      + `${SUPPORTED_EXTENSIONS_HELP}`,
    );
  }

  // Directory case takes precedence: if the path is an existing
  // directory with an index.html inside, it's an html-mockup. We
  // check the isDirectory case before extname because `extname` on a
  // directory path can produce surprising results (e.g. `.com` for
  // `foo.com/`); the statSync probe avoids that ambiguity.
  if (statSync(artifactPath).isDirectory()) {
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
