/**
 * journal.ts — directory-backed append-only record store.
 *
 * Each record lives in its own file under `dir/` named
 * `<normalized-timestamp>-<id>.json`. Timestamp normalization strips
 * filesystem-hostile characters (`:` and `.`) from ISO 8601 so the name
 * sorts chronologically by simple string comparison and stays portable.
 *
 * Why not a single JSONL? Monolithic append logs produce merge conflicts
 * when two branches each add entries to the tail — git sees overlapping
 * line ranges. One file per entry means writes never collide by
 * construction. Ported from audiocontrol.org's scripts/lib/journal/.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Normalize an ISO 8601 timestamp for use in a filename. Colons and dots
 * become dashes so the result is portable across filesystems and still
 * sorts chronologically by string comparison.
 */
export function normalizeTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function recordFilename(timestamp: string, id: string): string {
  return `${normalizeTimestamp(timestamp)}-${id}.json`;
}

function findFileById(dir: string, id: string): string | null {
  if (!existsSync(dir)) return null;
  const suffix = `-${id}.json`;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(suffix)) return join(dir, name);
  }
  return null;
}

function readFile<T>(path: string): T | null {
  try {
    const text = readFileSync(path, 'utf-8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export interface ReadJournalOptions {
  /**
   * Field on each record that carries the chronological key. Records are
   * sorted ascending by this field's value. Defaults to `timestamp`;
   * workflow items use `createdAt`.
   */
  timestampField?: string;
}

/** Read every record in a journal directory, oldest first. */
export function readJournal<T>(
  dir: string,
  options: ReadJournalOptions = {},
): T[] {
  if (!existsSync(dir)) return [];
  const timestampField = options.timestampField ?? 'timestamp';
  const records: T[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const record = readFile<T>(join(dir, name));
    if (record === null) continue;
    records.push(record);
  }
  records.sort((a, b) => {
    const aKey = String((a as Record<string, unknown>)[timestampField] ?? '');
    const bKey = String((b as Record<string, unknown>)[timestampField] ?? '');
    return aKey.localeCompare(bKey);
  });
  return records;
}

export interface AppendJournalOptions {
  /** Field that holds the unique id on each record. Defaults to `id`. */
  idField?: string;
  /** Field that holds the timestamp on each record. Defaults to `timestamp`. */
  timestampField?: string;
}

/**
 * Write a record to its own file under `dir`. The filename is derived from
 * the record's timestamp + id. If a file for this id already exists, it's
 * overwritten (so a caller that regenerates an entry stays idempotent).
 */
export function appendJournal<T>(
  dir: string,
  record: T,
  options: AppendJournalOptions = {},
): void {
  ensureDir(dir);
  const idField = options.idField ?? 'id';
  const timestampField = options.timestampField ?? 'timestamp';
  const id = String((record as Record<string, unknown>)[idField] ?? '');
  const timestamp = String((record as Record<string, unknown>)[timestampField] ?? '');
  if (!id) throw new Error(`appendJournal: record has no \`${idField}\` field`);
  if (!timestamp) throw new Error(`appendJournal: record has no \`${timestampField}\` field`);
  const existing = findFileById(dir, id);
  const target = existing ?? join(dir, recordFilename(timestamp, id));
  writeFileSync(target, JSON.stringify(record, null, 2) + '\n', 'utf-8');
}

/**
 * Merge `patch` into the record identified by `id`. Returns the updated
 * record, or `null` if no record matches. Touches exactly one file.
 */
export function updateJournal<T>(
  dir: string,
  id: string,
  patch: Partial<T>,
): T | null {
  const path = findFileById(dir, id);
  if (!path) return null;
  const current = readFile<T>(path);
  if (current === null) return null;
  const merged = { ...current, ...patch } as T;
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  return merged;
}

/** Remove the file for a given id. Returns true if a file was deleted. */
export function deleteJournal(dir: string, id: string): boolean {
  const path = findFileById(dir, id);
  if (!path) return false;
  unlinkSync(path);
  return true;
}
