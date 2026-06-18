// 026 T008 — the front-door marker (data-model § FrontDoorMarker, research D1). A
// stack-control capability-interface skill calls `enterFrontDoor` before driving a
// backend and `exitFrontDoor` after; the interceptor reads `activeCapabilities` to
// decide whether a backend invocation is sanctioned. The marker is a session-keyed
// JSON file holding a STACK of active entries (so nested/concurrent drives isolate —
// FR-014a), with embedded timestamps so a crashed `enter` cannot leak a permanent
// marker (staleness prune). Writes are atomic (temp-write + rename), mirroring the
// existing checkpoint I/O. Installation-anchored: the caller passes the resolved root.

import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/** One active front-door entry: a capability being driven, keyed by a unique token. */
export interface ActiveEntry {
  readonly capability: string;
  readonly token: string;
  readonly writtenAt: string; // ISO 8601
}

/** The session-keyed marker file contents. */
export interface FrontDoorMarker {
  readonly sessionId: string;
  readonly active: readonly ActiveEntry[];
}

const STATE_REL = join('.stack-control', 'state', 'front-door');

/** Staleness bound: an entry older than this is ignored on read (and pruned on write),
 *  so a front-door skill that crashed before `exit` cannot leave a marker that wrongly
 *  permits a later raw invocation. TRADEOFF (claude-06): too short → an `enter`-bracketed
 *  drive that runs longer than the bound gets its marker pruned mid-drive and the
 *  sanctioned call is then refused; too long → a leaked marker (crashed `enter`) wrongly
 *  permits for up to the bound. 12h is generous for an interactive session and short
 *  enough that a leak self-heals within a day; revisit if either failure is observed. */
const STALE_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Options carrying an injectable clock (tests pin `now`; production defaults to Date.now). */
export interface MarkerOptions {
  readonly now?: number;
}

/** Session ids become marker filenames, so they must be filename-safe — a `/` or `..`
 *  would let `--session` read/write/remove files OUTSIDE the state dir (codex-01). Guard
 *  at the marker boundary (covers every exported primitive), not just the CLI. */
const SAFE_SESSION = /^[A-Za-z0-9._-]+$/;

/** True when `session` is a filename-safe id (verbs use this for a clean exit-2 usage error). */
export function isSafeSession(session: string): boolean {
  return SAFE_SESSION.test(session);
}

export function assertSafeSession(session: string): void {
  if (!SAFE_SESSION.test(session)) {
    throw new Error(
      `front-door session id '${session}' is not filename-safe (allowed: letters, digits, '.', '_', '-')`,
    );
  }
}

function markerPath(installRoot: string, session: string): string {
  assertSafeSession(session);
  return join(installRoot, STATE_REL, `${session}.json`);
}

function isActiveEntry(value: unknown): value is ActiveEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.capability === 'string' && typeof e.token === 'string' && typeof e.writtenAt === 'string';
}

/** Read + validate the marker for a session, or null when absent. Fail loud on a
 *  malformed file — never silently treat corruption as "no marker" (Principle V). */
function readMarker(installRoot: string, session: string): FrontDoorMarker | null {
  const path = markerPath(installRoot, session);
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`front-door marker ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`front-door marker ${path} is malformed (expected an object)`);
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.sessionId !== 'string' || !Array.isArray(obj.active) || !obj.active.every(isActiveEntry)) {
    throw new Error(`front-door marker ${path} is malformed (bad sessionId/active shape)`);
  }
  // Bind contents to the requested session (codex): the file is session-keyed by path, so
  // its internal sessionId must match — a mismatch is corruption/tampering, fail loud.
  if (obj.sessionId !== session) {
    throw new Error(`front-door marker ${path} sessionId '${obj.sessionId}' does not match requested '${session}'`);
  }
  return { sessionId: obj.sessionId, active: obj.active };
}

function isFresh(entry: ActiveEntry, now: number): boolean {
  const at = Date.parse(entry.writtenAt);
  return Number.isFinite(at) && now - at <= STALE_AGE_MS;
}

function writeMarkerAtomic(installRoot: string, marker: FrontDoorMarker): void {
  const path = markerPath(installRoot, marker.sessionId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${randomUUID()}`;
  writeFileSync(tmp, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  renameSync(tmp, path); // atomic publish
}

const LOCK_STALE_MS = 5_000; // a lock older than this is presumed crashed → stolen
const LOCK_RETRY_MS = 15;
const LOCK_MAX_TRIES = 200; // ~3s of contention before failing loud

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Serialize a marker read-modify-write across processes with an O_EXCL lock, so two
 * concurrent `enter`/`exit` calls in the same session cannot lose-update each other
 * (codex-01 / FR-014a "concurrent entries isolate"). A lock older than LOCK_STALE_MS is
 * presumed abandoned by a crashed writer and stolen; sustained contention fails loud
 * rather than silently dropping an entry.
 */
function withMarkerLock<T>(installRoot: string, session: string, fn: () => T): T {
  const lockPath = `${markerPath(installRoot, session)}.lock`;
  mkdirSync(dirname(lockPath), { recursive: true });
  let fd: number | undefined;
  for (let tries = 0; tries < LOCK_MAX_TRIES && fd === undefined; tries++) {
    try {
      fd = openSync(lockPath, 'wx'); // O_EXCL — fails if another writer holds it
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { force: true }); // steal a crashed writer's lock
          continue;
        }
      } catch {
        continue; // lock vanished between open and stat — retry immediately
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
  if (fd === undefined) {
    throw new Error(`front-door marker lock for session '${session}' is held (contention/stale at ${lockPath})`);
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

/**
 * Mark a capability's front door as entered for `session`; returns the unique token
 * the caller passes to `exitFrontDoor`. Prunes stale entries while writing. Atomic.
 */
export function enterFrontDoor(
  installRoot: string,
  session: string,
  capability: string,
  opts: MarkerOptions = {},
): string {
  const now = opts.now ?? Date.now();
  const token = randomUUID();
  withMarkerLock(installRoot, session, () => {
    const existing = readMarker(installRoot, session);
    const kept = (existing?.active ?? []).filter((e) => isFresh(e, now));
    writeMarkerAtomic(installRoot, {
      sessionId: session,
      active: [...kept, { capability, token, writtenAt: new Date(now).toISOString() }],
    });
  });
  return token;
}

/**
 * Clear ONLY the entry whose `token` matches (FR-014a — a teardown never clears
 * another live entry). A missing file or unknown token is a no-op success, so exit
 * is safe to call after a crash. Prunes stale entries while writing.
 */
export function exitFrontDoor(
  installRoot: string,
  session: string,
  token: string,
  opts: MarkerOptions = {},
): void {
  const now = opts.now ?? Date.now();
  withMarkerLock(installRoot, session, () => {
    const existing = readMarker(installRoot, session);
    if (existing === null) return;
    const kept = existing.active.filter((e) => e.token !== token && isFresh(e, now));
    writeMarkerAtomic(installRoot, { sessionId: session, active: kept });
  });
}

/** The set of capability ids with an un-stale active front-door entry for `session`
 *  (empty when no marker / all entries stale). The interceptor's permit signal. */
export function activeCapabilities(
  installRoot: string,
  session: string,
  opts: MarkerOptions = {},
): Set<string> {
  const now = opts.now ?? Date.now();
  const marker = readMarker(installRoot, session);
  if (marker === null) return new Set();
  return new Set(marker.active.filter((e) => isFresh(e, now)).map((e) => e.capability));
}
