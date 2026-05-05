/**
 * Scrapbook public types — value-level shapes shared by every helper in
 * the scrapbook module family.
 *
 * Split out of the legacy monolithic `scrapbook.ts` per #202 (file-size
 * cap) so callers can import just the type surface without pulling in
 * the fs-touching primitives.
 */

/** Type buckets for scrapbook entries — keyed by extension via `classify`. */
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

/** Options that select between the public scrapbook root and `secret/`. */
export interface ScrapbookLocation {
  /** When true, the file lives under `scrapbook/secret/`. Default: false. */
  secret?: boolean;
}

/** Well-known subdirectory name for editorially-private scrapbook items. */
export const SECRET_SUBDIR = 'secret';
