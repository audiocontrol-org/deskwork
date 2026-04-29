/**
 * Pure mutations on an in-memory EditorialCalendar.
 *
 * None of these touch disk — callers parse the calendar, mutate, then write
 * it back. Each mutation validates stage invariants (an entry must be in
 * Planned to be drafted, etc.) and throws a descriptive Error if violated.
 */

import { randomUUID } from 'node:crypto';
import {
  isPausable,
  type CalendarEntry,
  type ContentType,
  type DistributionRecord,
  type EditorialCalendar,
  type Platform,
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
    /**
     * Explicit slug override. Use this to capture hierarchical entries
     * (e.g. "the-outbound/characters/strivers") whose slug shouldn't be
     * derived from the title. When omitted, the slug is `slugify(title)`.
     */
    slug?: string;
  },
): CalendarEntry {
  const slug = opts?.slug ?? slugify(title);

  const existing = calendar.entries.find((e) => e.slug === slug);
  if (existing) {
    throw new Error(
      `Entry with slug "${slug}" already exists in stage "${existing.stage}"`,
    );
  }

  const entry: CalendarEntry = {
    id: randomUUID(),
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

/**
 * Find a calendar entry by its stable UUID. Prefer this over `findEntry`
 * (slug lookup) anywhere the caller has an entry already and wants the
 * join to survive a future slug rename.
 */
export function findEntryById(
  calendar: EditorialCalendar,
  id: string,
): CalendarEntry | undefined {
  if (!id) return undefined;
  return calendar.entries.find((e) => e.id === id);
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

/**
 * Move an entry to Outlining. Precondition: Planned.
 *
 * The outline skill scaffolds the blog file (for blog entries) and
 * advances the entry to this stage; an outline review can happen
 * before the entry moves on to Drafting.
 */
export function outlineEntry(
  calendar: EditorialCalendar,
  slug: string,
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  if (entry.stage !== 'Planned') {
    throw new Error(
      `Entry "${slug}" is in stage "${entry.stage}" — must be in Planned to outline`,
    );
  }
  entry.stage = 'Outlining';
  return entry;
}

/**
 * Move an entry to Drafting. Precondition: Outlining (the approved
 * outline is the handoff into body-drafting). The issueNumber
 * argument records a previously-created GitHub issue if the caller
 * opened one; the helper does not call gh itself.
 */
export function draftEntry(
  calendar: EditorialCalendar,
  slug: string,
  issueNumber?: number,
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  if (entry.stage !== 'Outlining') {
    throw new Error(
      `Entry "${slug}" is in stage "${entry.stage}" — must be in Outlining to draft`,
    );
  }
  entry.stage = 'Drafting';
  if (issueNumber !== undefined) {
    entry.issueNumber = issueNumber;
  }
  return entry;
}

/**
 * Move an entry to `Paused`, recording its prior stage so `unpauseEntry`
 * can restore it. Refuses to pause an already-Paused entry (would lose
 * the original `pausedFrom`) and refuses to pause a `Published` entry
 * (terminal; a shipped post can't be "in progress again"). See #27.
 */
export function pauseEntry(
  calendar: EditorialCalendar,
  slug: string,
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  if (entry.stage === 'Paused') {
    throw new Error(`Entry "${slug}" is already Paused.`);
  }
  if (!isPausable(entry.stage)) {
    throw new Error(
      `Entry "${slug}" is in stage "${entry.stage}" — only non-terminal stages (Ideas / Planned / Outlining / Drafting / Review) can be paused.`,
    );
  }
  entry.pausedFrom = entry.stage;
  entry.stage = 'Paused';
  return entry;
}

/**
 * Restore a `Paused` entry to its `pausedFrom` stage. Throws if the
 * entry isn't Paused, or if `pausedFrom` is missing (legacy / corrupt
 * state — operator must move the entry by hand). See #27.
 */
export function unpauseEntry(
  calendar: EditorialCalendar,
  slug: string,
): CalendarEntry {
  const entry = calendar.entries.find((e) => e.slug === slug);
  if (!entry) {
    throw new Error(`No calendar entry found with slug: ${slug}`);
  }
  if (entry.stage !== 'Paused') {
    throw new Error(
      `Entry "${slug}" is in stage "${entry.stage}" — only Paused entries can be resumed.`,
    );
  }
  if (entry.pausedFrom === undefined) {
    throw new Error(
      `Entry "${slug}" is Paused but has no pausedFrom — cannot resume automatically. Edit the calendar by hand to move it back to the right stage.`,
    );
  }
  entry.stage = entry.pausedFrom;
  delete entry.pausedFrom;
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
 * CLI-arg friendly lookup: tries `id` first (stable across slug
 * renames), falls back to `slug`. Use this anywhere an operator-typed
 * argument might be either form — e.g. `deskwork doctor --entry <X>`.
 *
 * Returns `undefined` when neither match. Empty / whitespace-only
 * input also returns undefined.
 */
export function findEntryBySlugOrId(
  calendar: EditorialCalendar,
  slugOrId: string,
): CalendarEntry | undefined {
  if (slugOrId === undefined || slugOrId === null) return undefined;
  const trimmed = slugOrId.trim();
  if (trimmed === '') return undefined;
  return findEntryById(calendar, trimmed) ?? findEntry(calendar, trimmed);
}

/**
 * Append a distribution record for a published post. The referenced entry
 * must exist and be in the Published stage — we don't record shares for
 * posts that haven't shipped yet.
 *
 * Resolves by entryId when present (stable) or falls back to slug
 * (legacy callers). On success, stamps entryId onto the record so
 * downstream joins use the stable identity even if the slug later
 * changes.
 *
 * Phase 21a: `record.url` may be an empty string at creation time. The
 * shortform flow `addDistribution`s a placeholder record (URL gets filled
 * in by `updateDistributionUrl` once the operator has posted to the
 * platform). The DistributionRecord.url type stays `string` — there is
 * no runtime non-empty check, so the existing surface is unchanged.
 */
export function addDistribution(
  calendar: EditorialCalendar,
  record: DistributionRecord,
): DistributionRecord {
  const entry =
    (record.entryId && calendar.entries.find((e) => e.id === record.entryId)) ||
    calendar.entries.find((e) => e.slug === record.slug);
  if (!entry) {
    throw new Error(
      `No calendar entry found with entryId "${record.entryId ?? ''}" or slug "${record.slug}"`,
    );
  }
  if (entry.stage !== 'Published') {
    throw new Error(
      `Entry "${entry.slug}" is in stage "${entry.stage}" — must be Published to record a distribution`,
    );
  }
  if (entry.id !== undefined) record.entryId = entry.id;
  record.slug = entry.slug;
  calendar.distributions.push(record);
  return record;
}

/**
 * Set / update the URL on a distribution record. Used after the operator
 * has manually posted a shortform to the platform and obtained the share
 * URL.
 *
 * Match precedence: `entryId` (stable) → `(slug, platform, channel?)`
 * (legacy fallback). When no record exists yet the helper creates one via
 * `addDistribution` so the URL becomes the first thing recorded for that
 * distribution.
 *
 * Channel comparison is case-insensitive (matches the existing approve
 * helper's behavior). Pass `channel: undefined` to match a record that
 * has no channel set.
 *
 * Only fields explicitly supplied are written — leaving `notes`
 * undefined preserves any existing note. `dateShared` defaults to today
 * (UTC) when omitted, both for new records and as the explicit set when
 * updating an existing one.
 *
 * @returns the updated DistributionRecord (always present after this call).
 */
export function updateDistributionUrl(
  calendar: EditorialCalendar,
  match: { entryId?: string; slug?: string; platform: Platform; channel?: string },
  url: string,
  dateShared?: string,
  notes?: string,
): DistributionRecord {
  if (!match.platform) {
    throw new Error('updateDistributionUrl: platform is required');
  }
  if (
    (match.entryId === undefined || match.entryId === '') &&
    (match.slug === undefined || match.slug === '')
  ) {
    throw new Error('updateDistributionUrl: entryId or slug is required');
  }

  const channelKey = match.channel?.toLowerCase();
  const channelMatches = (recChannel: string | undefined): boolean => {
    if (channelKey === undefined) return !recChannel;
    return (recChannel?.toLowerCase() ?? '') === channelKey;
  };

  // Match by entryId first (stable across slug renames) then by
  // (slug, platform, channel?) as the legacy fallback.
  const existing = calendar.distributions.find((d) => {
    if (d.platform !== match.platform) return false;
    if (!channelMatches(d.channel)) return false;
    if (match.entryId !== undefined && match.entryId !== '' && d.entryId === match.entryId) {
      return true;
    }
    if (match.slug !== undefined && match.slug !== '' && d.slug === match.slug) {
      return true;
    }
    return false;
  });

  const today = new Date().toISOString().slice(0, 10);

  if (existing) {
    existing.url = url;
    existing.dateShared = dateShared ?? existing.dateShared ?? today;
    if (notes !== undefined) {
      existing.notes = notes;
    }
    return existing;
  }

  // No record yet — fall through to addDistribution so the entry's
  // Published-stage invariant is enforced and entryId/slug get stamped
  // from the calendar entry.
  const slug = match.slug ?? '';
  const record: DistributionRecord = {
    slug,
    platform: match.platform,
    url,
    dateShared: dateShared ?? today,
  };
  if (match.entryId !== undefined && match.entryId !== '') {
    record.entryId = match.entryId;
  }
  if (match.channel !== undefined && match.channel !== '') {
    record.channel = match.channel;
  }
  if (notes !== undefined) {
    record.notes = notes;
  }
  return addDistribution(calendar, record);
}
