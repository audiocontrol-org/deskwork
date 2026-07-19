// specs/037-instance-observability — T013 (impl), pairs with T012's RED test
// (tests/instance/current-session.test.ts). data-model.md § CurrentSessionRecord
// (D9):
//
//   CurrentSessionRecord = { sessionId: string, startedAt: string /* ISO */ }
//
// Lives beside `identity.ts`'s `installation-id` / `token.ts`'s `bearer-token`
// in `MachineStateLocation.durableDir` — machine-local, NEVER a git-tracked
// path (`.stack-control/` is version-controlled; this file is not under it).
//
// SUPERSEDE (FR-009a): `mint()` on an installation that already has an open
// session record does NOT nest or queue — it overwrites, and returns the OLD
// sessionId so the caller (the `session-start` verb) can emit
// `session.ended{reason:'abandoned'}` for it before starting the new one.
// First-ever mint (no prior record) returns `undefined` — there is no old
// session to supersede.
//
// ABSENT vs CORRUPT, mirroring identity.ts/highwater.ts: an absent record
// file is the ordinary "no session open" state (`read()` returns `null`,
// `mint()`'s supersede-id is `undefined`). A PRESENT but unparseable /
// wrong-shaped file is a durability failure and throws, naming the problem —
// never silently treated as absent (Constitution Principle V).
//
// No caller-supplied installation root: every entry point resolves the
// enclosing stack-control installation from `process.cwd()` via
// `resolveInstallation` (the same default `src/subcommands/workflow-shared.ts`
// uses), then locates that installation's machine-local store. This mirrors
// the module's real callers (the `session-start` / `session-end` verbs and
// every telemetry emit site), which always run from inside the installation
// they are reporting on.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 module resolution (no `@/` alias configured).
// Real filesystem only — no mocked fs (.claude/rules/testing.md).

import { chmodSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { locateMachineState } from './locate.js';
import { resolveInstallation } from '../config/installation.js';

/** Filename for the persisted current-session record inside the 0700 durable dir. */
const CURRENT_SESSION_FILENAME = 'current-session';

/**
 * File authorization mode for the persisted record — matches `identity.ts`'s
 * `installation-id` / `token.ts`'s `bearer-token` (both `0600`). The record
 * is not a secret, but it lives in the same durable dir under the same 0700
 * boundary, and the tighter file mode costs nothing.
 */
const FILE_MODE = 0o600;

/** The on-disk / in-memory shape of the current-session record (data-model.md D9). */
export interface CurrentSessionRecord {
  readonly sessionId: string;
  readonly startedAt: string;
}

/** Narrow an `unknown` catch value to a Node errno exception without `as`. */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The installation root current-session resolves against when the caller
 * does not supply one: the enclosing stack-control installation for the
 * current process, same default `src/subcommands/workflow-shared.ts` uses.
 */
function defaultInstallationRoot(): string {
  return resolveInstallation(process.cwd()).root;
}

function currentSessionPath(root: string): string {
  return join(locateMachineState(root).durableDir, CURRENT_SESSION_FILENAME);
}

/**
 * Read the raw content of the record file at `path`. Returns `undefined`
 * only for the "no session open" state (ENOENT) — every OTHER read failure
 * (permission denied, I/O error, a directory where a file was expected,
 * etc.) is re-thrown, never silently treated as absent.
 */
function readRawRecordFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
    throw new Error(
      `cannot read current-session record at ${path}: ${errorMessage(err)}. This ` +
        `is NOT the "no session open" case (ENOENT) — refusing to silently treat ` +
        `an unreadable file as absent.`,
    );
  }
}

/**
 * Parse + validate record-file content. A present file that does not parse
 * as a well-formed `{ sessionId: string, startedAt: string }` object is
 * corrupt — fails loud, a deliberately different outcome from "absent".
 */
function parseRecordFile(path: string, raw: string): CurrentSessionRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `current-session record at ${path} is corrupt (invalid JSON): ${errorMessage(err)}. ` +
        `Refusing to silently treat a corrupt record as absent.`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `current-session record at ${path} is corrupt: expected a JSON object, got ` +
        `${describeType(parsed)}.`,
    );
  }
  const { sessionId, startedAt } = parsed;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error(
      `current-session record at ${path} is corrupt: "sessionId" must be a non-empty ` +
        `string, got ${describeType(sessionId)}.`,
    );
  }
  if (typeof startedAt !== 'string' || startedAt.length === 0) {
    throw new Error(
      `current-session record at ${path} is corrupt: "startedAt" must be a non-empty ` +
        `string, got ${describeType(startedAt)}.`,
    );
  }
  return { sessionId, startedAt };
}

/**
 * Persist `record` at `path` as a 0600 file. `path`'s parent (the durable
 * dir) is already guaranteed to exist with the 0700 mode by
 * `locateMachineState` — every caller here reaches this via
 * `currentSessionPath`, which calls it first.
 */
function persistRecord(path: string, record: CurrentSessionRecord): void {
  writeFileSync(path, JSON.stringify(record), { encoding: 'utf8', mode: FILE_MODE });
  // writeFileSync's mode is subject to umask; chmod the file we own so the
  // 0600 boundary is exact regardless of process umask (mirrors
  // identity.ts's persistId). Windows uses ACLs, not POSIX bits — chmod
  // there only toggles the read-only bit, so skip it.
  if (process.platform !== 'win32') {
    chmodSync(path, FILE_MODE);
  }
}

/**
 * Mint (or supersede) the current-session record for the enclosing
 * installation: persists `{ sessionId, startedAt }` to the machine-local
 * durable dir.
 *
 * Returns `undefined` when there was no prior open session (first mint).
 * Returns the OLD `sessionId` when this mint supersedes an existing record
 * (FR-009a) — the caller emits `session.ended{reason:'abandoned'}` for it
 * before treating the new session as open. Either way the new record is
 * persisted, overwriting whatever was there.
 */
export function mint(sessionId: string, startedAt: string): string | undefined {
  const path = currentSessionPath(defaultInstallationRoot());
  const raw = readRawRecordFile(path);
  const priorSessionId = raw === undefined ? undefined : parseRecordFile(path, raw).sessionId;
  persistRecord(path, { sessionId, startedAt });
  return priorSessionId;
}

/**
 * Read the current-session record for the enclosing installation, or `null`
 * if no session is open. Never mints — a pure read. Throws if a present
 * record file is corrupt (see module header).
 */
export function read(): CurrentSessionRecord | null {
  const path = currentSessionPath(defaultInstallationRoot());
  const raw = readRawRecordFile(path);
  if (raw === undefined) return null;
  return parseRecordFile(path, raw);
}

/**
 * Remove the current-session record for the enclosing installation. A
 * no-op (never throws) when no record exists — clearing an already-clear
 * store is not an error.
 */
export function clear(): void {
  const path = currentSessionPath(defaultInstallationRoot());
  try {
    unlinkSync(path);
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return;
    throw new Error(`cannot clear current-session record at ${path}: ${errorMessage(err)}.`);
  }
}
