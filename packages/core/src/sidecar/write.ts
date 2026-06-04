import { mkdir, rename, writeFile } from 'node:fs/promises';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
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

/**
 * Synchronous sibling of `writeSidecar` (Phase 39c-2b(a)). `renameSlug`
 * is a sync helper and rewrites the entry's `artifactPath` after moving
 * the file/dir; this validates + atomically writes the same way.
 */
export function writeSidecarSync(projectRoot: string, entry: Entry): void {
  const result = EntrySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`writeSidecarSync refused: schema invalid: ${result.error.message}`);
  }
  const path = sidecarPath(projectRoot, entry.uuid);
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(entry, null, 2));
  renameSync(tmpPath, path);
}
