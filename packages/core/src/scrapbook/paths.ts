/**
 * Scrapbook path resolvers.
 *
 * Public surface (entry-aware family — refactor-proof):
 *   - `scrapbookDirAtPath(projectRoot, config, site, relPath)` — resolve
 *     a scrapbook dir for an arbitrary fs-relative path under the site's
 *     content directory.
 *   - `scrapbookDirForEntry(projectRoot, config, site, entry, index)` —
 *     the canonical resolver. Looks up the entry's bound file via the
 *     content index when the entry has an id; falls back to the private
 *     slug-template path internally for legacy / pre-sidecar entries.
 *   - `scrapbookFilePathAtDir(scrapbookDirAbs, filename, opts)` — resolve
 *     a filename inside an already-resolved scrapbook dir, with
 *     traversal protection.
 *
 * Private (internal — no longer exported from `@deskwork/core/scrapbook`):
 *   - `_scrapbookDirSlug(projectRoot, config, site, slug)` — resolve a
 *     scrapbook dir by slug-template addressing
 *     (`<contentDir>/<slug>/scrapbook`). Used as the fallback inside
 *     `scrapbookDirForEntry` when an entry has no id binding yet, and
 *     by other internal helpers in the scrapbook module family that
 *     accept a slug. The legacy public name `scrapbookDir` was removed
 *     in #192 because it gave callers a way to write to the wrong path
 *     for entries whose on-disk file diverges from the slug template.
 *   - `_scrapbookFilePathSlug(projectRoot, config, site, slug, filename, opts)`
 *     — resolve a filename via the slug-template path. Used internally
 *     by the legacy slug-keyed read helpers (`readScrapbookFile`,
 *     `listScrapbook`, `countScrapbook`).
 *
 * The private helpers are not re-exported from the barrel
 * (`packages/core/src/scrapbook.ts`) and are not in
 * `package.json#exports["./scrapbook"]`. External callers must go
 * through `scrapbookDirForEntry` (entry-aware) or `scrapbookDirAtPath`
 * (path-aware).
 */

import { dirname, join, resolve } from 'node:path';
import type { DeskworkConfig } from '../config.ts';
import type { ContentIndex } from '../content-index.ts';
import {
  findEntryFile,
  resolveBlogPostDir,
  resolveContentDir,
} from '../paths.ts';
import { assertFilename, assertSlug } from './validation.ts';
import { SECRET_SUBDIR, type ScrapbookLocation } from './types.ts';

// ---------------------------------------------------------------------------
// Private — slug-template (used as fallback inside the entry-aware family)
// ---------------------------------------------------------------------------

/**
 * INTERNAL — slug-template scrapbook dir resolver.
 *
 * Resolves to `<contentDir>/<slug>/scrapbook`. Used as the fallback
 * inside `scrapbookDirForEntry` when an entry has no id binding yet,
 * and by the legacy slug-keyed read helpers
 * (`readScrapbookFile`, `listScrapbook`, `countScrapbook`).
 *
 * NOT exported publicly post-#192 — see file-level docstring.
 */
export function _scrapbookDirSlug(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
): string {
  assertSlug(slug);
  const articleDir = resolveBlogPostDir(projectRoot, config, site, slug);
  return join(articleDir, 'scrapbook');
}

/**
 * INTERNAL — slug-template scrapbook file path.
 *
 * NOT exported publicly post-#192. Mirrors `scrapbookFilePathAtDir`
 * but takes a slug instead of a pre-resolved dir.
 */
export function _scrapbookFilePathSlug(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  opts: ScrapbookLocation = {},
): string {
  return scrapbookFilePathAtDir(
    _scrapbookDirSlug(projectRoot, config, site, slug),
    filename,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Public — path-driven + entry-aware resolvers
// ---------------------------------------------------------------------------

/**
 * Resolve the scrapbook directory for an arbitrary path under the site's
 * content directory. Used by Phase 19c+ callers (e.g. the studio) that
 * already know the fs-relative path of an organizational or tracked node
 * and don't want to re-derive it through the slug regex. The path may
 * contain `/` segments; no `..` or absolute paths allowed.
 *
 * Path-shape validation matches `assertSlug` since the on-disk layout
 * is the same shape — kebab-case segments separated by `/`. Different
 * helper, same constraint.
 */
export function scrapbookDirAtPath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  relPath: string,
): string {
  assertSlug(relPath);
  const articleDir = join(resolveContentDir(projectRoot, config, site), relPath);
  return join(articleDir, 'scrapbook');
}

/**
 * Resolve the scrapbook directory for a tracked calendar entry.
 *
 * This is the canonical public scrapbook-dir resolver post-#192. Callers
 * that previously reached for `scrapbookDir(slug)` go through this
 * helper instead — pass `{ slug }` (id optional) and the resolver will
 * still walk the right path.
 *
 * Derives the scrapbook location from the parent directory of the
 * entry's content file (located via `findEntryFile`, which prefers the
 * frontmatter-id index over the slug template). Falls back to the
 * private slug-template helper (`_scrapbookDirSlug`) for entries that
 * haven't been bound to frontmatter yet (pre-doctor state) — the
 * fallback is internal and the operator never sees a different code
 * path.
 *
 * Refactor-proof: when the operator renames an entry's directory on
 * disk, the next request rebuilds the index and the scrapbook now
 * lives at the new path automatically.
 *
 * @param entry Calendar entry — `id` preferred (Phase 19+); `slug` is
 *              used both as the legacy fallback and to locate the
 *              `<dirname>/scrapbook/` when the entry has no id yet.
 * @param index Optional pre-built index (per-request memoization). When
 *              omitted, this function builds one.
 */
export function scrapbookDirForEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  index?: ContentIndex,
): string {
  const entryId = entry.id ?? '';
  const file = findEntryFile(
    projectRoot,
    config,
    site,
    entryId,
    index,
    // Legacy fallback ON — we want a usable path even for pre-doctor entries.
    { slug: entry.slug },
  );
  if (file === undefined) {
    // No id binding AND no template fallback resolved (template should
    // always resolve since it's just slug substitution; this branch is
    // defensive for empty slugs / future template variants).
    throw new Error(
      `Cannot resolve scrapbook dir: entry has no id binding and no template fallback (slug="${entry.slug}")`,
    );
  }
  return join(dirname(file), 'scrapbook');
}

/**
 * Resolve a filename inside an already-resolved scrapbook directory.
 * Mirrors `listScrapbookAtDir` — used by callers that have already
 * resolved the on-disk dir via `scrapbookDirForEntry` (id-driven) or
 * `scrapbookDirAtPath` (fs-path-driven).
 *
 * Security guards:
 *   - `assertFilename` blocks dotfiles / `..` / absolute paths in the filename
 *   - the `startsWith(dir + '/')` containment check blocks any traversal
 *     that slipped through (so `secret/` always sits inside the top-level
 *     scrapbook dir)
 *
 * The slug-shape validator is bypassed because the caller has already
 * proven the directory exists in the content tree by other means.
 */
export function scrapbookFilePathAtDir(
  scrapbookDirAbs: string,
  filename: string,
  opts: ScrapbookLocation = {},
): string {
  assertFilename(filename);
  const target = opts.secret ? join(scrapbookDirAbs, SECRET_SUBDIR) : scrapbookDirAbs;
  const abs = resolve(target, filename);
  if (!abs.startsWith(scrapbookDirAbs + '/') && abs !== scrapbookDirAbs) {
    throw new Error(
      `resolved path escapes scrapbook dir: "${filename}" → ${abs}`,
    );
  }
  return abs;
}
