import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JournalEventSchema, type JournalEvent } from '../schema/journal-events.ts';

interface ReadOptions {
  entryId?: string;
  stage?: string;
  kinds?: string[];
}

export async function readJournalEvents(projectRoot: string, opts: ReadOptions = {}): Promise<JournalEvent[]> {
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'history');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return [];
    throw err;
  }

  const events: JournalEvent[] = [];
  for (const name of names.filter(n => n.endsWith('.json'))) {
    const raw = await readFile(join(dir, name), 'utf8');
    let json: unknown;
    try { json = JSON.parse(raw); } catch { continue; }
    const parsed = JournalEventSchema.safeParse(json);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (opts.entryId && e.entryId !== opts.entryId) continue;
    if (opts.stage && 'stage' in e && e.stage !== opts.stage) continue;
    if (opts.kinds && !opts.kinds.includes(e.kind)) continue;
    events.push(e);
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  return events;
}
