import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { EntrySchema, type Entry, type Stage } from '../schema/entry.ts';
import { extractEntriesForMigration } from '../calendar/parse.ts';
import { readJournalEvents } from '../journal/read.ts';

export interface ValidationFailure {
  category:
    | 'schema'
    | 'calendar-sidecar'
    | 'frontmatter-sidecar'
    | 'journal-sidecar'
    | 'iteration-history'
    | 'file-presence'
    | 'stage-invariants'
    | 'cross-entry'
    | 'migration';
  message: string;
  entryId?: string;
  path?: string;
}

export interface ValidationResult {
  failures: ValidationFailure[];
}

async function validateSchema(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const dir = join(projectRoot, '.deskwork', 'entries');
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return failures;
  }

  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const path = join(dir, name);
    const raw = await readFile(path, 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      failures.push({ category: 'schema', message: 'JSON parse failed', path });
      continue;
    }
    const result = EntrySchema.safeParse(json);
    if (!result.success) {
      failures.push({ category: 'schema', message: result.error.message, path });
    }
  }
  return failures;
}

async function readSidecarUuids(projectRoot: string): Promise<Set<string>> {
  const dir = join(projectRoot, '.deskwork', 'entries');
  const uuids = new Set<string>();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return uuids;
  }
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    uuids.add(name.replace(/\.json$/, ''));
  }
  return uuids;
}

async function validateCalendarSidecar(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
  let md: string;
  try {
    md = await readFile(calendarPath, 'utf8');
  } catch {
    return failures;
  }
  const calendarEntries = extractEntriesForMigration(md);
  const calendarUuids = new Set(calendarEntries.map((e) => e.uuid));
  const sidecarUuids = await readSidecarUuids(projectRoot);

  for (const uuid of calendarUuids) {
    if (!sidecarUuids.has(uuid)) {
      failures.push({
        category: 'calendar-sidecar',
        message: `calendar.md lists uuid ${uuid} but no sidecar exists at .deskwork/entries/${uuid}.json`,
        entryId: uuid,
        path: calendarPath,
      });
    }
  }
  for (const uuid of sidecarUuids) {
    if (!calendarUuids.has(uuid)) {
      failures.push({
        category: 'calendar-sidecar',
        message: `sidecar ${uuid}.json exists but calendar.md does not list this uuid`,
        entryId: uuid,
        path: join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      });
    }
  }
  return failures;
}

interface LoadedSidecar {
  filename: string;
  path: string;
  entry: Entry;
}

async function loadSidecars(projectRoot: string): Promise<LoadedSidecar[]> {
  const dir = join(projectRoot, '.deskwork', 'entries');
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: LoadedSidecar[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const path = join(dir, name);
    const raw = await readFile(path, 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const result = EntrySchema.safeParse(json);
    if (!result.success) continue;
    out.push({ filename: name, path, entry: result.data });
  }
  return out;
}

/**
 * Stage-conventional artifact path. Returns null when a stage does not have a
 * primary on-disk artifact (e.g. Blocked / Cancelled).
 *
 * Note: Published shares the Drafting/Final path (`docs/<slug>/index.md`).
 */
function artifactPathForStage(projectRoot: string, slug: string, stage: Stage): string | null {
  switch (stage) {
    case 'Ideas':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md');
    case 'Planned':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'plan.md');
    case 'Outlining':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'outline.md');
    case 'Drafting':
    case 'Final':
    case 'Published':
      return join(projectRoot, 'docs', slug, 'index.md');
    case 'Blocked':
    case 'Cancelled':
      return null;
  }
}

/**
 * Minimal frontmatter `deskwork.stage` extractor.
 *
 * The plugin's frontmatter is YAML-ish, but for the validator's narrow purpose
 * (read `deskwork.stage`) a regex avoids pulling a full YAML parser into the
 * validator codepath. We match the `deskwork:` block and find a `stage:` line
 * inside it, accepting any indentation.
 */
function extractDeskworkStage(markdown: string): string | undefined {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return undefined;
  const fm = fmMatch[1];
  // Find the line `deskwork:` (the block opener) and then any subsequent
  // indented child line of the form `  stage: <value>` before either the next
  // unindented line or end-of-frontmatter.
  const lines = fm.split('\n');
  let inBlock = false;
  for (const line of lines) {
    if (!inBlock) {
      if (/^deskwork:\s*$/.test(line)) inBlock = true;
      continue;
    }
    // Exit the block when we hit a non-indented, non-empty line.
    if (line.length > 0 && !/^\s/.test(line)) break;
    const m = line.match(/^\s+stage:\s*([^\s#]+)/);
    if (m) return m[1];
  }
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function validateFrontmatterSidecar(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);
  for (const { entry, path: sidecarPath } of sidecars) {
    const artifactPath = artifactPathForStage(projectRoot, entry.slug, entry.currentStage);
    if (!artifactPath) continue;
    if (!(await fileExists(artifactPath))) continue; // file-presence handles missing artifacts
    const md = await readFile(artifactPath, 'utf8');
    const fmStage = extractDeskworkStage(md);
    if (fmStage === undefined) continue;
    if (fmStage !== entry.currentStage) {
      failures.push({
        category: 'frontmatter-sidecar',
        message: `frontmatter deskwork.stage=${fmStage} at ${artifactPath} does not match sidecar currentStage=${entry.currentStage}`,
        entryId: entry.uuid,
        path: sidecarPath,
      });
    }
  }
  return failures;
}

async function validateJournalSidecar(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);
  for (const { entry, path } of sidecars) {
    const events = await readJournalEvents(projectRoot, { entryId: entry.uuid });

    // readJournalEvents sorts ascending by `at`, so the latest is at the end.
    const stageTransitions = events.filter((e) => e.kind === 'stage-transition');
    const latestStageTransition = stageTransitions.at(-1);
    if (latestStageTransition && latestStageTransition.kind === 'stage-transition') {
      if (latestStageTransition.to !== entry.currentStage) {
        failures.push({
          category: 'journal-sidecar',
          message: `latest stage-transition.to=${latestStageTransition.to} does not match sidecar currentStage=${entry.currentStage}`,
          entryId: entry.uuid,
          path,
        });
      }
    }

    const reviewChanges = events.filter((e) => e.kind === 'review-state-change');
    const latestReview = reviewChanges.at(-1);
    if (latestReview && latestReview.kind === 'review-state-change') {
      const sidecarReview = entry.reviewState ?? null;
      if (latestReview.to !== sidecarReview) {
        failures.push({
          category: 'journal-sidecar',
          message: `latest review-state-change.to=${String(latestReview.to)} does not match sidecar reviewState=${String(sidecarReview)}`,
          entryId: entry.uuid,
          path,
        });
      }
    }
  }
  return failures;
}

export async function validateAll(projectRoot: string): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];
  failures.push(...(await validateSchema(projectRoot)));
  failures.push(...(await validateCalendarSidecar(projectRoot)));
  failures.push(...(await validateFrontmatterSidecar(projectRoot)));
  failures.push(...(await validateJournalSidecar(projectRoot)));
  // Tasks 27-30 add: validateIterationHistory, validateFilePresence,
  // validateStageInvariants, validateCrossEntry.
  return { failures };
}
