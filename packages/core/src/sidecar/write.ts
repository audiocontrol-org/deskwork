import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { sidecarPath } from './paths.ts';

export async function writeSidecar(projectRoot: string, entry: Entry): Promise<void> {
  const result = EntrySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`writeSidecar refused: schema invalid: ${result.error.message}`);
  }
  const path = sidecarPath(projectRoot, entry.uuid);
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(entry, null, 2));
  await rename(tmpPath, path);
}
