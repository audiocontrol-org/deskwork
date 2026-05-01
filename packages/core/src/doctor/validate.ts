import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EntrySchema } from '../schema/entry.ts';
import { extractEntriesForMigration } from '../calendar/parse.ts';

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

export async function validateAll(projectRoot: string): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];
  failures.push(...(await validateSchema(projectRoot)));
  failures.push(...(await validateCalendarSidecar(projectRoot)));
  // Tasks 25-30 add: validateFrontmatterSidecar, validateJournalSidecar,
  // validateIterationHistory, validateFilePresence, validateStageInvariants,
  // validateCrossEntry.
  return { failures };
}
