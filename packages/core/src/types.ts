/**
 * Editorial calendar types and stage definitions.
 *
 * Ported from audiocontrol.org's editorial lib, with site-specific constants
 * removed — sites are configured per host project in `.deskwork/config.json`
 * (see `config.ts`) rather than hardcoded here.
 */

/**
 * Ordered editorial stages — content moves forward through these.
 *
 * Outlining sits between Planned and Drafting: the blog file is
 * scaffolded at outline time with an empty `## Outline` section,
 * and the operator approves the shape before the body is drafted.
 * Real editorial teams outline first; skipping this step wastes
 * iteration cycles on structural problems a 30-second outline
 * review would have caught.
 */
export const STAGES = [
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Review',
  'Published',
] as const;

export type Stage = (typeof STAGES)[number];

/** True if a value is a recognized stage name. */
export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

/**
 * What kind of content a calendar entry represents.
 *
 * - `blog`    — lives in the host repo under the site's `contentDir`
 * - `youtube` — video hosted on YouTube; `contentUrl` is the video URL
 * - `tool`    — standalone page or app on the site; `contentUrl` is the canonical URL
 */
export const CONTENT_TYPES = ['blog', 'youtube', 'tool'] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/** True if a value is a recognized content type. */
export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

/** A single entry in the editorial calendar. */
export interface CalendarEntry {
  /** URL-safe identifier, e.g. "scsi-over-wifi-raspberry-pi-bridge" */
  slug: string;
  /** Human-readable title */
  title: string;
  /** One-line description for SEO / calendar overview */
  description: string;
  /** Current editorial stage */
  stage: Stage;
  /**
   * Optional in storage — entries without an explicit type default to `'blog'`
   * when accessed via `effectiveContentType`, keeping legacy calendars valid.
   */
  contentType?: ContentType;
  /**
   * Canonical URL for content that doesn't live at the site's default blog path.
   * Required for `youtube` and `tool` entries once published.
   */
  contentUrl?: string;
  /** Target SEO keywords (set when moving to Planned) */
  targetKeywords: string[];
  /**
   * Coarse topic tags used for cross-posting opportunity lookup.
   * Distinct from targetKeywords — these map to channels in the channels file.
   */
  topics?: string[];
  /** ISO date string (YYYY-MM-DD) when published, if applicable */
  datePublished?: string;
  /** GitHub issue number, if one has been created */
  issueNumber?: number;
  /** How this entry was sourced */
  source: 'manual' | 'analytics';
}

/**
 * Return the effective content type for an entry — `'blog'` when unset.
 * Use this everywhere that needs to branch on type so legacy entries
 * (no contentType) keep behaving like blog posts.
 */
export function effectiveContentType(entry: CalendarEntry): ContentType {
  return entry.contentType ?? 'blog';
}

/**
 * True if this content type has a source file in the repo that
 * `draft` should scaffold. Only blog posts live in the repo.
 */
export function hasRepoContent(contentType: ContentType): boolean {
  return contentType === 'blog';
}

/**
 * True if this content type requires `contentUrl` to be set before publishing.
 * Blog entries derive their URL from the slug; everything else needs explicit URL.
 */
export function requiresContentUrl(contentType: ContentType): boolean {
  return contentType !== 'blog';
}

/** Social platforms we track distribution to. */
export const PLATFORMS = ['reddit', 'youtube', 'linkedin', 'instagram'] as const;

export type Platform = (typeof PLATFORMS)[number];

/** True if a value is a recognized platform. */
export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** A single social share of a published post. */
export interface DistributionRecord {
  /** Slug of the published CalendarEntry this share refers to */
  slug: string;
  /** Which platform the post was shared on */
  platform: Platform;
  /**
   * Sub-channel within the platform — e.g. subreddit (`r/synthdiy`),
   * YouTube channel handle, LinkedIn page. Normalized on comparison.
   */
  channel?: string;
  /** URL of the share (e.g. the Reddit thread, YouTube video) */
  url: string;
  /** ISO date string (YYYY-MM-DD) when the share was made */
  dateShared: string;
  /** Optional free-form context */
  notes?: string;
  /**
   * Approved short-form copy for this (slug, platform, channel) tuple,
   * produced by the editorial-review shortform pipeline. For Reddit,
   * conventionally stores `title: ...\n\n<body>`; for others, a single blob.
   */
  shortform?: string;
}

/** The full editorial calendar — entries grouped by stage, plus social distributions. */
export interface EditorialCalendar {
  entries: CalendarEntry[];
  distributions: DistributionRecord[];
}

/** Return entries for a given stage. */
export function entriesByStage(
  calendar: EditorialCalendar,
  stage: Stage,
): CalendarEntry[] {
  return calendar.entries.filter((e) => e.stage === stage);
}

/** Return distribution records for a given slug. */
export function distributionsBySlug(
  calendar: EditorialCalendar,
  slug: string,
): DistributionRecord[] {
  return calendar.distributions.filter((d) => d.slug === slug);
}
