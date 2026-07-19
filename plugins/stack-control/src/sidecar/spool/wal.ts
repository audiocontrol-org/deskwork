// specs/036-fleet-control-plane — T084 (impl), pairs with T080's RED test
// (tests/fleet/wal-crash.test.ts). Phase 6 (US4 — trust what the fleet says).
//
// The CRASH-SAFE WRITE-AHEAD SPOOL (research.md R-03, PT-003; data-model.md §
// Storage layout / FR-049 — SETTLED, not re-derived here):
//
//   The spec's original phrasing — "the sidecar must not exit holding an
//   un-flushed spool" — is UNSATISFIABLE by construction: `SIGKILL` runs no
//   code, so no graceful-shutdown flush can be the durability guarantee. R-03
//   inverts it: a record is durable (fsync'd to disk) BEFORE `append()`'s
//   promise resolves — fsync-before-ack. A SIGKILL mid-spool therefore loses
//   NO record that was ever acknowledged, because "acknowledged" already means
//   "on disk". Replay on restart recovers every durable record. Graceful
//   `close()` is demoted from a correctness guarantee to a latency
//   optimization; durability NEVER depends on it.
//
//   Composes with FR-049: the spooled payload is opaque bytes to the WAL,
//   never reinterpreted — replayed byte-identical to what was appended, so the
//   caller's at-least-once transmit loop can re-emit it verbatim.
//
// DURABILITY MECHANISM: an append-only log file of newline-delimited JSON
// records. Each append writes one framed line, fsyncs the file descriptor
// (mirrors src/plane/commands/store.ts's fsync-before-ack idiom), and — the
// first time the log file is created — fsyncs the containing directory so the
// file's existence is itself durable. A record is only ever considered
// complete once its terminating newline is durable; a torn trailing record
// left by a crash mid-write (no terminating newline) is detected and skipped
// on replay rather than deserialized as garbage. A corrupt NON-trailing record
// (a complete line that fails to parse) is a genuine corruption and fails loud.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias — this plugin has none).
// No fallbacks / no silent defaults — an unwritable dir or a corrupt record
// throws a descriptive error (fail loud). Never a mocked filesystem: the WAL
// is real `node:fs` against a real directory (.claude/rules/testing.md).

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

/** The append-only log file's name inside the WAL directory. */
const WAL_FILENAME = 'spool.wal';

/**
 * A single durably-spooled record.
 *
 * `sequence` is a monotonic, 1-based counter assigned by the WAL at append
 * time and preserved across restart (a fresh handle over the same directory
 * continues the count from the last durable record). `payload` is opaque bytes
 * to the WAL — byte-identical on replay to what was appended (FR-049).
 */
export interface WalRecord {
  readonly sequence: number;
  readonly payload: string;
}

/**
 * A handle over a crash-safe write-ahead spool rooted at one directory.
 */
export interface WalHandle {
  /**
   * Append `payload` and assign it the next monotonic `sequence`. The record
   * is durable (fsync'd to disk) BEFORE the returned promise resolves
   * (fsync-before-ack, R-03) — a resolved `append()` is safe to treat as
   * "acknowledged upstream".
   */
  append(payload: string): Promise<void>;
  /**
   * Read every durably-written record back, in write order. Works after an
   * ungraceful restart: a fresh handle over a directory whose prior handle was
   * never `close()`d still recovers every durable record.
   */
  replay(): Promise<WalRecord[]>;
  /**
   * Graceful-shutdown path (a latency optimization per PT-003). Durability
   * NEVER depends on this being called; a crash that skips it loses nothing.
   */
  close(): Promise<void>;
}

/** The on-disk framed shape of one WAL record (one newline-delimited line). */
interface FramedRecord {
  readonly sequence: number;
  readonly payload: string;
}

// ---------------------------------------------------------------------------
// Narrowing helpers — `unknown` -> typed, never `as` (mirrors store.ts).
// ---------------------------------------------------------------------------

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse one complete framed line into a `FramedRecord`. A complete line that
 * does not parse to a well-formed record is genuine corruption (NOT a torn
 * trailing write — the caller has already peeled that off) and fails loud.
 */
function parseFramedRecord(line: string, path: string, lineNumber: number): FramedRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `WAL spool at ${path} is corrupt: record on line ${lineNumber} is complete ` +
        `(newline-terminated) but is not valid JSON: ${detail}. A complete record that does ` +
        'not parse is genuine corruption, never a torn trailing write — this is a fail-loud ' +
        'condition, never a silent skip.',
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `WAL spool at ${path} is corrupt: record on line ${lineNumber} is not a JSON object ` +
        `(got ${describeType(parsed)}).`,
    );
  }
  const { sequence, payload } = parsed;
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1) {
    throw new Error(
      `WAL spool at ${path} is corrupt: record on line ${lineNumber} has an invalid ` +
        `"sequence" (expected a positive integer, got ${describeType(sequence)} ` +
        `${String(sequence)}).`,
    );
  }
  if (typeof payload !== 'string') {
    throw new Error(
      `WAL spool at ${path} is corrupt: record on line ${lineNumber} has an invalid ` +
        `"payload" (expected a string, got ${describeType(payload)}).`,
    );
  }
  return { sequence, payload };
}

/**
 * Read and frame-decode every DURABLE record from the log file at `path`.
 *
 * Framing is newline-delimited JSON. A record is durable only once its
 * TERMINATING newline is on disk, so:
 *   - If the file ends with a newline, every segment is complete.
 *   - If the file does NOT end with a newline, the final segment is a torn
 *     trailing write left by a crash mid-append — it is skipped, not parsed.
 * Every remaining (complete) segment must parse; a complete-but-unparseable
 * segment is genuine corruption and fails loud.
 */
function readDurableRecords(path: string): FramedRecord[] {
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, 'utf8');
  if (raw.length === 0) {
    return [];
  }
  const endsWithNewline = raw.endsWith('\n');
  const segments = raw.split('\n');
  // `"a\nb\n".split('\n')` -> `['a','b','']`; `"a\nb".split('\n')` -> `['a','b']`.
  if (endsWithNewline) {
    // Drop the empty segment produced by the trailing newline.
    segments.pop();
  } else {
    // Drop the torn trailing record (its newline never made it to disk).
    segments.pop();
  }
  const records: FramedRecord[] = [];
  segments.forEach((segment, index) => {
    if (segment === '') {
      throw new Error(
        `WAL spool at ${path} is corrupt: unexpected empty complete line at line ` +
          `${index + 1}. A durable record is never a blank line.`,
      );
    }
    records.push(parseFramedRecord(segment, path, index + 1));
  });
  return records;
}

/**
 * Open (or create) a crash-safe write-ahead spool rooted at `directory`.
 * Ensures the directory exists, recovers the next monotonic sequence from any
 * durable records already on disk, and holds an append-mode file descriptor
 * for durable, fsync-before-ack appends.
 */
export async function openWal(directory: string): Promise<WalHandle> {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, WAL_FILENAME);
  const fileExisted = existsSync(path);

  // Recover the sequence counter from durable records so it continues (never
  // resets) across restart — the whole point of R-03's replay guarantee.
  const recovered = readDurableRecords(path);
  let nextSequence = recovered.reduce((max, record) => Math.max(max, record.sequence), 0) + 1;

  // Append-mode fd: every writeSync lands at end-of-file. Fail loud if the
  // directory is unwritable (openSync throws a descriptive ENOENT/EACCES).
  const fileFd = openSync(path, 'a');
  let closed = false;

  // If we just created the log file, fsync the directory so the file's
  // existence (a directory-metadata change) is itself durable, not just its
  // contents (mirrors store.ts). Appends to an existing file don't change
  // directory metadata, so this is a one-time cost at creation.
  if (!fileExisted) {
    const dirFd = openSync(directory, 'r');
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  }

  function assertOpen(): void {
    if (closed) {
      throw new Error(
        `WAL spool at ${path} is closed — append()/replay() after close() is a caller bug.`,
      );
    }
  }

  return {
    append(payload: string): Promise<void> {
      assertOpen();
      const record: FramedRecord = { sequence: nextSequence, payload };
      // One framed line, terminated by the newline that marks it complete.
      const line = `${JSON.stringify(record)}\n`;
      writeSync(fileFd, line);
      // fsync BEFORE the promise resolves — the bytes (including the
      // terminating newline) are durable by the time the caller sees success.
      fsyncSync(fileFd);
      nextSequence += 1;
      return Promise.resolve();
    },
    replay(): Promise<WalRecord[]> {
      assertOpen();
      // Read fresh from disk (no in-process cache) so replay reflects exactly
      // what is durable — the same guarantee a fresh restart would see.
      const records = readDurableRecords(path).map(
        (record): WalRecord => ({ sequence: record.sequence, payload: record.payload }),
      );
      return Promise.resolve(records);
    },
    close(): Promise<void> {
      if (!closed) {
        closed = true;
        closeSync(fileFd);
      }
      return Promise.resolve();
    },
  };
}
