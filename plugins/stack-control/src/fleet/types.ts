// specs/036-fleet-control-plane — T013 (impl), pairs with T012's RED test.
//
// Identity + envelope TYPES per data-model.md § Identity (line ~8-22) and
// § Event → Envelope (line ~43-58). Field types are described structurally
// in data-model.md, not as TypeScript source — this file is that landing.
//
// SCOPE (per the task pairing): types + the minimal identity-mint helpers
// the RED test asserts version-shape against. Envelope CONSTRUCTION and
// VALIDATION (deriving sequences, computing monotonicOffsetMs, enforcing
// the "eventId is never an ordering key" rule) is T014/T015's job
// (src/fleet/event.ts) — deliberately not built here.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI).

import { randomUUID } from 'node:crypto';
import { uuidv7 } from 'uuidv7';

/**
 * Mint a fresh `installationId`. **UUIDv4** deliberately (data-model.md
 * § Identity) — an installation id is never sorted, and a time-ordered id
 * would leak installation mint time for no benefit. Minted once per
 * installation, re-minted on clone/copy; storage lifetime is the
 * machine-local durable store's concern (src/machine-state/*), not this
 * function's.
 */
export function mintInstallationId(): string {
  return randomUUID();
}

/**
 * Mint a fresh **UUIDv7** identity value. Shared generator for every
 * UUIDv7 identity data-model.md § Identity lists: `invocationId`, `runId`,
 * `eventId`, `commandId`. UUIDv7 is time-ordered by construction, but per
 * data-model.md "`eventId` is identity, NEVER an ordering key" — callers
 * MUST NOT rely on the time-ordering for domain sequencing; that is
 * `invocationSequence`'s job (envelope field below).
 */
export function mintUuidV7(): string {
  return uuidv7();
}

/** Event envelope `type` values recognized at this layer (extended by
 * event.ts as domain event types are added; the envelope shape itself is
 * type-agnostic per data-model.md § Event). */
export type EventType = string;

/**
 * The three envelope-level classifications data-model.md § Event → Envelope
 * defines. Classification decides delivery cost (FR-015) — it is a
 * property of the envelope, never derived from `type`.
 */
export type EventClassification = 'live-only' | 'aggregated' | 'durable';

/**
 * Event envelope (data-model.md § Event → Envelope). One of the three
 * separable parts of an Event (FR-044); the other two (Snapshot, Domain
 * events) are separate structures, not fields of this type.
 *
 * Field-by-field provenance (data-model.md table):
 * - `eventId`            UUIDv7 — globally unique; dedupe key.
 * - `installationId`     UUIDv4.
 * - `invocationId`       UUIDv7.
 * - `runId`               UUIDv7 | null — null for non-run invocations.
 * - `installationSequence` transport diagnostics ONLY (FR-041) — never
 *   domain ordering.
 * - `invocationSequence`   the sequence with domain meaning (FR-040).
 * - `schemaVersion`        integer.
 * - `type`                 event type.
 * - `wallClock`            ISO-8601 — describes; never orders (PT-013).
 * - `monotonicOffsetMs`    computed at source.
 * - `classification`       decides cost, not `type` (FR-015).
 */
export interface EventEnvelope {
  readonly eventId: string;
  readonly installationId: string;
  readonly invocationId: string;
  readonly runId: string | null;
  readonly installationSequence: number;
  readonly invocationSequence: number;
  readonly schemaVersion: number;
  readonly type: EventType;
  readonly wallClock: string;
  readonly monotonicOffsetMs: number;
  readonly classification: EventClassification;
}

/**
 * Structured error per data-model.md § Structured error (FR-046): a
 * bounded shape carrying error context in the fleet payload. **NOT** an
 * unbounded generic field; details are fetched on demand, never carried
 * inline.
 *
 * Field-by-field provenance (data-model.md):
 * - `code`        error code identifier (e.g. 'TASK_PARSE_ERROR')
 * - `message`     human-readable error message
 * - `task`        the roadmap feature/phase/task id where the error occurred
 * - `timestamp`   ISO-8601 timestamp when the error was recorded
 * - `recoverable` whether the operation can be retried
 *
 * This is a BOUNDED shape by contract — no open `details` field, no
 * unbounded generics. Error details are fetched via a separate path.
 */
export interface StructuredError {
  readonly code: string;
  readonly message: string;
  readonly task: string;
  readonly timestamp: string;
  readonly recoverable: boolean;
}

/**
 * Validate an unknown value as a `StructuredError`, rejecting missing or
 * wrong-typed fields with a descriptive error (fail loud, per the
 * project's no-silent-coercion rule). Returns a freshly-built, correctly
 * typed error object — never a cast of the input.
 *
 * The validator enforces the BOUNDED shape contract (FR-046): no
 * unbounded `details` field, no generic slots.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateStructuredError(value: unknown): StructuredError {
  if (!isPlainObject(value)) {
    throw new Error(
      `StructuredError: expected an object, got ${
        value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
      }`,
    );
  }

  // `value` is narrowed to Record<string, unknown> by the type guard — no cast.
  const record: Record<string, unknown> = value;

  // code: non-empty string
  const code = record.code;
  if (typeof code !== 'string' || code.length === 0) {
    throw new Error(
      `StructuredError.code: expected a non-empty string, got ${
        code === null ? 'null' : Array.isArray(code) ? 'array' : typeof code
      }`,
    );
  }

  // message: non-empty string
  const message = record.message;
  if (typeof message !== 'string' || message.length === 0) {
    throw new Error(
      `StructuredError.message: expected a non-empty string, got ${
        message === null ? 'null' : Array.isArray(message) ? 'array' : typeof message
      }`,
    );
  }

  // task: non-empty string
  const task = record.task;
  if (typeof task !== 'string' || task.length === 0) {
    throw new Error(
      `StructuredError.task: expected a non-empty string, got ${
        task === null ? 'null' : Array.isArray(task) ? 'array' : typeof task
      }`,
    );
  }

  // timestamp: ISO-8601 string
  const timestamp = record.timestamp;
  if (typeof timestamp !== 'string' || timestamp.length === 0) {
    throw new Error(
      `StructuredError.timestamp: expected a non-empty string, got ${
        timestamp === null ? 'null' : Array.isArray(timestamp) ? 'array' : typeof timestamp
      }`,
    );
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `StructuredError.timestamp: expected an ISO-8601 timestamp, got ${JSON.stringify(timestamp)}`,
    );
  }

  // recoverable: boolean
  const recoverable = record.recoverable;
  if (typeof recoverable !== 'boolean') {
    throw new Error(
      `StructuredError.recoverable: expected a boolean, got ${
        recoverable === null ? 'null' : Array.isArray(recoverable) ? 'array' : typeof recoverable
      }`,
    );
  }

  return {
    code,
    message,
    task,
    timestamp,
    recoverable,
  };
}
