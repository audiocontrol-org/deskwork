import { readFile, writeFile, readdir } from 'node:fs/promises';
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

interface PipelineRecord {
  readonly entryId?: string;
  readonly state?: string;
  readonly currentVersion?: number;
}

interface PipelineSummary {
  readonly currentVersion: number;
  readonly state: string;
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

/**
 * Walk legacy pipeline-workflow records and group by entryId. Used by
 * migration to populate Entry.iterationByStage[currentStage] +
 * Entry.reviewState (#141). Multiple records per entryId keep the highest
 * currentVersion.
 */
async function readLegacyPipelineRecords(
  projectRoot: string,
): Promise<Map<string, PipelineSummary>> {
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'pipeline');
  const out = new Map<string, PipelineSummary>();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return out;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    let rec: PipelineRecord;
    try {
      rec = JSON.parse(await readFile(join(dir, f), 'utf8')) as PipelineRecord;
    } catch {
      continue;
    }
    if (typeof rec.entryId !== 'string') continue;
    if (typeof rec.currentVersion !== 'number') continue;
    if (typeof rec.state !== 'string') continue;
    const existing = out.get(rec.entryId);
    if (!existing || rec.currentVersion > existing.currentVersion) {
      out.set(rec.entryId, { currentVersion: rec.currentVersion, state: rec.state });
    }
  }
  return out;
}

/**
 * Translate a legacy review-workflow `state` string to the Phase 30
 * ReviewState enum (`'in-review' | 'iterating' | 'approved'`). Legacy
 * states without a clean Phase 30 mapping translate to undefined (drop).
 */
function translateLegacyState(state: string): ReviewState | undefined {
  if (state === 'applied') return 'approved';
  if (state === 'iterating') return 'iterating';
  if (state === 'open') return 'in-review';
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
  // #149: the .deskwork/entries directory is the migration marker —
  // its presence (even empty) means the project has been migrated to
  // (or natively created in) the entry-centric schema. Drift in
  // calendar.md (legacy CLI verbs that haven't been split yet, e.g.
  // publish, can re-emit `## Paused` / `## Review` section names via
  // the legacy renderer) is a SEPARATE problem to be fixed by the
  // doctor's reconciliation pass, NOT by re-running migration on top
  // of valid sidecars (which would overwrite correct fields with
  // stale heuristic data — artifactPath from old ingest-journal
  // entries, iterationByStage shape regression, etc.).
  const entriesDir = join(projectRoot, '.deskwork', 'entries');
  try {
    await readdir(entriesDir);
    return false;
  } catch {
    // No entries dir.
  }
  // No entries dir: pre-migration shape. Calendar.md presence is the
  // "this is a deskwork project that needs to be migrated" signal.
  try {
    await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    return true;
  } catch {
    // No calendar.md and no entries dir: not a deskwork project at all.
    return false;
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

  // #141: legacy review-workflow records carry iteration counts + state.
  // Read once; consult per entry.
  const pipelineByEntryId = await readLegacyPipelineRecords(projectRoot);

  for (const src of sources) {
    // Build iteration history from journal — best-effort.
    const events = await readJournalEvents(projectRoot, { entryId: src.uuid });
    const iterationByStage = countIterationsByStage(events);

    // #141: fold legacy pipeline workflow data into iterationByStage at
    // the entry's currentStage. Pipeline records don't track per-stage,
    // so we attribute the highest currentVersion to currentStage.
    const pipelineSummary = pipelineByEntryId.get(src.uuid);
    if (pipelineSummary) {
      const stage = src.currentStage;
      const existing = iterationByStage[stage] ?? 0;
      if (pipelineSummary.currentVersion > existing) {
        iterationByStage[stage] = pipelineSummary.currentVersion;
      }
    }
    const earliest = events[0]?.at ?? new Date().toISOString();
    const latest = events[events.length - 1]?.at ?? new Date().toISOString();

    const priorStage = src.currentStage === 'Blocked' || src.currentStage === 'Cancelled'
      ? inferPriorStageFromJournal(events)
      : undefined;
    // #141: prefer the journal-derived reviewState; fall back to the
    // legacy pipeline-workflow state if the journal has no review-state-
    // change events for this entry.
    const reviewState =
      latestReviewStateFromJournal(events) ??
      (pipelineSummary ? translateLegacyState(pipelineSummary.state) : undefined);
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
