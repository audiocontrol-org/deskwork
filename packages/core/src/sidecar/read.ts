import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { EntrySchema, type Entry } from '../schema/entry.ts';
import { sidecarPath } from './paths.ts';

/** Shared JSON + schema parse so the async/sync readers report identically. */
function parseSidecar(raw: string, path: string): Entry {
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
  return parseSidecar(raw, path);
}

/**
 * Synchronous sibling of `readSidecar` (Phase 39c-2b(a)). The shortform/
 * longform workflow path resolvers in `review/workflow-paths.ts` are sync
 * and need the sidecar's `artifactPath`; this reads the same file with
 * `readFileSync` and shares the parse + error messages with the async
 * reader.
 */
export function readSidecarSync(projectRoot: string, uuid: string): Entry {
  const path = sidecarPath(projectRoot, uuid);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new Error(`sidecar not found: ${path}`);
    }
    throw err;
  }
  return parseSidecar(raw, path);
}
