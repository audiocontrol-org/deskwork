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
import { resolveBlogPostDir } from './paths.ts';

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
  slug: string;
  dir: string; // absolute path
  exists: boolean;
  items: ScrapbookItem[];
}

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
 * Resolve a filename INSIDE a scrapbook dir and return the absolute
 * path. Throws if the resolved path escapes the scrapbook dir (guards
 * against `..` sequences that slipped through assertFilename).
 */
export function scrapbookFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
): string {
  assertFilename(filename);
  const dir = scrapbookDir(projectRoot, config, site, slug);
  const abs = resolve(dir, filename);
  if (!abs.startsWith(dir + '/') && abs !== dir) {
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

/** List the items in a scrapbook, sorted newest-mtime first. */
export function listScrapbook(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
): ScrapbookSummary {
  const dir = scrapbookDir(projectRoot, config, site, slug);
  if (!existsSync(dir)) {
    return { site, slug, dir, exists: false, items: [] };
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  const items: ScrapbookItem[] = [];
  for (const e of entries) {
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
  return { site, slug, dir, exists: true, items };
}

/** Just the item count — used by the studio chip for the badge. */
export function countScrapbook(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
): number {
  try {
    return listScrapbook(projectRoot, config, site, slug).items.length;
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
): {
  name: string;
  kind: ScrapbookItemKind;
  size: number;
  mtime: string;
  content: Buffer;
} {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename);
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
 * Create a new markdown note in the scrapbook. Creates the scrapbook
 * dir if it doesn't exist. Refuses to overwrite existing files.
 */
export function createScrapbookMarkdown(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  filename: string,
  body: string,
): ScrapbookItem {
  if (!filename.endsWith('.md')) {
    throw new Error(`create endpoint only accepts .md files: "${filename}"`);
  }
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename);
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
): ScrapbookItem {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename);
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
): ScrapbookItem {
  const oldAbs = scrapbookFilePath(projectRoot, config, site, slug, oldName);
  const newAbs = scrapbookFilePath(projectRoot, config, site, slug, newName);
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
): void {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename);
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
): ScrapbookItem {
  const abs = scrapbookFilePath(projectRoot, config, site, slug, filename);
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
