// specs/036-fleet-control-plane — AUDIT-20260717-14 (persist + replay the
// live event log); AUDIT-20260718-16 (REGRESSION fix — crash-safe append +
// crash-tolerant boot replay); AUDIT-20260718-42 (REGRESSION fix — the
// AUDIT-20260718-16 recovery path could itself leave a non-newline-
// terminated tail on disk, which the next append would silently
// concatenate onto). Pairs with tests/fleet/plane-runtime-fixes.test.ts's
// restart-recovery scenario and tests/fleet/event-log-crash-safety.test.ts's
// crash-safety scenarios.
//
// THE DEFECT THIS CLOSES (AUDIT-20260717-14): `createPlaneRuntime` held the
// entire accepted-event history in a single in-process array with NO
// persistence, so a plane restart (deploy, crash, supervisor bounce) wiped
// the whole live registry — and the ingesting sidecars will not naturally
// replay already-accepted (200'd) events, since their WAL drain cursor
// already advanced past them. The feature's stated purpose (durable
// operational visibility into a fleet) did not survive the plane's OWN
// restart.
//
// THE FIX (proportionate, single-operator scale FR-078): every ACCEPTED
// classified event is appended, append-only, to a durable on-disk log
// (JSONL). On boot, `createEventLog` REPLAYS that log so a fresh runtime over
// the same durable dir rehydrates its registry — restart recovers.
//
// THE REGRESSION THIS ALSO CLOSES (AUDIT-20260718-16): the first-cut
// `append` wrote with plain `appendFileSync` — no `fsyncSync` — unlike the
// crash-safe pattern this same feature established in
// `src/plane/commands/store.ts` (`persistRecord`: write-temp, fsync,
// atomic rename, fsync dir). And boot replay called `parseLine` on every
// non-empty line with NO recovery: a crash mid-append leaves the log's
// TRAILING line truncated, and the very next boot's replay threw on that
// truncated tail — turning one transient crash into indefinite plane
// unavailability until an operator hand-edited the file. The fix: (1)
// `append` now opens the file, writes, and `fsyncSync`s the fd before
// closing it — durable before the synchronous call returns; (2) boot replay
// is crash-tolerant for the TRAILING line only — a truncated/unparseable
// final line (the shape a crash-in-progress append leaves) is recovered by
// skip-and-truncate, never re-thrown, while every prior, fully-durable event
// still replays. A corrupt line found BEFORE the tail is genuine corruption
// (not an artifact of a crash in progress) and still fails loud — the
// original fail-loud contract is preserved for real corruption.
//
// THE FURTHER REGRESSION THIS CLOSES (AUDIT-20260718-42): the
// AUDIT-20260718-16 recovery path had three branches for the trailing
// line — empty (skip), non-empty-and-parses (push, no truncation),
// non-empty-and-fails-to-parse (truncate). The middle branch assumed a
// well-formed final line with no trailing newline could not be the crash
// shape; that is wrong — a torn write can be cut short by exactly the
// final `\n` byte, leaving the JSON body intact and parseable but the file
// not newline-terminated. Since `appendDurably` opened in plain append
// mode and wrote `${json}\n` with no separator logic, the next successful
// append landed directly after that unterminated tail, concatenating two
// independently-durable records into one unparseable line — defeating the
// crash-safety AUDIT-20260718-16 exists to provide. The fix:
// `appendDurably` now defensively re-terminates any pre-existing
// unterminated tail (reading the file's last byte; writing+fsyncing a
// single `\n` at end-of-file if missing) BEFORE writing the new record, so
// two durable records can never merge (see `ensureNewlineTerminated`).
//
// SCOPE (flagged, not half-built): this closes the "unrecoverable across
// restart" consequence. Fully BOUNDING the in-memory `events` array (which the
// registry re-folds per read) to a windowed/compacted form needs an
// incremental-registry refactor; and the deeper "sidecar re-announcement (C8)"
// design (a reconnecting sidecar re-declaring its live runs) is a separate
// design question. Persist+replay here directly fixes the recovery consequence
// the audit names; the ingest dedupe set is separately capped
// (src/plane/http/ingest.ts).
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias). Real `node:fs` — never a mocked
// filesystem. A corrupt line found before the trailing line still fails
// loud; only a truncated trailing line (the crash-in-progress shape) is
// recovered.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  truncateSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { validateEnvelope, validateSnapshot } from '../fleet/event.js';
import type { ClassifiedEvent } from './registry.js';

/** File name for the append-only accepted-event log under the log dir. */
const LOG_FILE = 'accepted-events.log';

/** The persistent accepted-event log. `replayed` is the recovered history
 * (in append order) read at construction; `append` durably records one newly
 * accepted event. */
export interface EventLog {
  readonly replayed: readonly ClassifiedEvent[];
  append(event: ClassifiedEvent): void;
}

/**
 * Reconstruct a {@link ClassifiedEvent} from one persisted JSONL line. The
 * envelope is re-validated with the same `validateEnvelope` the ingest
 * boundary uses (fail loud on a corrupt record); `classification` / `type` are
 * derived from the validated envelope so the recovered event is always
 * internally consistent — never trusted verbatim off disk. The bounded
 * `snapshot` (specs/037 D5) is likewise re-validated with `validateSnapshot`
 * (same `≤ 32 KiB` / no-history bound the ingest boundary enforced) so a
 * persisted event-specific payload survives a plane restart intact.
 */
function parseLine(line: string, source: string): ClassifiedEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (error) {
    throw new Error(
      `createEventLog: corrupt line in ${source} — not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof raw !== 'object' || raw === null || !('envelope' in raw)) {
    throw new Error(`createEventLog: corrupt line in ${source} — missing "envelope".`);
  }
  if (!('snapshot' in raw)) {
    throw new Error(`createEventLog: corrupt line in ${source} — missing "snapshot".`);
  }
  const record: { envelope: unknown; snapshot: unknown } = raw;
  const envelope = validateEnvelope(record.envelope);
  const snapshot = validateSnapshot(record.snapshot);
  return { envelope, classification: envelope.classification, type: envelope.type, snapshot };
}

/**
 * Replay `path`'s persisted lines into an ordered `ClassifiedEvent[]`,
 * tolerating a truncated TRAILING line (AUDIT-20260718-16: the shape a
 * crash mid-append leaves) but still failing loud on a malformed line found
 * anywhere before the tail (genuine corruption, not a crash artifact).
 *
 * Every `append` writes exactly `${json}\n`, so a fully-durable file's raw
 * text always ends in `\n` — `text.split('\n')` on a healthy file yields an
 * empty final element. A crash mid-write instead leaves a non-empty,
 * unparseable final element; that final element is the ONLY one this replay
 * recovers from by omission rather than re-throwing.
 *
 * Recovery is skip-AND-TRUNCATE, not merely skip: dropping the bad tail
 * only from the in-memory `replayed` array would leave the garbage bytes on
 * disk, and the next `append` (a plain file-append) would concatenate its
 * new line directly onto that unterminated fragment — corrupting the NEW
 * entry too. So a recovered tail is also `truncateSync`'d off the file, at
 * the byte offset immediately after the last known-good line, restoring a
 * clean append boundary.
 */
function replayLog(path: string): ClassifiedEvent[] {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const lastIndex = lines.length - 1;
  const replayed: ClassifiedEvent[] = [];
  let goodPrefixBytes = 0;
  for (const [i, line] of lines.entries()) {
    const isLast = i === lastIndex;
    if (line.trim() === '') {
      if (!isLast) {
        goodPrefixBytes += Buffer.byteLength(line, 'utf8') + 1;
      }
      continue;
    }
    if (isLast) {
      try {
        replayed.push(parseLine(line, path));
        // A well-formed final line with no trailing newline is STILL a
        // possible crash shape (AUDIT-20260718-42): a torn write can be cut
        // short by exactly the final `\n` byte, leaving the JSON body fully
        // intact and parseable while the file is not newline-terminated.
        // Recovery here does not need to truncate anything — the record is
        // genuinely durable and correct — but the file's on-disk
        // termination is repaired lazily, by `appendDurably`'s
        // `ensureNewlineTerminated` guard, the next time (if ever) a new
        // record is durably appended. That guard is what actually prevents
        // the corruption; nothing further is required here.
      } catch {
        // Truncated trailing line from a crash-in-progress append: recover
        // the good prefix already pushed above (drop only this partial
        // tail from the in-memory replay, never re-thrown), AND truncate
        // the same bad tail off disk so the next `append` starts clean.
        truncateSync(path, goodPrefixBytes);
      }
      continue;
    }
    replayed.push(parseLine(line, path));
    goodPrefixBytes += Buffer.byteLength(line, 'utf8') + 1;
  }
  return replayed;
}

/**
 * Ensure `path` (if it exists and is non-empty) ends with a trailing `\n`
 * before the next durable append writes to it (AUDIT-20260718-42).
 *
 * `replayLog` recovers a well-formed-but-non-newline-terminated trailing
 * line WITHOUT truncating it — that line can be the intact tail of a torn
 * write cut short by exactly the final `\n` byte (the JSON body survives;
 * only the terminator is lost). If the next `append` simply opened in plain
 * append mode and wrote `${json}\n` onto that unterminated tail, the new
 * bytes would land directly after the old ones with no separator, producing
 * one concatenated, unparseable line — permanently corrupting a record that
 * was itself fully durable and already fsynced. So every durable append
 * first repairs any pre-existing unterminated tail (reading only the final
 * byte, then writing+fsyncing a single `\n` at end-of-file) BEFORE writing
 * the new record, so two independently-durable records can never merge
 * into one unparseable line.
 */
function ensureNewlineTerminated(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  const size = statSync(path).size;
  if (size === 0) {
    return;
  }
  const fd = openSync(path, 'r+');
  try {
    const lastByte = Buffer.alloc(1);
    readSync(fd, lastByte, 0, 1, size - 1);
    if (lastByte[0] === 0x0a) {
      return;
    }
    writeSync(fd, '\n', size);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Durably append one JSONL line to `path`: first repair any pre-existing
 * unterminated tail (`ensureNewlineTerminated`, AUDIT-20260718-42), then
 * open for append, write, and `fsyncSync` the fd before closing it —
 * matching the crash-safe pattern `src/plane/commands/store.ts`'s
 * `persistRecord` already established for this feature. Synchronous
 * end-to-end (callers rely on ordering; see `src/plane/runtime.ts`'s
 * `eventLog.append` call, which must observe the write as durable before it
 * returns) (AUDIT-20260718-16).
 */
function appendDurably(path: string, event: ClassifiedEvent): void {
  ensureNewlineTerminated(path);
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, `${JSON.stringify(event)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Open (or create) the durable accepted-event log rooted at `dir`, replaying
 * any prior lines so a fresh runtime over an existing dir recovers its live
 * event history. Creates `dir` if absent.
 */
export function createEventLog(dir: string): EventLog {
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new Error('createEventLog: dir must be a non-empty path string.');
  }
  mkdirSync(dir, { recursive: true });
  const path = join(dir, LOG_FILE);

  const replayed: ClassifiedEvent[] = existsSync(path) ? replayLog(path) : [];

  return {
    replayed,
    append(event: ClassifiedEvent): void {
      appendDurably(path, event);
    },
  };
}
