import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { renderCalendar } from '../calendar/render.ts';

export interface RepairOptions {
  destructive: boolean;
}

export interface RepairResult {
  applied: string[];
  pendingDestructive: string[];
}

export async function repairAll(projectRoot: string, opts: RepairOptions): Promise<RepairResult> {
  void opts;
  const result: RepairResult = { applied: [], pendingDestructive: [] };

  // Regenerate calendar.md from sidecars
  const dir = sidecarsDir(projectRoot);
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return result; }

  const entries: Entry[] = [];
  for (const name of names.filter(n => n.endsWith('.json'))) {
    const raw = await readFile(join(dir, name), 'utf8');
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) entries.push(parsed.data);
    } catch { /* skip malformed */ }
  }

  const md = renderCalendar(entries);
  const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
  await mkdir(dirname(calendarPath), { recursive: true });
  await writeFile(calendarPath, md);
  result.applied.push('calendar-regenerated');

  return result;
}
