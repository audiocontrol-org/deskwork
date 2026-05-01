/**
 * Read every sidecar under `<projectRoot>/.deskwork/entries/*.json`.
 *
 * Used by surfaces that need to enumerate all entries (the studio
 * dashboard, doctor cross-entry checks, doctor calendar regeneration).
 * Malformed JSON or schema-invalid sidecars throw — silently skipping
 * would mask the very corruption doctor is meant to catch.
 *
 * Returns entries in undefined order. Callers that care about ordering
 * (the dashboard groups by stage and sorts by slug) sort downstream.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { sidecarsDir } from './paths.ts';

export async function readAllSidecars(projectRoot: string): Promise<Entry[]> {
  const dir = sidecarsDir(projectRoot);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return [];
    throw err;
  }

  const out: Entry[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const path = join(dir, name);
    const raw = await readFile(path, 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`sidecar JSON invalid at ${path}`);
    }
    const result = EntrySchema.safeParse(json);
    if (!result.success) {
      throw new Error(`sidecar schema invalid at ${path}: ${result.error.message}`);
    }
    out.push(result.data);
  }
  return out;
}
