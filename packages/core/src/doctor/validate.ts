import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EntrySchema } from '../schema/entry.ts';

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

export async function validateAll(projectRoot: string): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];
  failures.push(...(await validateSchema(projectRoot)));
  // Tasks 24-30 add: validateCalendarSidecar, validateFrontmatterSidecar,
  // validateJournalSidecar, validateIterationHistory, validateFilePresence,
  // validateStageInvariants, validateCrossEntry. Each follows the same shape.
  return { failures };
}
