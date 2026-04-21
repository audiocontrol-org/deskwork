/**
 * Pure mutations on an in-memory EditorialCalendar.
 *
 * None of these touch disk — callers parse the calendar, mutate, then write
 * it back. Each mutation validates stage invariants (an entry must be in
 * Planned to be drafted, etc.) and throws a descriptive Error if violated.
 */

import type {
  CalendarEntry,
  ContentType,
  DistributionRecord,
  EditorialCalendar,
} from './types.ts';

/** Convert a title to a URL-safe slug. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Add a new entry to the Ideas stage. */
export function addEntry(
  calendar: EditorialCalendar,
  title: string,
  opts?: {
    description?: string;
    source?: CalendarEntry['source'];
    contentType?: ContentType;
    contentUrl?: string;
  },
): CalendarEntry {
  const slug = slugify(title);

  const existing = calendar.entries.find((e) => e.slug === slug);
  if (existing) {
    throw new Error(
      `Entry with slug "${slug}" already exists in stage "${existing.stage}"`,
    );
  }

  const entry: CalendarEntry = {
    slug,
    title,
    description: opts?.description ?? '',
    stage: 'Ideas',
    targetKeywords: [],
    source: opts?.source ?? 'manual',
  };
  if (opts?.contentType !== undefined) entry.contentType = opts.contentType;
  if (opts?.contentUrl !== undefined && opts.contentUrl.length > 0) {
    entry.contentUrl = opts.contentUrl;
  }

  calendar.entries.push(entry);
  return entry;
}

/** Move an entry to Planned and set target keywords (and optionally topics). */
export function planEntry(
  calendar: EditorialCalendar,
  slug: string,
  keywords: string[],
  opts?: { topics?: string[] },
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  if (entry.stage !== 'Ideas') {
    throw new Error(
      `Entry "${slug}" is in stage "${entry.stage}" — must be in Ideas to plan`,
    );
  }
  entry.stage = 'Planned';
  entry.targetKeywords = keywords;
  if (opts?.topics !== undefined && opts.topics.length > 0) {
    entry.topics = opts.topics;
  }
  return entry;
}

/**
 * Set or clear an entry's `contentUrl`. Used when late-setting a URL on a
 * youtube or tool entry before publishing. Pass `undefined` to unset.
 */
export function setContentUrl(
  calendar: EditorialCalendar,
  slug: string,
  url: string | undefined,
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  if (url === undefined || url.length === 0) {
    delete entry.contentUrl;
  } else {
    entry.contentUrl = url;
  }
  return entry;
}

/** Move an entry to Drafting and record its GitHub issue. */
export function draftEntry(
  calendar: EditorialCalendar,
  slug: string,
  issueNumber?: number,
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  if (entry.stage !== 'Planned') {
    throw new Error(
      `Entry "${slug}" is in stage "${entry.stage}" — must be in Planned to draft`,
    );
  }
  entry.stage = 'Drafting';
  if (issueNumber !== undefined) {
    entry.issueNumber = issueNumber;
  }
  return entry;
}

/** Mark an entry Published with the given date (defaults to today). */
export function publishEntry(
  calendar: EditorialCalendar,
  slug: string,
  datePublished?: string,
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  entry.stage = 'Published';
  entry.datePublished =
    datePublished ?? new Date().toISOString().slice(0, 10);
  return entry;
}

/** Find an entry by slug. */
export function findEntry(
  calendar: EditorialCalendar,
  slug: string,
): CalendarEntry | undefined {
  return calendar.entries.find((e) => e.slug === slug);
}

/**
 * Append a distribution record for a published post. The referenced entry
 * must exist and be in the Published stage — we don't record shares for
 * posts that haven't shipped yet.
 */
export function addDistribution(
  calendar: EditorialCalendar,
  record: DistributionRecord,
): DistributionRecord {
  const entry = calendar.entries.find((e) => e.slug === record.slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${record.slug}`);
  }
  if (entry.stage !== 'Published') {
    throw new Error(
      `Entry "${record.slug}" is in stage "${entry.stage}" — must be Published to record a distribution`,
    );
  }
  calendar.distributions.push(record);
  return record;
}
