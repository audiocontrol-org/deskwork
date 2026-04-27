/**
 * ingest.ts — discovery primitive for backfilling existing markdown content
 * into the editorial calendar.
 *
 * The ingest flow turns "files on disk" into "calendar candidates" without
 * touching the calendar itself. The CLI layer wires this output into a
 * dry-run plan or an `--apply` write; this module is purely descriptive.
 *
 * ## Responsibilities
 *
 *   1. Walk a list of paths (file / directory / glob) and collect markdown
 *      files (`.md`, `.mdx`, `.markdown`).
 *   2. For each file, parse frontmatter (best-effort — files without
 *      frontmatter still produce a candidate; files with malformed
 *      frontmatter surface as errors).
 *   3. Derive `slug`, `state`, and `date` from a configurable mix of
 *      sources (frontmatter / path / mtime / today). Each derivation
 *      records its source so the operator can verify provenance in the
 *      dry-run output.
 *   4. Filter against an existing calendar — duplicates produce
 *      `IngestSkip` records with a reason, never silent drops.
 *
 * ## What's intentionally out of scope
 *
 *   - Mutations: `discoverIngestCandidates` never writes to disk, never
 *     mutates the calendar. The CLI command turns a candidate list into
 *     an apply plan.
 *   - Auto-detection of the content tree: the operator passes paths
 *     explicitly. Walking the entire repo to "discover" content would
 *     scoop up node_modules / vendored docs / unrelated markdown.
 *   - Migrations from other calendar formats: source is markdown files +
 *     their frontmatter. Importing from Notion / Airtable / a different
 *     calendar markdown shape is a separate concern (PRD extension).
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseFrontmatter, type FrontmatterData } from './frontmatter.ts';
import { isStage, type CalendarEntry, type EditorialCalendar, type Stage } from './types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where a derived value came from. Surfaces in the dry-run plan. */
export type DerivationSource = 'frontmatter' | 'path' | 'mtime' | 'today' | 'explicit';

/** A markdown file resolved to a (slug, state, date) triple ready to commit. */
export interface IngestCandidate {
  /** Absolute path to the source markdown file. */
  filePath: string;
  /** Path relative to the project root, when one was supplied. Display-only. */
  relativePath: string;
  /** Parsed YAML frontmatter (empty object when absent). */
  frontmatter: FrontmatterData;
  /** Body of the markdown file (everything after the closing `---`). */
  body: string;
  /** Derived slug; honours `--slug-from`, `--slug`, frontmatter, then path. */
  derivedSlug: string;
  /** Where `derivedSlug` came from. */
  slugSource: DerivationSource;
  /**
   * Derived stage. `null` when the source produced an unrecognized state
   * value — the operator must pass `--state` to commit. Surfaces in the
   * plan as `state: ambiguous`.
   */
  derivedState: Stage | null;
  /** Where `derivedState` came from. */
  stateSource: DerivationSource;
  /**
   * Raw state string the source produced (e.g. `'published-elsewhere'`)
   * when normalization failed. `undefined` when state was derived
   * unambiguously. Surfaces in the plan to make the failure mode
   * actionable.
   */
  rawState?: string;
  /** Derived date in ISO YYYY-MM-DD form. */
  derivedDate: string;
  /** Where `derivedDate` came from. */
  dateSource: DerivationSource;
  /**
   * Title pulled from frontmatter — falls back to a humanized slug when
   * absent. The CLI emits this onto the new calendar row.
   */
  title: string;
  /** Description pulled from frontmatter — empty string when absent. */
  description: string;
}

/** A candidate that won't be added; carries a reason the operator can act on. */
export interface IngestSkip {
  filePath: string;
  relativePath: string;
  /** Slug we would have used; `undefined` when we couldn't derive one. */
  slug?: string;
  reason: string;
}

/** Result of a discovery pass — successes and skips, never mutations. */
export interface IngestDiscoveryResult {
  candidates: IngestCandidate[];
  skips: IngestSkip[];
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type SlugFrom = 'frontmatter' | 'path';
export type StateFrom = 'frontmatter' | 'datePublished';

export interface IngestOptions {
  /**
   * Project root for relative-path display + scrapbook detection.
   * Required; the discovery surface always runs in the context of a
   * deskwork-installed project.
   */
  projectRoot: string;
  /** Where to derive slugs from. Default `'path'`. */
  slugFrom?: SlugFrom;
  /** Where to derive states from. Default `'frontmatter'`. */
  stateFrom?: StateFrom;
  /**
   * Explicit slug. Only honored when discovery resolves to exactly one
   * candidate file — the CLI enforces this before calling.
   */
  explicitSlug?: string;
  /** Explicit stage. Wins over derivation when set. */
  explicitState?: Stage;
  /** Explicit ISO date (YYYY-MM-DD). Wins over derivation when set. */
  explicitDate?: string;
  /** Frontmatter field name overrides — match the operator's project schema. */
  fieldNames?: {
    title?: string;
    description?: string;
    slug?: string;
    state?: string;
    date?: string;
  };
  /**
   * Existing calendar to filter against for idempotency. When omitted,
   * no idempotency check runs (every candidate proceeds). The CLI
   * always supplies this; tests omit it to exercise discovery alone.
   */
  calendar?: EditorialCalendar;
  /**
   * Bypass the duplicate-slug skip. The CLI exposes this as `--force`
   * and warns the operator that existing rows will be left as-is —
   * `discoverIngestCandidates` does not mutate, so "force" simply
   * means "don't skip; pass through and let the apply layer decide".
   */
  force?: boolean;
  /**
   * Skip files under `<contentDir>/scrapbook/` — host projects use
   * scrapbook for sketches that aren't on the editorial calendar.
   * The CLI threads `<contentDir>/scrapbook` (one per site) into this
   * list. Default `[]` (no skipping).
   */
  scrapbookRoots?: string[];
  /** Today's date for date-derivation fallback. Test seam; defaults to now(). */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKDOWN_EXTENSIONS = ['.md', '.mdx', '.markdown'] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
const JEKYLL_RE = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_FIELDS = {
  title: 'title',
  description: 'description',
  slug: 'slug',
  state: 'state',
  date: 'datePublished',
} as const;

/**
 * Canonical state-string normalization. Maps frontmatter values that
 * editorial projects commonly use onto our six lanes. Anything outside
 * this table comes back ambiguous — the operator must pass `--state`.
 */
const STATE_ALIASES: Record<string, Stage> = {
  ideas: 'Ideas',
  idea: 'Ideas',
  planned: 'Planned',
  outlining: 'Outlining',
  outline: 'Outlining',
  drafting: 'Drafting',
  draft: 'Drafting',
  review: 'Review',
  reviewing: 'Review',
  'in-review': 'Review',
  in_review: 'Review',
  published: 'Published',
  publish: 'Published',
  ideas_lane: 'Ideas',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk the supplied paths, parse markdown files, and produce a
 * candidate list ready to feed to the apply layer.
 *
 * `paths` accepts:
 *   - a single markdown file (`.md`, `.mdx`, `.markdown`)
 *   - a directory walked recursively
 *   - a glob (any path containing `*` or `?`)
 *
 * Errors during parse (bad frontmatter, unreadable file) surface as
 * `IngestSkip` records with a descriptive reason — discovery never
 * throws on a per-file problem so a 100-file run isn't aborted by
 * one corrupt source.
 */
export function discoverIngestCandidates(
  paths: string[],
  options: IngestOptions,
): IngestDiscoveryResult {
  if (paths.length === 0) {
    throw new Error('discoverIngestCandidates: at least one path is required');
  }
  if (!options.projectRoot || !isAbsolute(options.projectRoot)) {
    throw new Error(
      `discoverIngestCandidates: projectRoot must be an absolute path (got "${options.projectRoot ?? ''}")`,
    );
  }

  const collected = collectMarkdownFiles(paths);

  if (options.explicitSlug !== undefined && collected.length !== 1) {
    throw new Error(
      `--slug requires exactly one matched file; ${collected.length} matched`,
    );
  }

  const candidates: IngestCandidate[] = [];
  const skips: IngestSkip[] = [];
  const fields = { ...DEFAULT_FIELDS, ...(options.fieldNames ?? {}) };

  for (const { filePath, root } of collected) {
    if (isUnderScrapbook(filePath, options.scrapbookRoots)) {
      skips.push({
        filePath,
        relativePath: relativeTo(options.projectRoot, filePath),
        reason: 'file is under scrapbook/ (skipped by default)',
      });
      continue;
    }

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (err) {
      skips.push({
        filePath,
        relativePath: relativeTo(options.projectRoot, filePath),
        reason: `unreadable: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    let parsed: { data: FrontmatterData; body: string };
    try {
      parsed = parseFrontmatter(raw);
    } catch (err) {
      skips.push({
        filePath,
        relativePath: relativeTo(options.projectRoot, filePath),
        reason: `frontmatter parse failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const slug = deriveSlug(filePath, root, parsed.data, fields, options);
    if (!slug.value) {
      skips.push({
        filePath,
        relativePath: relativeTo(options.projectRoot, filePath),
        reason: slug.reason ?? 'could not derive slug',
      });
      continue;
    }
    if (!SLUG_RE.test(slug.value)) {
      skips.push({
        filePath,
        relativePath: relativeTo(options.projectRoot, filePath),
        slug: slug.value,
        reason:
          `derived slug "${slug.value}" is not valid kebab-case ` +
          `(must match [a-z0-9][a-z0-9-]* segments separated by '/')`,
      });
      continue;
    }

    if (
      options.calendar &&
      !options.force &&
      options.calendar.entries.some((e) => e.slug === slug.value)
    ) {
      skips.push({
        filePath,
        relativePath: relativeTo(options.projectRoot, filePath),
        slug: slug.value,
        reason: `calendar already has an entry with slug "${slug.value}" (use --force to override)`,
      });
      continue;
    }

    const state = deriveState(parsed.data, fields, options);
    const date = deriveDate(filePath, parsed.data, fields, options);
    const title = deriveTitle(parsed.data, fields.title, slug.value);
    const description = deriveDescription(parsed.data, fields.description);

    candidates.push({
      filePath,
      relativePath: relativeTo(options.projectRoot, filePath),
      frontmatter: parsed.data,
      body: parsed.body,
      derivedSlug: slug.value,
      slugSource: slug.source,
      derivedState: state.value,
      stateSource: state.source,
      ...(state.rawValue !== undefined ? { rawState: state.rawValue } : {}),
      derivedDate: date.value,
      dateSource: date.source,
      title,
      description,
    });
  }

  return { candidates, skips };
}

// ---------------------------------------------------------------------------
// Slug derivation
// ---------------------------------------------------------------------------

interface SlugDerivation {
  value: string;
  source: DerivationSource;
  reason?: string;
}

function deriveSlug(
  filePath: string,
  root: string,
  frontmatter: FrontmatterData,
  fields: { slug: string },
  options: IngestOptions,
): SlugDerivation {
  if (options.explicitSlug !== undefined) {
    return { value: options.explicitSlug, source: 'explicit' };
  }

  const slugFrom = options.slugFrom ?? 'path';

  if (slugFrom === 'frontmatter') {
    const fmSlug = readStringField(frontmatter, fields.slug);
    if (fmSlug !== undefined) {
      return { value: fmSlug, source: 'frontmatter' };
    }
    // Fall through to path when frontmatter slug is missing.
  }

  return slugFromPath(filePath, root);
}

/**
 * Path-based slug derivation. Computes the slug from the file's path
 * relative to its discovery root, with hierarchical-bundle detection.
 *
 * The "discovery root" is the path the operator passed:
 *   - For a file argument: root is the file's parent directory.
 *   - For a directory argument: root is that directory itself.
 *   - For a glob: root is the deepest static prefix.
 *
 * Filename rules (first match wins):
 *   1. `<dir>/index.md` or `<dir>/README.md` (case-insensitive) →
 *      drop the suffix; the dir name becomes the slug leaf. Astro /
 *      Hugo leaf-bundle layout.
 *   2. Filename matches `YYYY-MM-DD-<slug>.<ext>` → strip date prefix
 *      and extension. Jekyll posts.
 *   3. Otherwise → filename minus extension.
 *
 * Hierarchy: a directory between root and the file prefixes the slug
 * if and only if it has its own `index.md` or `README.md`. Such a
 * directory is itself a content node with a slug, and its children
 * nest under it. Plain directories (no own leaf bundle) are
 * "collection containers" — their names do NOT prefix child slugs.
 *
 * Examples (with root = `src/content/`):
 *
 *   essays/whats-in-a-name/index.md
 *     essays/ has no own index.md → slug = `whats-in-a-name`.
 *
 *   the-outbound/characters/strivers/index.md
 *     If the-outbound/index.md and the-outbound/characters/index.md
 *     both exist → slug = `the-outbound/characters/strivers`.
 *     If only the-outbound/index.md exists → slug = `the-outbound/strivers`.
 *     If neither exists → slug = `strivers`.
 */
function slugFromPath(filePath: string, root: string): SlugDerivation {
  const rel = relative(root, filePath);
  const segments = rel.split(sep).filter((s) => s.length > 0);
  if (segments.length === 0) {
    return { value: '', source: 'path', reason: 'file path equals root' };
  }

  const filename = segments[segments.length - 1];
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const baseLower = base.toLowerCase();

  let leafSegments: string[];
  let dirSegments: string[];

  if (baseLower === 'index' || baseLower === 'readme') {
    // Leaf-bundle: drop the index/README; the dir IS the slug leaf.
    // When the leaf-bundle file is AT the discovery root (single
    // segment, just `index.md`), the root's basename becomes the
    // slug — that's the case for a single-file argument like
    // `<...>/strivers/index.md` (root = `<...>/strivers/`).
    if (segments.length < 2) {
      const rootSegments = root.split(sep).filter((s) => s.length > 0);
      const rootLeaf = rootSegments[rootSegments.length - 1];
      if (!rootLeaf) {
        return {
          value: '',
          source: 'path',
          reason: `${filename} at the filesystem root has no directory name to derive a slug from`,
        };
      }
      leafSegments = [rootLeaf];
      dirSegments = [];
    } else {
      leafSegments = [segments[segments.length - 2]];
      dirSegments = segments.slice(0, -2);
    }
  } else {
    const jekyll = base.match(JEKYLL_RE);
    leafSegments = [jekyll ? jekyll[4] : base];
    dirSegments = segments.slice(0, -1);
  }

  // Walk directory ancestors from root → leaf. Each ancestor
  // contributes to the slug only if it has its own index.md or
  // README.md (i.e. it's itself a content node, not just a folder).
  const prefix: string[] = [];

  // Special case: when the discovery root itself is a content node
  // (has its own index.md/README.md), its basename prefixes child
  // slugs. This handles `deskwork ingest src/content/the-outbound/`
  // when the-outbound/index.md exists.
  if (dirSegments.length > 0 || leafSegments.length > 0) {
    if (directoryIsHierarchicalNode(root)) {
      const rootSegments = root.split(sep).filter((s) => s.length > 0);
      const rootLeaf = rootSegments[rootSegments.length - 1];
      // Avoid double-prefix when leafSegments already equals the
      // root's basename (the case when the discovered file is the
      // root's own index.md — handled by the leaf-bundle branch
      // above, which set leafSegments to the root's name).
      if (rootLeaf && leafSegments[0] !== rootLeaf) {
        prefix.push(rootLeaf);
      }
    }
  }

  let cursor = root;
  for (const dir of dirSegments) {
    cursor = join(cursor, dir);
    if (directoryIsHierarchicalNode(cursor)) {
      prefix.push(dir);
    } else {
      // Once an ancestor isn't itself a content node, the chain ends.
      // Anything below that point doesn't get prefixed — the
      // operator put a non-tracked folder between content nodes,
      // and that folder's name shouldn't bleed into the slug.
      prefix.length = 0;
    }
  }

  const slug = [...prefix, ...leafSegments].join('/');
  return { value: slug, source: 'path' };
}

/**
 * True if `dir` itself has a leaf bundle (index.md / README.md /
 * index.mdx / README.mdx / etc.) — i.e. it's a content node whose
 * name should prefix its children's slugs.
 */
function directoryIsHierarchicalNode(dir: string): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    for (const ext of MARKDOWN_EXTENSIONS) {
      if (lower === `index${ext}` || lower === `readme${ext}`) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

interface StateDerivation {
  value: Stage | null;
  source: DerivationSource;
  rawValue?: string;
}

function deriveState(
  frontmatter: FrontmatterData,
  fields: { state: string; date: string },
  options: IngestOptions,
): StateDerivation {
  if (options.explicitState !== undefined) {
    return { value: options.explicitState, source: 'explicit' };
  }
  const stateFrom = options.stateFrom ?? 'frontmatter';

  if (stateFrom === 'frontmatter') {
    const raw = readStringField(frontmatter, fields.state);
    if (raw === undefined) {
      // No state field — default to Ideas as the safest lane.
      return { value: 'Ideas', source: 'frontmatter' };
    }
    const normalized = normalizeStateString(raw);
    if (normalized === null) {
      return { value: null, source: 'frontmatter', rawValue: raw };
    }
    return { value: normalized, source: 'frontmatter' };
  }

  // stateFrom === 'datePublished'
  const dateRaw = readDateField(frontmatter, fields.date);
  if (dateRaw === undefined) {
    return { value: 'Ideas', source: 'frontmatter' };
  }
  const today = (options.now ?? new Date()).toISOString().slice(0, 10);
  if (dateRaw <= today) {
    return { value: 'Published', source: 'frontmatter' };
  }
  return { value: 'Drafting', source: 'frontmatter' };
}

function normalizeStateString(raw: string): Stage | null {
  const key = raw.trim().toLowerCase();
  if (key.length === 0) return null;
  const direct = STATE_ALIASES[key];
  if (direct) return direct;
  // Stage names verbatim (Title-cased) — accept them too.
  const titled = key.charAt(0).toUpperCase() + key.slice(1);
  if (isStage(titled)) return titled;
  return null;
}

// ---------------------------------------------------------------------------
// Date derivation
// ---------------------------------------------------------------------------

interface DateDerivation {
  value: string;
  source: DerivationSource;
}

function deriveDate(
  filePath: string,
  frontmatter: FrontmatterData,
  fields: { date: string },
  options: IngestOptions,
): DateDerivation {
  if (options.explicitDate !== undefined) {
    return { value: options.explicitDate, source: 'explicit' };
  }

  const fmDate = readDateField(frontmatter, fields.date);
  if (fmDate !== undefined) {
    return { value: fmDate, source: 'frontmatter' };
  }
  // Try the secondary `date` field too, when the primary one was
  // overridden — `--date-field datePublished` should still find a
  // generic `date:` as a backstop.
  if (fields.date !== 'date') {
    const generic = readDateField(frontmatter, 'date');
    if (generic !== undefined) {
      return { value: generic, source: 'frontmatter' };
    }
  }

  // mtime fallback — accurate enough for "approximately when the
  // operator wrote this", but the operator can override with
  // `--date YYYY-MM-DD`.
  try {
    const stat = statSync(filePath);
    return { value: stat.mtime.toISOString().slice(0, 10), source: 'mtime' };
  } catch {
    // Should never happen — we just read the file. Fall through.
  }

  const today = (options.now ?? new Date()).toISOString().slice(0, 10);
  return { value: today, source: 'today' };
}

// ---------------------------------------------------------------------------
// Title / description / field readers
// ---------------------------------------------------------------------------

function deriveTitle(
  frontmatter: FrontmatterData,
  fieldName: string,
  slug: string,
): string {
  const raw = readStringField(frontmatter, fieldName);
  if (raw !== undefined && raw.length > 0) return raw;
  // Humanize the slug as a last resort. Strip leading hierarchy
  // segments — title for `the-outbound/characters/strivers` should
  // be "Strivers", not "The Outbound Characters Strivers".
  const leaf = slug.split('/').pop() ?? slug;
  return leaf
    .split('-')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function deriveDescription(
  frontmatter: FrontmatterData,
  fieldName: string,
): string {
  return readStringField(frontmatter, fieldName) ?? '';
}

function readStringField(
  frontmatter: FrontmatterData,
  field: string,
): string | undefined {
  const value = frontmatter[field];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Read a date-like field. YAML may parse `2024-01-15` as a Date or as
 * a string depending on quoting. Both shapes resolve to YYYY-MM-DD.
 * Anything else returns undefined.
 */
function readDateField(
  frontmatter: FrontmatterData,
  field: string,
): string | undefined {
  const value = frontmatter[field];
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (ISO_DATE_RE.test(trimmed)) return trimmed;
    // Try Date.parse for non-ISO formats — the operator's frontmatter
    // might be `date: 2024/01/15` or `date: January 15, 2024`. We
    // parse leniently and serialize as ISO.
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Path collection
// ---------------------------------------------------------------------------

/**
 * A discovered markdown file paired with its discovery root — the
 * directory the operator's path argument resolved to (or the deepest
 * static prefix for a glob). Slug derivation computes the slug as
 * the file's path relative to this root, so siblings of a flat
 * collection ("essays/foo/index.md", "essays/bar/index.md") get
 * unprefixed slugs while deeper nesting produces hierarchical slugs.
 */
interface CollectedFile {
  filePath: string;
  root: string;
}

function collectMarkdownFiles(paths: string[]): CollectedFile[] {
  const seen = new Map<string, CollectedFile>();

  for (const p of paths) {
    const expanded = expandPath(p);
    for (const file of expanded) {
      // First-seen wins for root attribution. If two paths discover
      // the same file (e.g. operator passes both `essays/` and
      // `essays/foo/index.md`), the first path's root is canonical.
      if (!seen.has(file.filePath)) {
        seen.set(file.filePath, file);
      }
    }
  }

  // Stable order so the dry-run plan is deterministic.
  return [...seen.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function expandPath(input: string): CollectedFile[] {
  const absolute = isAbsolute(input) ? input : resolve(process.cwd(), input);

  if (containsGlob(input)) {
    return expandGlob(absolute);
  }

  if (!existsSync(absolute)) {
    throw new Error(`Path does not exist: ${input}`);
  }

  const stat = statSync(absolute);
  if (stat.isFile()) {
    if (!hasMarkdownExtension(absolute)) {
      throw new Error(
        `Path is not a markdown file: ${input} (expected one of ${MARKDOWN_EXTENSIONS.join(', ')})`,
      );
    }
    // For a single-file argument the discovery root is the file's
    // parent — no hierarchical prefix.
    return [{ filePath: absolute, root: dirnameOf(absolute) }];
  }
  if (stat.isDirectory()) {
    return walkDirectory(absolute, absolute);
  }
  return [];
}

function dirnameOf(filePath: string): string {
  const idx = filePath.lastIndexOf(sep);
  if (idx <= 0) return sep;
  return filePath.slice(0, idx);
}

function walkDirectory(dir: string, root: string): CollectedFile[] {
  const out: CollectedFile[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDirectory(child, root));
    } else if (entry.isFile() && hasMarkdownExtension(entry.name)) {
      out.push({ filePath: child, root });
    }
  }
  return out;
}

function containsGlob(input: string): boolean {
  return /[*?[]/.test(input);
}

/**
 * Minimal glob expansion supporting `*`, `**`, `?`, and `[...]` —
 * sufficient for the patterns operators reach for (e.g.
 * `src/content/essays/**\/*.md`). Avoids a runtime dep on a glob
 * library; this code is on the discovery hot path and shouldn't pull
 * in 200KB of generic matcher.
 *
 * The deepest static prefix becomes the discovery root so slugs are
 * computed relative to it (e.g. `src/posts/​**​/*.md` uses `src/posts`
 * as the slug-derivation root).
 */
function expandGlob(absolutePattern: string): CollectedFile[] {
  const segments = absolutePattern.split(sep);
  // Find the deepest non-glob prefix to use as a walk root.
  let rootEnd = 0;
  for (let i = 0; i < segments.length; i++) {
    if (containsGlob(segments[i])) break;
    rootEnd = i;
  }
  const root = segments.slice(0, rootEnd + 1).join(sep) || sep;
  const remainder = segments.slice(rootEnd + 1);

  if (!existsSync(root)) {
    return [];
  }

  return matchPattern(root, remainder, root);
}

function matchPattern(
  currentDir: string,
  remaining: string[],
  root: string,
): CollectedFile[] {
  if (remaining.length === 0) {
    if (statSync(currentDir).isFile() && hasMarkdownExtension(currentDir)) {
      return [{ filePath: currentDir, root }];
    }
    return [];
  }
  const [head, ...rest] = remaining;
  const out: CollectedFile[] = [];

  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return out;
  }

  if (head === '**') {
    // Match zero or more directories, then continue with `rest`.
    out.push(...matchPattern(currentDir, rest, root));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        out.push(...matchPattern(join(currentDir, entry.name), remaining, root));
      }
    }
    return out;
  }

  const matcher = globSegmentMatcher(head);
  for (const entry of entries) {
    if (!matcher(entry.name)) continue;
    const child = join(currentDir, entry.name);
    if (rest.length === 0) {
      if (entry.isFile() && hasMarkdownExtension(entry.name)) {
        out.push({ filePath: child, root });
      }
    } else if (entry.isDirectory()) {
      out.push(...matchPattern(child, rest, root));
    }
  }
  return out;
}

function globSegmentMatcher(pattern: string): (name: string) => boolean {
  // Escape regex metas except our glob ones, then translate.
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else if (ch === '[') {
      // copy through to ']'
      const close = pattern.indexOf(']', i);
      if (close === -1) {
        re += '\\[';
      } else {
        re += pattern.slice(i, close + 1);
        i = close;
      }
    } else if (/[\\^$+().{}|]/.test(ch)) re += `\\${ch}`;
    else re += ch;
  }
  re += '$';
  const compiled = new RegExp(re);
  return (name) => compiled.test(name);
}

function hasMarkdownExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function relativeTo(projectRoot: string, filePath: string): string {
  const rel = relative(projectRoot, filePath);
  return rel.length > 0 ? rel : filePath;
}

function isUnderScrapbook(filePath: string, roots?: string[]): boolean {
  if (!roots || roots.length === 0) return false;
  for (const root of roots) {
    const r = root.endsWith(sep) ? root : root + sep;
    if (filePath.startsWith(r)) return true;
  }
  return false;
}

/**
 * Build the CalendarEntry that the apply layer will append for a
 * given candidate. Pure shaping — does not touch the calendar.
 */
export function candidateToEntry(
  candidate: IngestCandidate,
  stage: Stage,
): Omit<CalendarEntry, 'id'> {
  const entry: Omit<CalendarEntry, 'id'> = {
    slug: candidate.derivedSlug,
    title: candidate.title,
    description: candidate.description,
    stage,
    targetKeywords: [],
    source: 'manual',
  };
  // Published entries carry datePublished; other lanes don't (the
  // calendar renderer only emits the column for Published).
  if (stage === 'Published') {
    entry.datePublished = candidate.derivedDate;
  }
  return entry;
}
