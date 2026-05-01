import { readFile, writeFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { extractEntriesForMigration } from '../calendar/parse.ts';
import { writeSidecar } from '../sidecar/write.ts';
import { renderCalendar } from '../calendar/render.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { readJournalEvents } from '../journal/read.ts';
import type { Entry, Stage, ReviewState } from '../schema/entry.ts';
import type { JournalEvent } from '../schema/journal-events.ts';

interface IngestRecord {
  readonly entryId?: string;
  readonly sourceFile?: string;
}

/**
 * Read .deskwork/review-journal/ingest/*.json and return the sourceFile
 * for the record whose entryId matches. Used by migration to populate
 * Entry.artifactPath from the legacy data instead of deriving from the
 * slug+stage heuristic (#140).
 */
async function findIngestSourceFile(
  projectRoot: string,
  entryId: string,
): Promise<string | undefined> {
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'ingest');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return undefined;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    let rec: IngestRecord;
    try {
      rec = JSON.parse(await readFile(join(dir, f), 'utf8')) as IngestRecord;
    } catch {
      continue;
    }
    if (rec.entryId === entryId && typeof rec.sourceFile === 'string') {
      return rec.sourceFile;
    }
  }
  return undefined;
}

interface MigrateOptions {
  dryRun: boolean;
}

interface MigrateResult {
  entriesMigrated: number;
  unmigratable: string[];
}

export async function detectLegacySchema(projectRoot: string): Promise<boolean> {
  // Legacy: calendar.md has Paused/Review sections, OR no .deskwork/entries directory.
  try {
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    if (/^## Paused\b/m.test(md) || /^## Review\b/m.test(md)) return true;
  } catch {
    return false;
  }
  try {
    await access(join(projectRoot, '.deskwork', 'entries'));
    return false;
  } catch {
    return true;
  }
}

export async function migrateCalendar(
  projectRoot: string,
  opts: MigrateOptions
): Promise<MigrateResult> {
  const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
  const sources = extractEntriesForMigration(md);

  const sidecars: Entry[] = [];
  const unmigratable: string[] = [];

  for (const src of sources) {
    // Build iteration history from journal — best-effort.
    const events = await readJournalEvents(projectRoot, { entryId: src.uuid });
    const iterationByStage = countIterationsByStage(events);
    const earliest = events[0]?.at ?? new Date().toISOString();
    const latest = events[events.length - 1]?.at ?? new Date().toISOString();

    const priorStage = src.currentStage === 'Blocked' || src.currentStage === 'Cancelled'
      ? inferPriorStageFromJournal(events)
      : undefined;
    const reviewState = latestReviewStateFromJournal(events);
    const description = src.description !== '' ? src.description : undefined;

    // #140: prefer the actual on-disk path recorded in the ingest journal.
    // Without this, doctor's file-presence validator derives a slug+stage
    // path that misses entries laid out under custom directories.
    const artifactPath = await findIngestSourceFile(projectRoot, src.uuid);

    // Build entry with conditional spread to satisfy exactOptionalPropertyTypes.
    const entry: Entry = {
      uuid: src.uuid,
      slug: src.slug,
      title: src.title,
      keywords: src.keywords,
      source: src.source,
      currentStage: src.currentStage,
      iterationByStage,
      createdAt: earliest,
      updatedAt: latest,
      ...(description !== undefined && { description }),
      ...(priorStage !== undefined && { priorStage }),
      ...(reviewState !== undefined && { reviewState }),
      ...(artifactPath !== undefined && { artifactPath }),
    };
    sidecars.push(entry);
  }

  if (!opts.dryRun) {
    for (const e of sidecars) {
      await writeSidecar(projectRoot, e);
      await appendJournalEvent(projectRoot, {
        kind: 'entry-created',
        at: new Date().toISOString(),
        entryId: e.uuid,
        entry: e,
      });
    }
    const newMd = renderCalendar(sidecars);
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), newMd);
  }

  return { entriesMigrated: sidecars.length, unmigratable };
}

function countIterationsByStage(events: JournalEvent[]): Partial<Record<Stage, number>> {
  const counts: Partial<Record<Stage, number>> = {};
  for (const e of events) {
    if (e.kind === 'iteration') {
      const stage: Stage = e.stage;
      counts[stage] = (counts[stage] ?? 0) + 1;
    }
  }
  return counts;
}

function inferPriorStageFromJournal(events: JournalEvent[]): Stage {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.kind === 'stage-transition' && e.to !== 'Blocked' && e.to !== 'Cancelled') {
      return e.from;
    }
  }
  return 'Drafting'; // safe default when no transition history is available
}

function latestReviewStateFromJournal(events: JournalEvent[]): ReviewState | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e && e.kind === 'review-state-change' && e.to) return e.to;
  }
  return undefined;
}
