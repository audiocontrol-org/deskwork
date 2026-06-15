import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { readConfig } from '../config.ts';
import { resolveCalendarPath } from '../paths.ts';
import { renderCalendar } from '../calendar/render.ts';

export interface RepairOptions {
  destructive: boolean;
}

export interface RepairResult {
  applied: string[];
  pendingDestructive: string[];
}

/**
 * Regenerate `calendar.md` from sidecars (the SSOT).
 *
 * Phase 39d (sites→lanes retirement): the runtime `artifactPath`
 * backfiller that used to live here is REMOVED. Backfilling missing
 * `artifactPath` is owned exclusively by the 39b migration
 * (`sites-migration-backfill.ts`), which enumerates candidates across
 * legacy content dirs and halts on ambiguity. `repair.ts` no longer
 * derives a path from the slug+stage heuristic — it reads stored paths
 * only and regenerates the calendar projection.
 */
export async function repairAll(projectRoot: string, opts: RepairOptions): Promise<RepairResult> {
  void opts;
  const result: RepairResult = { applied: [], pendingDestructive: [] };

  // Regenerate calendar.md from sidecars
  const dir = sidecarsDir(projectRoot);
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return result; }

  const entries: Entry[] = [];
  for (const name of names.filter(n => n.endsWith('.json'))) {
    const sidecarPath = join(dir, name);
    const raw = await readFile(sidecarPath, 'utf8');
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        entries.push(parsed.data);
      }
    } catch { /* skip malformed */ }
  }

  const md = renderCalendar(entries);
  // #232: honor the configured per-site calendarPath (default site) rather
  // than the hardcoded `.deskwork/calendar.md`, consistent with regenerateCalendar.
  const calendarPath = resolveCalendarPath(projectRoot, readConfig(projectRoot));
  await mkdir(dirname(calendarPath), { recursive: true });
  await writeFile(calendarPath, md);
  result.applied.push('calendar-regenerated');

  return result;
}
