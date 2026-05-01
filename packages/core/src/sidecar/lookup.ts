import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sidecarsDir } from './paths.ts';
import { EntrySchema } from '../schema/entry.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveEntryUuid(projectRoot: string, input: string): Promise<string> {
  if (UUID_RE.test(input)) return input;

  const dir = sidecarsDir(projectRoot);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    throw new Error(`slug '${input}' not found (no sidecars)`);
  }

  for (const name of names.filter(n => n.endsWith('.json'))) {
    const raw = await readFile(join(dir, name), 'utf8');
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.slug === input) return parsed.data.uuid;
    } catch {
      /* skip malformed sidecars */
    }
  }
  throw new Error(`slug '${input}' not found`);
}
