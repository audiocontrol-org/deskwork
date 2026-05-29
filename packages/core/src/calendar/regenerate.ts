import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { readConfig } from '../config.ts';
import { resolveCalendarPath } from '../paths.ts';
import { renderCalendar } from './render.ts';

/**
 * Read all sidecars under `.deskwork/entries/` and write the project's
 * configured editorial calendar (the default site's `calendarPath`,
 * resolved from `.deskwork/config.json`) reflecting their current state.
 * Idempotent; if no sidecars exist, the calendar is rewritten with empty
 * stage sections.
 *
 * #232: the calendar path is resolved from config — `resolveCalendarPath`
 * (default site) — instead of a hardcoded `.deskwork/calendar.md`, so
 * adopters whose config points `calendarPath` elsewhere see pipeline
 * updates land there (matching what `ingest` already does). Entries carry
 * no `site` field, so the entry-centric calendar is single; it targets the
 * default site's `calendarPath`. The common default (`.deskwork/calendar.md`)
 * is unchanged. Reads config rather than threading it through the five
 * stage-transition callers (approve/publish/block/cancel/induct); throws
 * via `readConfig` if config is absent (no silent fallback).
 *
 * Used by:
 *   - the doctor's repair pass (canonical SSOT reconciliation),
 *   - every entry stage-transition helper (#148: keep the calendar in
 *     sync after each approve/block/cancel/induct so adopters don't have
 *     to run `doctor --fix=all` to see their state).
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
  const calendarPath = resolveCalendarPath(projectRoot, readConfig(projectRoot));
  await mkdir(dirname(calendarPath), { recursive: true });
  await writeFile(calendarPath, md);
}
