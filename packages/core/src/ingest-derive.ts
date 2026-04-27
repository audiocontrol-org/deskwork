/**
 * ingest-derive.ts — slug / state / date / title derivation for ingest.
 *
 * Each `derive*` function takes the file's absolute path, its discovery
 * root (for path-based slug derivation), the parsed frontmatter, the
 * effective field-name table, and the operator's options. It returns a
 * `<thing>Derivation` record that records both the derived value AND
 * where it came from — the dry-run plan surfaces these sources so the
 * operator can sanity-check before committing.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isStage, type Stage } from './types.ts';
import type { FrontmatterData } from './frontmatter.ts';
import { MARKDOWN_EXTENSIONS } from './ingest-paths.ts';

export type DerivationSource =
  | 'frontmatter'
  | 'path'
  | 'mtime'
  | 'today'
  | 'explicit';

export interface SlugDerivation {
  value: string;
  source: DerivationSource;
  reason?: string;
}

export interface StateDerivation {
  value: Stage | null;
  source: DerivationSource;
  rawValue?: string;
}

export interface DateDerivation {
  value: string;
  source: DerivationSource;
}

const JEKYLL_RE = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Canonical state-string normalization. Maps frontmatter values that
 * editorial projects commonly use onto our six lanes. Anything outside
 * this table comes back ambiguous — the operator must pass `--state`.
 */
export const STATE_ALIASES: Record<string, Stage> = {
  ideas: 'Ideas',
  idea: 'Ideas',
  ideas_lane: 'Ideas',
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
};

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

export interface SlugDeriveInput {
  filePath: string;
  root: string;
  frontmatter: FrontmatterData;
  fieldName: string;
  slugFrom: 'frontmatter' | 'path';
  explicitSlug?: string;
}

/**
 * Derive a slug for a discovered file. Order:
 *
 *   1. `explicitSlug` (operator's `--slug`) — wins, marked 'explicit'.
 *   2. When `slugFrom === 'frontmatter'`, the named frontmatter field
 *      (default `slug:`) when set; otherwise falls through to path.
 *   3. Path-based derivation — see `slugFromPath`.
 */
export function deriveSlug(input: SlugDeriveInput): SlugDerivation {
  if (input.explicitSlug !== undefined) {
    return { value: input.explicitSlug, source: 'explicit' };
  }
  if (input.slugFrom === 'frontmatter') {
    const fmSlug = readStringField(input.frontmatter, input.fieldName);
    if (fmSlug !== undefined) {
      return { value: fmSlug, source: 'frontmatter' };
    }
    // Fall through to path when frontmatter slug is missing.
  }
  return slugFromPath(input.filePath, input.root);
}

/**
 * Path-based slug derivation. Computes the slug from the file's path
 * relative to its discovery root, with hierarchical-bundle detection.
 *
 * Filename rules (first match wins):
 *   1. `<dir>/index.md` or `<dir>/README.md` (case-insensitive) →
 *      drop the suffix; the dir name becomes the slug leaf.
 *   2. Filename matches `YYYY-MM-DD-<slug>.<ext>` → strip date prefix
 *      and extension. Jekyll posts.
 *   3. Otherwise → filename minus extension.
 *
 * Hierarchy: a directory between root and the file prefixes the slug
 * if and only if it has its own `index.md` or `README.md`. Such a
 * directory is itself a content node with a slug, and its children
 * nest under it. Plain directories (no own leaf bundle) are
 * "collection containers" — their names do NOT prefix child slugs.
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
    if (segments.length < 2) {
      // Leaf-bundle file at the discovery root — root's basename
      // becomes the slug (the case for a single-file argument like
      // `<...>/strivers/index.md` where root = `<...>/strivers`).
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
  // slugs. Skip when leafSegments already equals the root's basename
  // (the case when the discovered file IS the root's own index.md —
  // handled above by setting leafSegments to the root's name).
  if (directoryIsHierarchicalNode(root)) {
    const rootSegments = root.split(sep).filter((s) => s.length > 0);
    const rootLeaf = rootSegments[rootSegments.length - 1];
    if (rootLeaf && leafSegments[0] !== rootLeaf) {
      prefix.push(rootLeaf);
    }
  }

  let cursor = root;
  for (const dir of dirSegments) {
    cursor = join(cursor, dir);
    if (directoryIsHierarchicalNode(cursor)) {
      prefix.push(dir);
    } else {
      // Once an ancestor isn't itself a content node, the chain
      // ends — the operator put a non-tracked folder between
      // content nodes, so that folder's name shouldn't bleed in.
      prefix.length = 0;
    }
  }

  return { value: [...prefix, ...leafSegments].join('/'), source: 'path' };
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
// State
// ---------------------------------------------------------------------------

export interface StateDeriveInput {
  frontmatter: FrontmatterData;
  stateField: string;
  dateField: string;
  stateFrom: 'frontmatter' | 'datePublished';
  explicitState?: Stage;
  now?: Date;
}

export function deriveState(input: StateDeriveInput): StateDerivation {
  if (input.explicitState !== undefined) {
    return { value: input.explicitState, source: 'explicit' };
  }
  if (input.stateFrom === 'frontmatter') {
    const raw = readStringField(input.frontmatter, input.stateField);
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
  const dateRaw = readDateField(input.frontmatter, input.dateField);
  if (dateRaw === undefined) {
    return { value: 'Ideas', source: 'frontmatter' };
  }
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
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
// Date
// ---------------------------------------------------------------------------

export interface DateDeriveInput {
  filePath: string;
  frontmatter: FrontmatterData;
  dateField: string;
  explicitDate?: string;
  now?: Date;
}

export function deriveDate(input: DateDeriveInput): DateDerivation {
  if (input.explicitDate !== undefined) {
    return { value: input.explicitDate, source: 'explicit' };
  }

  const fmDate = readDateField(input.frontmatter, input.dateField);
  if (fmDate !== undefined) {
    return { value: fmDate, source: 'frontmatter' };
  }
  // Try the secondary `date` field too, when the primary one was
  // overridden — `--date-field datePublished` should still find a
  // generic `date:` as a backstop.
  if (input.dateField !== 'date') {
    const generic = readDateField(input.frontmatter, 'date');
    if (generic !== undefined) {
      return { value: generic, source: 'frontmatter' };
    }
  }

  // mtime fallback — accurate enough for "approximately when the
  // operator wrote this", but the operator can override with --date.
  try {
    const stat = statSync(input.filePath);
    return { value: stat.mtime.toISOString().slice(0, 10), source: 'mtime' };
  } catch {
    // Should never happen — we just read the file. Fall through.
  }

  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  return { value: today, source: 'today' };
}

// ---------------------------------------------------------------------------
// Title / description
// ---------------------------------------------------------------------------

export function deriveTitle(
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
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function deriveDescription(
  frontmatter: FrontmatterData,
  fieldName: string,
): string {
  return readStringField(frontmatter, fieldName) ?? '';
}

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

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
    // might be `date: 2024/01/15` or `date: January 15, 2024`. Parse
    // leniently and serialize as ISO.
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }
  }
  return undefined;
}
