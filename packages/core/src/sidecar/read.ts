import { readFile } from 'node:fs/promises';
import { EntrySchema, type Entry } from '@/schema/entry';
import { sidecarPath } from '@/sidecar/paths';

export async function readSidecar(projectRoot: string, uuid: string): Promise<Entry> {
  const path = sidecarPath(projectRoot, uuid);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new Error(`sidecar not found: ${path}`);
    }
    throw err;
  }
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
  return result.data;
}
