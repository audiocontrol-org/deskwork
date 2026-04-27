/**
 * ingest.ts — discovery primitive for backfilling existing markdown
 * content into the editorial calendar.
 *
 * Turns "files on disk" into "calendar candidates" without touching
 * the calendar itself. The CLI layer wires this output into a
 * dry-run plan or an `--apply` write; this module is purely
 * descriptive.
 *
 * Responsibilities split across three files:
 *
 *   - `ingest.ts` (this file) — orchestrates discovery, applies
 *     idempotency filtering against an existing calendar, and shapes
 *     candidates into `IngestCandidate` records ready for the apply
 *     layer.
 *   - `ingest-paths.ts` — walks file / directory / glob inputs and
 *     produces `(filePath, root)` tuples.
 *   - `ingest-derive.ts` — slug / state / date / title derivation
 *     with provenance recording.
 *
 * What's intentionally out of scope:
 *
 *   - Mutations: `discoverIngestCandidates` never writes to disk,
 *     never mutates the calendar.
 *   - Auto-detection of the content tree: the operator passes paths
 *     explicitly. Walking the entire repo would scoop up
 *     node_modules / vendored docs / unrelated markdown.
 *   - Migrations from other calendar formats: source is markdown
 *     files + their frontmatter. Importing from Notion / Airtable
 *     is a separate concern (PRD extension).
 */

import { isAbsolute, relative, sep } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseFrontmatter, type FrontmatterData } from './frontmatter.ts';
import type { CalendarEntry, EditorialCalendar, Stage } from './types.ts';
import { collectMarkdownFiles } from './ingest-paths.ts';
import {
  deriveDate,
  deriveDescription,
  deriveSlug,
  deriveState,
  deriveTitle,
  type DerivationSource,
} from './ingest-derive.ts';

export type { DerivationSource } from './ingest-derive.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
   * Derived stage. `null` when the source produced an unrecognized
   * state value — the operator must pass `--state` to commit.
   * Surfaces in the plan as `state: ambiguous`.
   */
  derivedState: Stage | null;
  /** Where `derivedState` came from. */
  stateSource: DerivationSource;
  /**
   * Raw state string the source produced (e.g. `'published-elsewhere'`)
   * when normalization failed. `undefined` when state was derived
   * unambiguously.
   */
  rawState?: string;
  /** Derived date in ISO YYYY-MM-DD form. */
  derivedDate: string;
  /** Where `derivedDate` came from. */
  dateSource: DerivationSource;
  /**
   * Title pulled from frontmatter — falls back to a humanized slug
   * when absent. The CLI emits this onto the new calendar row.
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
   * Explicit slug. Only honored when discovery resolves to exactly
   * one candidate file — the CLI enforces this before calling.
   */
  explicitSlug?: string;
  /** Explicit stage. Wins over derivation when set. */
  explicitState?: Stage;
  /** Explicit ISO date (YYYY-MM-DD). Wins over derivation when set. */
  explicitDate?: string;
  /** Frontmatter field-name overrides — match the operator's project schema. */
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
   * Skip files under any of these absolute paths — host projects use
   * a scrapbook directory for sketches that aren't on the editorial
   * calendar. The CLI threads `<contentDir>/scrapbook` (one per site)
   * into this list. Default `[]` (no skipping).
   */
  scrapbookRoots?: string[];
  /** Today's date for date-derivation fallback. Test seam; defaults to now(). */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

const DEFAULT_FIELDS = {
  title: 'title',
  description: 'description',
  slug: 'slug',
  state: 'state',
  date: 'datePublished',
} as const;

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
    const relPath = relativeTo(options.projectRoot, filePath);

    if (isUnderScrapbook(filePath, options.scrapbookRoots)) {
      skips.push({
        filePath,
        relativePath: relPath,
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
        relativePath: relPath,
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
        relativePath: relPath,
        reason: `frontmatter parse failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const slug = deriveSlug({
      filePath,
      root,
      frontmatter: parsed.data,
      fieldName: fields.slug,
      slugFrom: options.slugFrom ?? 'path',
      ...(options.explicitSlug !== undefined
        ? { explicitSlug: options.explicitSlug }
        : {}),
    });
    if (!slug.value) {
      skips.push({
        filePath,
        relativePath: relPath,
        reason: slug.reason ?? 'could not derive slug',
      });
      continue;
    }
    if (!SLUG_RE.test(slug.value)) {
      skips.push({
        filePath,
        relativePath: relPath,
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
        relativePath: relPath,
        slug: slug.value,
        reason: `calendar already has an entry with slug "${slug.value}" (use --force to override)`,
      });
      continue;
    }

    const state = deriveState({
      frontmatter: parsed.data,
      stateField: fields.state,
      dateField: fields.date,
      stateFrom: options.stateFrom ?? 'frontmatter',
      ...(options.explicitState !== undefined
        ? { explicitState: options.explicitState }
        : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    const date = deriveDate({
      filePath,
      frontmatter: parsed.data,
      dateField: fields.date,
      ...(options.explicitDate !== undefined
        ? { explicitDate: options.explicitDate }
        : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    const title = deriveTitle(parsed.data, fields.title, slug.value);
    const description = deriveDescription(parsed.data, fields.description);

    candidates.push({
      filePath,
      relativePath: relPath,
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

// ---------------------------------------------------------------------------
// Helpers
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
