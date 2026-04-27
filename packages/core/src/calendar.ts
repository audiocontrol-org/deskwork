/**
 * Markdown editorial calendar parser and writer.
 *
 * Each site's calendar is a human-readable markdown file with one table per
 * stage. This module round-trips between that format and the in-memory
 * EditorialCalendar type.
 *
 * ## Markdown format
 *
 * ```markdown
 * # Editorial Calendar
 *
 * ## Ideas
 *
 * | UUID | Slug | Title | Description | Keywords | Source |
 * |------|------|-------|-------------|----------|--------|
 * | abc-123 | my-post | My Post | A post about things | kw1, kw2 | manual |
 *
 * ## Planned
 * ...
 *
 * ## Published
 *
 * | UUID | Slug | Title | Description | Keywords | Source | Published | Issue |
 * |------|------|-------|-------------|----------|--------|-----------|-------|
 * ```
 *
 * Optional columns (Topics, Type, URL) are emitted only when any entry uses
 * them, so a calendar with no cross-posting stays visually simple. Published
 * entries always include Published and Issue columns. The UUID column is
 * always emitted at render time — pre-UUID calendars get backfilled lazily
 * (parser assigns missing UUIDs in-memory; the next write persists them).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  PLATFORMS,
  STAGES,
  effectiveContentType,
  isContentType,
  isPausable,
  isPlatform,
  isStage,
  type CalendarEntry,
  type DistributionRecord,
  type EditorialCalendar,
  type Stage,
} from './types.ts';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\|[\s:-]+\|/.test(line);
}

function indexColumns(headerLine: string): Map<string, number> {
  const map = new Map<string, number>();
  parseRow(headerLine).forEach((name, idx) => {
    map.set(name.trim().toLowerCase(), idx);
  });
  return map;
}

function col(
  cells: string[],
  cols: Map<string, number>,
  name: string,
): string | undefined {
  const idx = cols.get(name);
  if (idx === undefined) return undefined;
  const value = cells[idx];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseEntries(lines: string[], stage: Stage): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  let i = 0;
  while (i < lines.length && !lines[i].startsWith('|')) i++;
  if (i >= lines.length) return entries;

  const cols = indexColumns(lines[i]);
  i++;
  if (i < lines.length && isSeparator(lines[i])) i++;

  while (i < lines.length && lines[i].startsWith('|')) {
    const cells = parseRow(lines[i]);
    const slug = col(cells, cols, 'slug');
    const title = col(cells, cols, 'title');
    if (slug && title) {
      // UUID column is optional for backward compatibility. Missing IDs
      // get a fresh v4 assigned in-memory; the next writeCalendar
      // persists them, so one save fully migrates a legacy calendar.
      const existingId = col(cells, cols, 'uuid') ?? col(cells, cols, 'id');
      const entry: CalendarEntry = {
        id: existingId ?? randomUUID(),
        slug,
        title,
        description: col(cells, cols, 'description') ?? '',
        stage,
        targetKeywords: (col(cells, cols, 'keywords') ?? '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        source: col(cells, cols, 'source') === 'analytics' ? 'analytics' : 'manual',
      };

      const topics = col(cells, cols, 'topics');
      if (topics) {
        entry.topics = topics.split(',').map((t) => t.trim()).filter(Boolean);
      }

      const typeValue = col(cells, cols, 'type');
      if (typeValue && isContentType(typeValue)) {
        entry.contentType = typeValue;
      }

      const url = col(cells, cols, 'url');
      if (url) entry.contentUrl = url;

      // Legacy calendars may carry a `FilePath` column from the prior
      // plan; the parser is column-tolerant and ignores it. Phase 19
      // moves filesystem placement to frontmatter `id:` + the content
      // index, so the column is no longer load-bearing on disk.

      // PausedFrom column round-trips on the Paused section. Other
      // sections that happen to carry the column (legacy hand-edits)
      // ignore the value since `entry.stage !== 'Paused'`.
      const pausedFrom = col(cells, cols, 'pausedfrom');
      if (pausedFrom && isStage(pausedFrom) && isPausable(pausedFrom)) {
        entry.pausedFrom = pausedFrom;
      }

      const published = col(cells, cols, 'published');
      if (published) entry.datePublished = published;

      const issue = col(cells, cols, 'issue');
      if (issue) {
        const match = issue.match(/#?(\d+)/);
        if (match) entry.issueNumber = parseInt(match[1], 10);
      }

      entries.push(entry);
    }
    i++;
  }
  return entries;
}

function parseDistributions(lines: string[]): DistributionRecord[] {
  const records: DistributionRecord[] = [];

  let i = 0;
  while (i < lines.length && !lines[i].startsWith('|')) i++;
  if (i >= lines.length) return records;

  const cols = indexColumns(lines[i]);
  i++;
  if (i < lines.length && isSeparator(lines[i])) i++;

  while (i < lines.length && lines[i].startsWith('|')) {
    const cells = parseRow(lines[i]);
    const slug = col(cells, cols, 'slug');
    const platformValue = col(cells, cols, 'platform');
    const url = col(cells, cols, 'url');
    const dateShared = col(cells, cols, 'shared');

    if (slug && platformValue && url && dateShared && isPlatform(platformValue)) {
      // entryId may be missing on legacy rows. Left empty here and
      // backfilled in parseCalendar once entries are parsed and a
      // slug → entry lookup table is available.
      const entryIdCell = col(cells, cols, 'entryid') ?? col(cells, cols, 'uuid');
      const rec: DistributionRecord = {
        entryId: entryIdCell ?? '',
        slug,
        platform: platformValue,
        url,
        dateShared,
      };
      const channel = col(cells, cols, 'channel');
      if (channel) rec.channel = channel;
      const notes = col(cells, cols, 'notes');
      if (notes) rec.notes = notes;
      records.push(rec);
    }
    i++;
  }
  return records;
}

type SectionName = Stage | 'Distribution' | 'Shortform Copy';

interface ShortformBlock {
  slug: string;
  platform: string;
  channel?: string;
  text: string;
}

function parseShortformBlocks(lines: string[]): ShortformBlock[] {
  const blocks: ShortformBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i].match(/^### (.+)$/);
    if (!header) {
      i++;
      continue;
    }
    const parts = header[1].split('·').map((s) => s.trim());
    if (parts.length < 2) {
      i++;
      continue;
    }
    const [slug, platform, channel] = parts;
    i++;
    const bodyLines: string[] = [];
    while (i < lines.length && !lines[i].startsWith('### ')) {
      bodyLines.push(lines[i]);
      i++;
    }
    const text = bodyLines.join('\n').replace(/^\n+|\n+$/g, '');
    if (text.length > 0) {
      const block: ShortformBlock = { slug, platform, text };
      if (channel) block.channel = channel;
      blocks.push(block);
    }
  }
  return blocks;
}

/** Parse the editorial calendar markdown file into an EditorialCalendar. */
export function parseCalendar(markdown: string): EditorialCalendar {
  const entries: CalendarEntry[] = [];
  const distributions: DistributionRecord[] = [];
  const shortformBlocks: ShortformBlock[] = [];
  const lines = markdown.split('\n');

  let currentSection: SectionName | null = null;
  let sectionLines: string[] = [];

  function flushSection() {
    if (currentSection && sectionLines.length > 0) {
      if (currentSection === 'Distribution') {
        distributions.push(...parseDistributions(sectionLines));
      } else if (currentSection === 'Shortform Copy') {
        shortformBlocks.push(...parseShortformBlocks(sectionLines));
      } else {
        entries.push(...parseEntries(sectionLines, currentSection));
      }
    }
    sectionLines = [];
  }

  for (const line of lines) {
    const sectionMatch = line.match(/^## (.+)$/);
    if (sectionMatch) {
      flushSection();
      const name = sectionMatch[1].trim();
      if (isStage(name)) {
        currentSection = name;
      } else if (name === 'Distribution') {
        currentSection = 'Distribution';
      } else if (name === 'Shortform Copy') {
        currentSection = 'Shortform Copy';
      } else {
        currentSection = null;
      }
    } else if (currentSection) {
      sectionLines.push(line);
    }
  }
  flushSection();

  // Merge shortform blocks onto their matching DistributionRecord by
  // (slug, platform, channel) — normalize channel to avoid case drift.
  for (const b of shortformBlocks) {
    const rec = distributions.find(
      (d) =>
        d.slug === b.slug &&
        d.platform === b.platform &&
        (d.channel ?? '').toLowerCase() === (b.channel ?? '').toLowerCase(),
    );
    if (rec) rec.shortform = b.text;
  }

  // Backfill missing entryIds on DistributionRecords by slug match
  // against the entries we just parsed. Records whose slug doesn't
  // resolve to a known entry keep an empty entryId — writeCalendar
  // preserves that (the row is still parseable), and a subsequent
  // distribute or migration run will fix it.
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
  for (const d of distributions) {
    if (!d.entryId) {
      const match = entryBySlug.get(d.slug);
      if (match && match.id) d.entryId = match.id;
    }
  }

  return { entries, distributions };
}

/**
 * Read and parse the editorial calendar from an absolute path.
 *
 * A non-existent file is treated as a logically empty calendar — the user
 * hasn't written anything yet. Any other error (e.g. unreadable, malformed)
 * propagates so the operator sees the problem instead of a silently-empty
 * dashboard.
 */
export function readCalendar(calendarPath: string): EditorialCalendar {
  let raw: string;
  try {
    raw = readFileSync(calendarPath, 'utf-8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return { entries: [], distributions: [] };
    }
    throw err;
  }
  return parseCalendar(raw);
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderStageTable(entries: CalendarEntry[], stage: Stage): string {
  const lines: string[] = [];
  const hasIssue = entries.some((e) => e.issueNumber !== undefined);
  const hasTopics = entries.some(
    (e) => e.topics !== undefined && e.topics.length > 0,
  );
  const hasType = entries.some(
    (e) => e.contentType !== undefined && e.contentType !== 'blog',
  );
  const hasUrl = entries.some(
    (e) => e.contentUrl !== undefined && e.contentUrl !== '',
  );
  const isPublished = stage === 'Published';
  const isPaused = stage === 'Paused';

  const headers: string[] = ['UUID', 'Slug', 'Title', 'Description', 'Keywords'];
  if (hasTopics) headers.push('Topics');
  if (hasType) headers.push('Type');
  if (hasUrl) headers.push('URL');
  headers.push('Source');
  if (isPaused) headers.push('PausedFrom');
  if (isPublished) headers.push('Published');
  if (hasIssue || isPublished) headers.push('Issue');

  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`|${headers.map(() => '------').join('|')}|`);

  for (const e of entries) {
    // Backfill a UUID at render time if one is missing. Mutates the
    // entry so subsequent reads/writes see a stable id.
    if (!e.id) e.id = randomUUID();
    const row: string[] = [
      e.id,
      escapeCell(e.slug),
      escapeCell(e.title),
      escapeCell(e.description),
      escapeCell(e.targetKeywords.join(', ')),
    ];
    if (hasTopics) row.push(escapeCell((e.topics ?? []).join(', ')));
    if (hasType) row.push(effectiveContentType(e));
    if (hasUrl) row.push(escapeCell(e.contentUrl ?? ''));
    row.push(e.source);
    if (isPaused) row.push(e.pausedFrom ?? '');
    if (isPublished) row.push(e.datePublished ?? '');
    if (hasIssue || isPublished) row.push(e.issueNumber ? `#${e.issueNumber}` : '');
    lines.push(`| ${row.join(' | ')} |`);
  }

  return lines.join('\n');
}

function renderDistributionTable(records: DistributionRecord[]): string {
  const lines: string[] = [];
  const hasChannel = records.some(
    (r) => r.channel !== undefined && r.channel !== '',
  );

  const headers: string[] = ['EntryID', 'Slug', 'Platform', 'URL', 'Shared'];
  if (hasChannel) headers.push('Channel');
  headers.push('Notes');

  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`|${headers.map(() => '------').join('|')}|`);

  for (const r of records) {
    const row: string[] = [
      r.entryId ?? '',
      escapeCell(r.slug),
      r.platform,
      escapeCell(r.url),
      r.dateShared,
    ];
    if (hasChannel) row.push(escapeCell(r.channel ?? ''));
    row.push(escapeCell(r.notes ?? ''));
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

/** Render the full editorial calendar as markdown. */
export function renderCalendar(calendar: EditorialCalendar): string {
  const sections: string[] = ['# Editorial Calendar', ''];

  for (const stage of STAGES) {
    const stageEntries = calendar.entries.filter((e) => e.stage === stage);
    sections.push(`## ${stage}`, '');
    if (stageEntries.length > 0) {
      sections.push(renderStageTable(stageEntries, stage));
    } else {
      sections.push('*No entries.*');
    }
    sections.push('');
  }

  sections.push('## Distribution', '');
  if (calendar.distributions.length > 0) {
    sections.push(renderDistributionTable(calendar.distributions));
  } else {
    sections.push('*No entries.*');
  }
  sections.push('');

  const shortformRecords = calendar.distributions.filter(
    (d) => d.shortform !== undefined && d.shortform !== '',
  );
  if (shortformRecords.length > 0) {
    sections.push('## Shortform Copy', '');
    for (const r of shortformRecords) {
      const headerParts: string[] = [r.slug, r.platform];
      if (r.channel) headerParts.push(r.channel);
      sections.push(`### ${headerParts.join(' · ')}`, '');
      sections.push((r.shortform ?? '').replace(/\n+$/, ''));
      sections.push('');
    }
  }

  return sections.join('\n');
}

/** Write the editorial calendar to an absolute path. */
export function writeCalendar(
  calendarPath: string,
  calendar: EditorialCalendar,
): void {
  writeFileSync(calendarPath, renderCalendar(calendar), 'utf-8');
}

/** Render an empty calendar — used by the install skill to seed a new file. */
export function renderEmptyCalendar(): string {
  return renderCalendar({ entries: [], distributions: [] });
}

/** Suppress unused-import warnings for re-exported constants available to callers. */
export { PLATFORMS, STAGES };
