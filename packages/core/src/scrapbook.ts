/**
 * Scrapbook helpers — the per-article `<contentDir>/<slug>/scrapbook/`
 * directory. The scrapbook is a working-notes home for receipts,
 * research, and references attached to an in-flight article. Committed
 * to git alongside the article; not baked to the public site.
 *
 * Responsibilities:
 *   - Resolve + validate slug + filename (reject `..`, absolute paths,
 *     and anything outside the article's scrapbook dir)
 *   - List + read + mutate files inside one scrapbook
 *   - Classify files by extension into the design type buckets
 *   - Format relative mtime + total size for the studio chip / viewer
 *
 * The API endpoints that wrap these helpers should 404 in PROD; this
 * library contains no PROD check of its own (enforcement stays at the
 * endpoint boundary).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import type { DeskworkConfig } from './config.ts';
import type { ContentIndex } from './content-index.ts';
import { findEntryFile, resolveBlogPostDir, resolveContentDir } from './paths.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Type buckets for scrapbook entries. */
export type ScrapbookItemKind =
  | 'md'
  | 'json'
  | 'js'
  | 'img'
  | 'txt'
  | 'other';

export interface ScrapbookItem {
  name: string;
  kind: ScrapbookItemKind;
  size: number;
  mtime: string; // ISO8601
}

export interface ScrapbookSummary {
  site: string;
  /**
   * The scrapbook's location identifier — a slug for entries tied to a
   * calendar row, or any directory path within `contentDir` for
   * scrapbooks that hang off purely organizational nodes (e.g. an
   * intermediate project directory that isn't itself a calendar entry).
   */
  slug: string;
  dir: string; // absolute path to the scrapbook root directory
  exists: boolean;
  /** Files at the top of `scrapbook/` (public/published-side notes). */
  items: ScrapbookItem[];
  /**
   * Files inside `scrapbook/secret/` — never to be published. Operators
   * can drop research, drafts, or sensitive notes here knowing the host
   * project's content collection patterns won't pick them up.
   */
  secretItems: ScrapbookItem[];
}

/** Well-known subdirectory name for editorially-private scrapbook items. */
export const SECRET_SUBDIR = 'secret';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * A single slug segment — kebab-case lowercase. Used both for flat
 * slugs and as the building block of hierarchical paths.
 */
const SLUG_SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A full slug path — one or more `/`-separated kebab-case segments.
 * Accepts both legacy flat slugs ("scsi-over-wifi") and hierarchical
 * paths ("the-outbound/characters/strivers"). No leading or trailing
 * slash; no empty segments.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
const FILENAME_RE = /^[a-zA-Z0-9._-][a-zA-Z0-9._ -]*$/;

export function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid slug "${slug}" — must match ${SLUG_RE}`);
  }
}

/**
 * Split a hierarchical slug into its segments. Each segment is a
 * standalone kebab-case identifier.
 */
export function slugSegments(slug: string): string[] {
  return slug.split('/');
}

/**
 * True if a slug refers to a nested entry (has at least one `/`).
 */
export function isNestedSlug(slug: string): boolean {
  return slug.includes('/');
}

// `SLUG_SEGMENT_RE` is exported for callers that need to validate one
// segment at a time (e.g. when assembling a path interactively).
export { SLUG_SEGMENT_RE };

export function assertFilename(name: string): void {
  if (!name || name === '.' || name === '..') {
    throw new Error(`invalid filename "${name}"`);
  }
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`filename may not contain path separators: "${name}"`);
  }
  if (name.startsWith('.')) {
    // Dotfiles are suspicious for a dev-only operator UI. Reject.
    throw new Error(`filename may not start with a dot: "${name}"`);
  }
  if (!FILENAME_RE.test(name)) {
    throw new Error(
      `filename may only contain [A-Za-z0-9._ -]: "${name}"`,
    );
  }
  if (name.length > 200) {
    throw new Error(`filename too long (> 200 chars): "${name}"`);
  }
}

/**
 * Resolve the scrapbook directory for (site, slug) and ensure the
 * return path stays inside the site's content directory.
 * Doesn't require the directory to exist.
 */
export function scrapbookDir(
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
 * Derives the scrapbook location from the parent directory of the
 * entry's content file (located via `findEntryFile`, which prefers the
 * frontmatter-id index over the slug template). Falls back to today's
 * slug-based addressing for entries that haven't been bound to
 * frontmatter yet (pre-doctor state).
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

/** Options that select between the public scrapbook root and `secret/`. */
export interface ScrapbookLocation {
  /** When true, the file lives under `scrapbook/secret/`. Default: false. */
  secret?: boolean;
}

/**
 * Resolve a filename INSIDE a scrapbook dir and return the absolute
 * path. Throws if the resolved path escapes the scrapbook dir (guards
 * against `..` sequences that slipped through assertFilename).
 *
 * When `opts.secret` is true, the returned path is rooted at
 * `<scrapbook>/secret/<filename>` instead of `<scrapbook>/<filename>`.
 */
export function scrapbookFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  opts: ScrapbookLocation = {},
): string {
  return scrapbookFilePathAtDir(
    scrapbookDir(projectRoot, config, site, slug),
    filename,
    opts,
  );
}

/**
 * Resolve a filename inside an already-resolved scrapbook directory.
 * Mirrors `listScrapbookAtDir` — used by callers that have already
 * resolved the on-disk dir via `scrapbookDirForEntry` (id-driven) or
 * `scrapbookDirAtPath` (fs-path-driven) and don't want to re-derive
 * through the slug template.
 *
 * Same security guards as `scrapbookFilePath`:
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

// ---------------------------------------------------------------------------
// Type classification
// ---------------------------------------------------------------------------

export function classify(filename: string): ScrapbookItemKind {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.md':
    case '.markdown':
      return 'md';
    case '.json':
    case '.jsonl':
      return 'json';
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.ts':
    case '.tsx':
    case '.mts':
      return 'js';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.webp':
    case '.svg':
      return 'img';
    case '.txt':
    case '.log':
      return 'txt';
    default:
      return 'other';
  }
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/**
 * List the items in a scrapbook, sorted newest-mtime first. Returns
 * both public items (top-level files) and secret items (files inside
 * `scrapbook/secret/`). Subdirectories at the top level OTHER than
 * `secret/` are ignored — deskwork doesn't recurse into arbitrary
 * trees inside a scrapbook.
 */
export function listScrapbook(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
): ScrapbookSummary {
  const dir = scrapbookDir(projectRoot, config, site, slug);
  return listScrapbookAtDir(site, slug, dir);
}

/**
 * List a scrapbook by absolute directory path. Used by callers that
 * have already resolved the on-disk path via `scrapbookDirForEntry`
 * (id-driven) or `scrapbookDirAtPath` (fs-path-driven) and don't want
 * to re-derive through the slug template. The `slug` parameter is only
 * used to populate the returned summary's identifier field — it does
 * not influence path resolution.
 *
 * Internal primitive shared by `listScrapbook` (slug-based) and
 * `listScrapbookForEntry` (id-driven).
 */
export function listScrapbookAtDir(
  site: string,
  slug: string,
  dir: string,
): ScrapbookSummary {
  if (!existsSync(dir)) {
    return { site, slug, dir, exists: false, items: [], secretItems: [] };
  }
  const items = listFilesInDir(dir);
  const secretDir = join(dir, SECRET_SUBDIR);
  const secretItems = existsSync(secretDir) ? listFilesInDir(secretDir) : [];
  return { site, slug, dir, exists: true, items, secretItems };
}

/**
 * List scrapbook items for a tracked calendar entry. Resolves the
 * scrapbook directory via the content index when available (id binding),
 * falling back to slug-based addressing for entries that haven't been
 * bound to frontmatter yet (pre-doctor state).
 *
 * Mirrors the shape of `countScrapbookForEntry`. Used by the studio
 * review-page drawer + content-detail panel so writingcontrol-shape
 * entries (where the file path diverges from the slug template) list
 * items at the correct on-disk location.
 *
 * @param entry Calendar entry — `id` preferred; `slug` is both the
 *              legacy fallback and the disambiguator the underlying
 *              resolver uses when the index is incomplete.
 * @param index Optional pre-built per-request index. When omitted, the
 *              resolver builds one on demand.
 */
export function listScrapbookForEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  index?: ContentIndex,
): ScrapbookSummary {
  const dir = scrapbookDirForEntry(projectRoot, config, site, entry, index);
  return listScrapbookAtDir(site, entry.slug, dir);
}

/** Internal helper — list files (not subdirs/dotfiles) at a given path. */
function listFilesInDir(dir: string): ScrapbookItem[] {
  const items: ScrapbookItem[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    if (e.name.startsWith('.')) continue;
    const abs = join(dir, e.name);
    const st = statSync(abs);
    items.push({
      name: e.name,
      kind: classify(e.name),
      size: st.size,
      mtime: st.mtime.toISOString(),
    });
  }
  items.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return items;
}

/**
 * Count items inside an absolute scrapbook directory — files at the top
 * level plus files inside the `secret/` subdirectory. Returns 0 if the
 * directory doesn't exist; tolerates fs errors so a transient permission
 * issue or race never crashes the dashboard render. Internal primitive
 * shared by `countScrapbook` (slug-based) and `countScrapbookForEntry`
 * (id-driven).
 */
function countScrapbookAtDir(dir: string): number {
  try {
    if (!existsSync(dir)) return 0;
    const top = listFilesInDir(dir);
    const secretDir = join(dir, SECRET_SUBDIR);
    const secret = existsSync(secretDir) ? listFilesInDir(secretDir) : [];
    return top.length + secret.length;
  } catch {
    return 0;
  }
}

/**
 * Total item count (public + secret). Used by the studio chip for the
 * badge — operators want a single "has scrapbook content" signal that
 * counts everything attached to this entry.
 *
 * Slug-based addressing: resolves `<contentDir>/<slug>/scrapbook/`. For
 * entries whose on-disk path doesn't match the slug template (e.g.
 * writingcontrol-shape projects where slug `the-outbound` lives at
 * `projects/the-outbound/index.md`), use `countScrapbookForEntry`
 * instead — it derives the path from the bound file via the content
 * index.
 */
export function countScrapbook(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
): number {
  try {
    const dir = scrapbookDir(projectRoot, config, site, slug);
    return countScrapbookAtDir(dir);
  } catch {
    return 0;
  }
}

/**
 * Count scrapbook items for a tracked calendar entry. Resolves the
 * scrapbook directory via the content index when available (id binding),
 * falling back to slug-based addressing for entries that haven't been
 * bound to frontmatter yet (pre-doctor state).
 *
 * Mirrors the shape of `scrapbookDirForEntry` — same resolver, same
 * legacy-slug fallback. Used by the studio dashboard chip so writing-
 * control-shape entries (where the file path diverges from the slug
 * template) report the correct count.
 *
 * @param entry Calendar entry — `id` preferred (Phase 19+); `slug` is
 *              both the legacy fallback and the disambiguator the
 *              underlying resolver uses when the index is incomplete.
 * @param index Optional pre-built per-request index. When omitted, the
 *              resolver builds one on demand.
 */
export function countScrapbookForEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  index?: ContentIndex,
): number {
  try {
    const dir = scrapbookDirForEntry(projectRoot, config, site, entry, index);
    return countScrapbookAtDir(dir);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function readScrapbookFile(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  opts: ScrapbookLocation = {},
): {
  name: string;
  kind: ScrapbookItemKind;
  size: number;
  mtime: string;
  content: Buffer;
} {
  return readScrapbookFileAtDir(
    scrapbookDir(projectRoot, config, site, slug),
    filename,
    opts,
  );
}

/**
 * Read a scrapbook file given the absolute scrapbook directory. Used
 * by callers that have already resolved the on-disk dir via
 * `scrapbookDirForEntry` (id-driven) or `scrapbookDirAtPath`
 * (fs-path-driven) and don't want to re-derive through the slug
 * template. Mirrors the listing-side primitive `listScrapbookAtDir`.
 *
 * Same security guards as `readScrapbookFile` (filename validation +
 * path-traversal containment) via `scrapbookFilePathAtDir`.
 */
export function readScrapbookFileAtDir(
  scrapbookDirAbs: string,
  filename: string,
  opts: ScrapbookLocation = {},
): {
  name: string;
  kind: ScrapbookItemKind;
  size: number;
  mtime: string;
  content: Buffer;
} {
  const abs = scrapbookFilePathAtDir(scrapbookDirAbs, filename, opts);
  if (!existsSync(abs)) throw new Error(`not found: ${filename}`);
  const st = statSync(abs);
  if (!st.isFile()) throw new Error(`not a file: ${filename}`);
  const content = readFileSync(abs);
  return {
    name: filename,
    kind: classify(filename),
    size: st.size,
    mtime: st.mtime.toISOString(),
    content,
  };
}

/**
 * Read a scrapbook file for a tracked calendar entry. Mirrors
 * `listScrapbookForEntry` / `countScrapbookForEntry` — id-driven
 * resolution via `scrapbookDirForEntry`, slug fallback for pre-bound
 * entries. Used by the studio's `/api/dev/scrapbook-file?entryId=...`
 * variant so projects whose feature-doc layout doesn't match the
 * kebab-case slug template (e.g. `docs/<version>/<status>/<feature>/`)
 * can still serve scrapbook assets — `scrapbookDirAtPath`'s slug
 * validator would otherwise reject any path with dots or uppercase
 * segments.
 *
 * Same security guards as the slug-shape variant: `assertFilename`
 * blocks dotfiles / `..` / absolute paths in the filename; the
 * `startsWith(dir + '/')` containment check blocks any traversal that
 * slipped through.
 */
export function readScrapbookFileForEntry(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  entry: { id?: string; slug: string },
  filename: string,
  opts: ScrapbookLocation = {},
  index?: ContentIndex,
): {
  name: string;
  kind: ScrapbookItemKind;
  size: number;
  mtime: string;
  content: Buffer;
} {
  return readScrapbookFileAtDir(
    scrapbookDirForEntry(projectRoot, config, site, entry, index),
    filename,
    opts,
  );
}

/**
 * Create a new markdown note in the scrapbook. Creates the scrapbook
 * dir (and `secret/` subdir, if needed) if it doesn't exist. Refuses
 * to overwrite existing files.
 */
export function createScrapbookMarkdown(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  body: string,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  if (!filename.endsWith('.md')) {
    throw new Error(`create endpoint only accepts .md files: "${filename}"`);
  }
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename, opts);
  if (existsSync(abs)) {
    throw new Error(`file already exists: "${filename}"`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, 'utf-8');
  const st = statSync(abs);
  return {
    name: filename,
    kind: 'md',
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

/** Overwrite an existing file's contents. Refuses if the file is absent. */
export function saveScrapbookFile(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  body: string | Buffer,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename, opts);
  if (!existsSync(abs)) throw new Error(`file not found: "${filename}"`);
  writeFileSync(abs, body);
  const st = statSync(abs);
  return {
    name: filename,
    kind: classify(filename),
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

export function renameScrapbookFile(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  oldName: string,
  newName: string,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const oldAbs = scrapbookFilePath(projectRoot, config, site, slug, oldName, opts);
  const newAbs = scrapbookFilePath(projectRoot, config, site, slug, newName, opts);
  if (!existsSync(oldAbs)) throw new Error(`file not found: "${oldName}"`);
  if (existsSync(newAbs) && oldAbs !== newAbs) {
    throw new Error(`target name already exists: "${newName}"`);
  }
  renameSync(oldAbs, newAbs);
  const st = statSync(newAbs);
  return {
    name: newName,
    kind: classify(newName),
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

export function deleteScrapbookFile(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  opts: ScrapbookLocation = {},
): void {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename, opts);
  if (!existsSync(abs)) throw new Error(`file not found: "${filename}"`);
  rmSync(abs);
}

/**
 * Seed a scrapbook's `README.md` at plan time. Idempotent — if the
 * README already exists, returns null without touching it. Used by
 * the plan skill so every Planned article gets a scrapbook home with
 * a template that names the article and invites receipts.
 */
export function seedScrapbookReadme(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  title: string,
): ScrapbookItem | null {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, 'README.md');
  if (existsSync(abs)) return null;
  const now = new Date().toISOString().slice(0, 10);
  const body = [
    `# Scrapbook — ${title}`,
    '',
    `Planned ${now}. Working notes, research, receipts, and references`,
    `for the \`${slug}\` dispatch. Committed to git alongside the article;`,
    'not baked to the public site.',
    '',
    '## Receipts',
    '',
    '- ',
    '',
    '## Notes',
    '',
    '- ',
    '',
    '## References',
    '',
    '- ',
    '',
  ].join('\n');
  return createScrapbookMarkdown(projectRoot, config, site, slug, 'README.md', body);
}

/**
 * Write an uploaded file into the scrapbook. Filename + content come
 * from the multipart body upstream; we validate and persist.
 */
export function writeScrapbookUpload(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  content: Buffer,
  opts: ScrapbookLocation = {},
): ScrapbookItem {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename, opts);
  if (existsSync(abs)) {
    throw new Error(`file already exists: "${filename}" — rename first`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  const st = statSync(abs);
  return {
    name: filename,
    kind: classify(filename),
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers (for the UI / chip)
// ---------------------------------------------------------------------------

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = now.getTime() - then;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 9) return `${w}w ago`;
  const months = Math.floor(d / 30);
  if (months < 18) return `${months}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
