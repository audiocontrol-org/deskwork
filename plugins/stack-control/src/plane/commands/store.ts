// specs/036-fleet-control-plane — T069 (impl), pairs with the RED tests
// T057 (command-durable-accept) and T058 (command-blip, which constructs a
// CommandDispatch OVER this store). This module is the PLANE-side DURABLE
// command store.
//
// The operator promise this surface exists for (FR-056, data-model.md §
// Command): "`accepted` is durable before it is returned — the plane records
// the command durably *before* answering `accepted`, and the durable record
// is authoritative across plane restart." A `cancel` accepted a second before
// a restart must not vanish; that is exactly the case the promise exists for.
//
// DURABILITY MECHANISM (why accept() is honest, not eventually-consistent):
//   accept() writes the record to disk SYNCHRONOUSLY and fsyncs both the file
//   and its containing directory BEFORE the returned promise resolves. There
//   is no async flush window between "answer accepted" and "record on disk":
//   the bytes are durable by the time the caller sees `accepted`. Reopening a
//   store over the same directory re-reads every `<commandId>.json` from disk,
//   so a fresh CommandStore instance (a simulated plane restart) recovers all
//   prior records via get() and list().
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias — this plugin has none).
// No fallbacks / no silent defaults — an unwritable dir or a corrupt record
// throws a descriptive error (fail loud). Never a mocked filesystem: the store
// is real `node:fs` against a real directory (.claude/rules/testing.md).

import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { CommandKind, CommandState } from '../../fleet/command.js';
import { mintUuidV7 } from '../../fleet/types.js';

/**
 * The caller-supplied portion of a command at accept time (data-model.md §
 * Command). Identity (`commandId`), lifecycle state, and accept timestamp are
 * assigned by the store, not the caller.
 */
export interface AcceptCommandInput {
  readonly kind: CommandKind;
  readonly installationId: string;
  readonly runId: string | null;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/**
 * A durably-recorded command. Extends the accept input with the store-assigned
 * identity, lifecycle state, and ISO-8601 accept timestamp. This is the shape
 * persisted to disk and recovered on restart.
 */
export interface CommandRecord extends AcceptCommandInput {
  readonly commandId: string;
  readonly state: CommandState;
  readonly acceptedAt: string;
}

/**
 * The durable command store (FR-056). `accept()` is durable-before-returned;
 * `get()` / `list()` read the in-memory index that a fresh instance rebuilds
 * from disk at construction.
 */
export interface CommandStore {
  /**
   * Record a command durably and return its assigned id + the `accepted`
   * state. The returned promise does not resolve until the durable record is
   * on disk (fsynced), so `accepted` is never a lie a restart can erase.
   */
  accept(input: AcceptCommandInput): Promise<{
    readonly commandId: string;
    readonly state: 'accepted';
  }>;
  /** The durable record for `commandId`, or undefined if unknown. */
  get(commandId: string): CommandRecord | undefined;
  /** Every durable record currently known to the store. */
  list(): readonly CommandRecord[];
}

/** File suffix for a persisted command record. */
const RECORD_SUFFIX = '.json';

/**
 * Narrow an unknown parsed JSON value to a `CommandRecord`, throwing a
 * descriptive error if the on-disk shape is not a well-formed record (fail
 * loud — a corrupt durable record is a real defect, never silently skipped).
 */
function parseRecord(raw: unknown, sourcePath: string): CommandRecord {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(
      `createCommandStore: durable record at ${sourcePath} is not a JSON object.`,
    );
  }
  const record: Record<string, unknown> = { ...raw };
  const { commandId, kind, installationId, runId, state, acceptedAt, payload } = record;
  if (typeof commandId !== 'string' || commandId.length === 0) {
    throw new Error(`createCommandStore: durable record at ${sourcePath} has no commandId.`);
  }
  if (typeof kind !== 'string') {
    throw new Error(`createCommandStore: durable record at ${sourcePath} has no kind.`);
  }
  if (typeof installationId !== 'string') {
    throw new Error(
      `createCommandStore: durable record at ${sourcePath} has no installationId.`,
    );
  }
  if (runId !== null && typeof runId !== 'string') {
    throw new Error(
      `createCommandStore: durable record at ${sourcePath} has an invalid runId.`,
    );
  }
  if (typeof state !== 'string') {
    throw new Error(`createCommandStore: durable record at ${sourcePath} has no state.`);
  }
  if (typeof acceptedAt !== 'string') {
    throw new Error(
      `createCommandStore: durable record at ${sourcePath} has no acceptedAt.`,
    );
  }
  const parsedKind: CommandKind = toCommandKind(kind, sourcePath);
  const parsedState: CommandState = toCommandState(state, sourcePath);
  const base: CommandRecord = {
    commandId,
    kind: parsedKind,
    installationId,
    runId,
    state: parsedState,
    acceptedAt,
  };
  if (payload === undefined) {
    return base;
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(
      `createCommandStore: durable record at ${sourcePath} has a non-object payload.`,
    );
  }
  return { ...base, payload: { ...payload } };
}

const COMMAND_KINDS: readonly CommandKind[] = [
  'pause',
  'resume',
  'cancel',
  'config-push',
  'reconcile',
];

const COMMAND_STATES: readonly CommandState[] = [
  'accepted',
  'delivered',
  'received',
  'applied',
  'rejected',
  'failed',
  'expired',
  'superseded',
];

function toCommandKind(value: string, sourcePath: string): CommandKind {
  const match = COMMAND_KINDS.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new Error(
      `createCommandStore: durable record at ${sourcePath} has an unrecognized kind '${value}'.`,
    );
  }
  return match;
}

function toCommandState(value: string, sourcePath: string): CommandState {
  const match = COMMAND_STATES.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new Error(
      `createCommandStore: durable record at ${sourcePath} has an unrecognized state '${value}'.`,
    );
  }
  return match;
}

/**
 * Persist a record to `<dir>/<commandId>.json` durably: write to a temp file,
 * fsync it, atomically rename it into place, then fsync the directory so the
 * rename itself is durable. On return, the record is guaranteed on disk.
 */
function persistRecord(dir: string, record: CommandRecord): void {
  const finalPath = join(dir, `${record.commandId}${RECORD_SUFFIX}`);
  const tempPath = join(dir, `${record.commandId}.tmp`);
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const fileFd = openSync(tempPath, 'w');
  try {
    writeSync(fileFd, bytes);
    fsyncSync(fileFd);
  } finally {
    closeSync(fileFd);
  }
  renameSync(tempPath, finalPath);
  // fsync the directory so the rename (the metadata that makes the record
  // discoverable) is itself durable, not just the file contents.
  const dirFd = openSync(dir, 'r');
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

/** Read and index every persisted record under `dir` (restart recovery). */
function recoverRecords(dir: string): Map<string, CommandRecord> {
  const index = new Map<string, CommandRecord>();
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (!entry.endsWith(RECORD_SUFFIX)) {
      continue;
    }
    const path = join(dir, entry);
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const record = parseRecord(raw, path);
    index.set(record.commandId, record);
  }
  return index;
}

/**
 * Open (or create) a durable command store rooted at `dir`. Creates the
 * directory if absent, then recovers any prior records already on disk so a
 * fresh instance over an existing directory sees the full history (FR-056
 * "authoritative across plane restart"). Throws (fail loud) if `dir` cannot
 * be created or read.
 */
export function createCommandStore(dir: string): CommandStore {
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new Error('createCommandStore: dir must be a non-empty path string.');
  }
  mkdirSync(dir, { recursive: true });
  const index = recoverRecords(dir);

  return {
    accept(input: AcceptCommandInput): Promise<{ readonly commandId: string; readonly state: 'accepted' }> {
      if (typeof input.installationId !== 'string' || input.installationId.length === 0) {
        return Promise.reject(
          new Error('createCommandStore.accept: installationId must be a non-empty string.'),
        );
      }
      const commandId = mintUuidV7();
      const record: CommandRecord =
        input.payload === undefined
          ? {
              commandId,
              kind: input.kind,
              installationId: input.installationId,
              runId: input.runId,
              state: 'accepted',
              acceptedAt: new Date().toISOString(),
            }
          : {
              commandId,
              kind: input.kind,
              installationId: input.installationId,
              runId: input.runId,
              state: 'accepted',
              acceptedAt: new Date().toISOString(),
              payload: { ...input.payload },
            };
      // Durable BEFORE we resolve — the fsynced write completes synchronously
      // here, so by the time this promise resolves the record is on disk.
      persistRecord(dir, record);
      index.set(commandId, record);
      return Promise.resolve({ commandId, state: 'accepted' });
    },
    get(commandId: string): CommandRecord | undefined {
      return index.get(commandId);
    },
    list(): readonly CommandRecord[] {
      return [...index.values()];
    },
  };
}
