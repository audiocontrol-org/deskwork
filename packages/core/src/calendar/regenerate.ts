import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { renderCalendar } from './render.ts';

/**
 * Read all sidecars under `.deskwork/entries/` and write
 * `.deskwork/calendar.md` reflecting their current state. Idempotent;
 * if no sidecars exist, calendar.md is rewritten with empty stage
 * sections.
 *
 * Used by:
 *   - the doctor's repair pass (canonical SSOT reconciliation),
 *   - every entry stage-transition helper (#148: keep calendar.md
 *     in sync after each approve/block/cancel/induct so adopters
 *     don't have to run `doctor --fix=all` to see their state).
 */
export async function regenerateCalendar(projectRoot: string): Promise<void> {
  const dir = sidecarsDir(projectRoot);
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    // No entries dir: write an empty calendar.
  }

  const entries: Entry[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    let raw: string;
    try {
      raw = await readFile(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) entries.push(parsed.data);
    } catch {
      // skip malformed
    }
  }

  const md = renderCalendar(entries);
  const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
  await mkdir(dirname(calendarPath), { recursive: true });
  await writeFile(calendarPath, md);
}
