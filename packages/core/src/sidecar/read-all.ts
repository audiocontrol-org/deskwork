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

/**
 * Enumerate `<projectRoot>/.deskwork/entries/*.json` names. ENOENT on
 * the sidecars dir itself yields the empty list (no entries yet);
 * other directory-level read failures propagate. Extracted so the
 * two public readers below share their directory-iteration shell and
 * differ only in per-file error handling.
 */
async function listSidecarPaths(projectRoot: string): Promise<string[]> {
  const dir = sidecarsDir(projectRoot);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return [];
    throw err;
  }
  return names.filter((n) => n.endsWith('.json')).map((n) => join(dir, n));
}

export async function readAllSidecars(projectRoot: string): Promise<Entry[]> {
  const paths = await listSidecarPaths(projectRoot);
  const out: Entry[] = [];
  for (const path of paths) {
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

/**
 * One unparseable sidecar discovered by `readAllSidecarsPartitioned`.
 * The `reason` is the verbatim error message from `JSON.parse` or
 * `EntrySchema.safeParse`; the `path` is the absolute file path so
 * downstream surfaces can either name the file or count and aggregate.
 */
export interface MalformedSidecar {
  readonly path: string;
  readonly reason: string;
}

/**
 * Partitioned result of `readAllSidecarsPartitioned`. Parseable
 * sidecars land in `entries`; per-file parse/schema failures land in
 * `malformed`. The function only throws on directory-level read
 * failures (anything other than ENOENT on the sidecars dir itself),
 * never on per-sidecar failures.
 */
export interface PartitionedSidecars {
  readonly entries: readonly Entry[];
  readonly malformed: readonly MalformedSidecar[];
}

/**
 * Read every sidecar but return per-file parse/schema failures on a
 * sibling `malformed` channel instead of throwing.
 *
 * This is the safety-critical reader for destructive operations whose
 * decision logic depends on enumerating EVERY referencing entry
 * (notably the doctor's lane-delete guard — see
 * AUDIT-20260530-78). A throwing reader collapses to "couldn't read,
 * refuse with a generic error"; a `catch { continue }` reader hides
 * the corrupt files and lets the destructive operation proceed on
 * incomplete data. Neither shape lets the caller distinguish
 * "I confirmed nothing references the doomed resource" from "I
 * couldn't confirm because some sidecars are unreadable" — both fail
 * the gate, but the second requires the operator repair the corrupt
 * sidecars before retrying, not retry with the same broken state.
 *
 * Mirrors the AUDIT-20260530-67 "unreadable channel" pattern from
 * the pipelines page's `buildLaneRefIndex`: known-unreadable files
 * become a structured count the caller can refuse on with a
 * specific message.
 */
export async function readAllSidecarsPartitioned(
  projectRoot: string,
): Promise<PartitionedSidecars> {
  const paths = await listSidecarPaths(projectRoot);
  const entries: Entry[] = [];
  const malformed: MalformedSidecar[] = [];
  for (const path of paths) {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      malformed.push({ path, reason: `read failed: ${reason}` });
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      malformed.push({ path, reason: `JSON invalid: ${reason}` });
      continue;
    }
    const result = EntrySchema.safeParse(json);
    if (!result.success) {
      malformed.push({ path, reason: `schema invalid: ${result.error.message}` });
      continue;
    }
    entries.push(result.data);
  }
  return { entries, malformed };
}
