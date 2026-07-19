/**
 * specs/036-fleet-control-plane — T015 (impl), pairs with T014's RED test.
 *
 * Envelope CONSTRUCTION + VALIDATION, plus the bounded-snapshot contract
 * and the FR-045 no-history guard, per data-model.md § Event
 * (envelope / snapshot / domain events — the three separable parts, FR-044).
 * `src/fleet/types.ts` (T013) owns the SHAPES (`EventEnvelope`,
 * `EventClassification`, the identity mint helpers); this file owns
 * building and validating them. Ordering (T016's guard target) lives here
 * too: `compareByInvocationSequence` / `sortByInvocationSequence` are the
 * ONLY ordering exports, and neither may ever read `eventId`
 * (data-model.md § Identity, PT-013) — sequencing itself
 * (`installationSequence` vs `invocationSequence`, gap classification) is
 * `src/fleet/sequence.ts`'s job (T019/T020), out of scope here.
 *
 * No `any`, no `as`, no `@ts-ignore` (Principle VI) — every `unknown` input
 * is narrowed with user-defined type guards, never cast.
 */

import type { Clock } from './clock.js';
import {
  mintUuidV7,
  type EventClassification,
  type EventEnvelope,
  type EventType,
} from './types.js';
import { knownEventTypes } from './classification.js';
import { deriveInstanceId } from '../machine-state/instance-id.js';

/**
 * Maximum serialized byte size for a single event's snapshot payload.
 *
 * data-model.md § Snapshot: "Bounded is a contract, not an aspiration —
 * max event size is pinned (PT-014)." research.md § PT-014 lists "max
 * event size" among the constants "pinned at task time" — i.e. NOT a
 * number settled at plan time, and no other spec artifact (spec.md,
 * data-model.md, quickstart.md) pins a concrete byte value as of this
 * task (T014/T015).
 *
 * Per this task's explicit instruction ("if PT-014's exact byte bound is
 * not readily available, make the bound an injected/named constant and
 * note it, do not invent a magic number silently"), this is an exported,
 * NAMED constant rather than an inline literal scattered across call
 * sites — a later task that DOES pin PT-014's real number has exactly one
 * place to change. The 32 KiB value itself IS a judgment call (engineering
 * sizing, not a looked-up fact, same caveat research.md attaches to its
 * own PT-014 table): generous enough for a genuine structured status
 * snapshot (current state, not a log), while small enough that an
 * accidentally-embedded history array of any realistic length blows past
 * it long before this bound would need to move.
 */
export const MAX_EVENT_SNAPSHOT_BYTES = 32 * 1024;

/**
 * The fields a caller supplies to construct an envelope. Everything the
 * envelope derives itself — `eventId` (freshly minted every call) and
 * `wallClock` / `monotonicOffsetMs` (read from the injected `Clock`) — is
 * deliberately absent from this input shape so a caller cannot smuggle a
 * stale or forged value in for those fields.
 */
export interface EnvelopeInput {
  readonly installationId: string;
  readonly invocationId: string;
  readonly runId: string | null;
  readonly installationSequence: number;
  readonly invocationSequence: number;
  readonly schemaVersion: number;
  readonly type: EventType;
  readonly classification: EventClassification;
  /**
   * The Claude Code session id this event belongs to, or `null` when there is
   * no current session (specs/037 § D3). Caller-supplied — unlike `host`/`path`
   * (derived by construction, FR-011), the session is context only the caller
   * knows, so it is threaded in here rather than derived.
   */
  readonly sessionId: string | null;
}

/**
 * Construct a well-formed `EventEnvelope`.
 *
 * `originMonotonicMs` is a monotonic reading of the SAME injected `clock`
 * taken earlier in this same process (e.g. at invocation start) — the
 * "two same-process readings" data-model.md § Envelope describes.
 * `monotonicOffsetMs` is computed HERE, at source, as
 * `clock.monotonicNowMs() - originMonotonicMs` — never passed in
 * pre-computed, and this function never touches `Date`/`performance`
 * directly (PT-013: "the plane cannot difference hrtime even in
 * principle" across a process boundary, so the delta must be born here).
 */
export function constructEnvelope(
  clock: Clock,
  originMonotonicMs: number,
  input: EnvelopeInput,
  installationRoot: string,
): EventEnvelope {
  const { host, path } = deriveInstanceFields(installationRoot);
  return {
    eventId: mintUuidV7(),
    installationId: input.installationId,
    invocationId: input.invocationId,
    runId: input.runId,
    installationSequence: input.installationSequence,
    invocationSequence: input.invocationSequence,
    schemaVersion: input.schemaVersion,
    type: input.type,
    wallClock: clock.nowIso(),
    monotonicOffsetMs: clock.monotonicNowMs() - originMonotonicMs,
    classification: input.classification,
    host,
    path,
    sessionId: input.sessionId,
  };
}

/**
 * Split the `host:path` instance identity `deriveInstanceId` mints (§ D8) back
 * into its two envelope fields. `host` (os.hostname()) never contains a `:`, so
 * the FIRST colon is the separator and everything after it is the real path
 * (which, on Windows, legitimately carries its own `C:` drive colon — hence
 * splitting on the first colon only, never `split(':')`). Reuses the single
 * derivation site (src/machine-state/instance-id.ts) rather than re-reading the
 * hostname/realpath here, so the two never drift.
 */
function deriveInstanceFields(installationRoot: string): {
  readonly host: string;
  readonly path: string;
} {
  const instanceId = deriveInstanceId(installationRoot);
  const separator = instanceId.indexOf(':');
  if (separator < 0) {
    throw new Error(
      `deriveInstanceFields: deriveInstanceId returned ${JSON.stringify(instanceId)} ` +
        'without a "host:path" separator — cannot split host from path',
    );
  }
  return {
    host: instanceId.slice(0, separator),
    path: instanceId.slice(separator + 1),
  };
}

/** A bounded, JSON-object snapshot payload (data-model.md § Snapshot). */
export type SnapshotPayload = Readonly<Record<string, unknown>>;

/** The full wire event: envelope + bounded snapshot (FR-044's first two
 * of three separable parts; append-only domain events are reconstructed
 * from the stream of these, never carried as a field on one). */
export interface TelemetryEvent {
  readonly envelope: EventEnvelope;
  readonly snapshot: SnapshotPayload;
}

// ---------------------------------------------------------------------------
// Validation — narrow `unknown` to typed values with user-defined type
// guards. Never `as`; every accepted field is copied field-by-field into a
// freshly-built, correctly-typed return value.
// ---------------------------------------------------------------------------

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`${context}: expected an object, got ${describeType(value)}`);
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`EventEnvelope.${key}: expected a non-empty string, got ${describeType(value)}`);
  }
  return value;
}

function requireNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `EventEnvelope.${key}: expected a non-empty string or null, got ${describeType(value)}`,
    );
  }
  return value;
}

function requireNonNegativeInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `EventEnvelope.${key}: expected a non-negative integer, got ${describeType(value)} (${String(value)})`,
    );
  }
  return value;
}

function requireFiniteNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `EventEnvelope.${key}: expected a finite number, got ${describeType(value)} (${String(value)})`,
    );
  }
  return value;
}

function requireIsoWallClock(record: Record<string, unknown>, key: string): string {
  const value = requireString(record, key);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`EventEnvelope.${key}: expected an ISO-8601 timestamp, got ${JSON.stringify(value)}`);
  }
  return value;
}

function isEventClassification(value: string): value is EventClassification {
  return value === 'live-only' || value === 'aggregated' || value === 'durable';
}

function requireClassification(record: Record<string, unknown>, key: string): EventClassification {
  const value = record[key];
  if (typeof value !== 'string' || !isEventClassification(value)) {
    throw new Error(
      `EventEnvelope.${key}: expected one of "live-only" | "aggregated" | "durable", got ${describeType(value)} (${String(value)})`,
    );
  }
  return value;
}

/**
 * Narrow a raw envelope `type` to `EventType` by matching against the
 * registered catalog (`knownEventTypes()` from classification.ts). Fail loud on
 * an unknown type (Principle V) — an unregistered type has no classification, so
 * accepting it would defer a guaranteed failure to `classifyEvent`. `.find`
 * yields `EventType | undefined`, so the narrowing needs no cast.
 */
function requireEventType(record: Record<string, unknown>, key: string): EventType {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(
      `EventEnvelope.${key}: expected a known event type string, got ${describeType(value)}`,
    );
  }
  const match = knownEventTypes().find((known) => known === value);
  if (match === undefined) {
    throw new Error(
      `EventEnvelope.${key}: unknown event type ${JSON.stringify(value)} — every ` +
        'envelope type must be one registered in the classification catalog ' +
        '(src/fleet/classification.ts)',
    );
  }
  return match;
}

/**
 * Validate an unknown value as an `EventEnvelope`, rejecting missing or
 * wrong-typed fields with a descriptive error (fail loud, per the
 * project's no-silent-coercion rule). Returns a freshly-built, correctly
 * typed envelope — never a cast of the input.
 */
export function validateEnvelope(value: unknown): EventEnvelope {
  const record = requireRecord(value, 'EventEnvelope');

  const eventId = requireString(record, 'eventId');
  const installationId = requireString(record, 'installationId');
  const invocationId = requireString(record, 'invocationId');
  const runId = requireNullableString(record, 'runId');
  const installationSequence = requireNonNegativeInteger(record, 'installationSequence');
  const invocationSequence = requireNonNegativeInteger(record, 'invocationSequence');
  const schemaVersion = requireNonNegativeInteger(record, 'schemaVersion');
  const type = requireEventType(record, 'type');
  const wallClock = requireIsoWallClock(record, 'wallClock');
  const monotonicOffsetMs = requireFiniteNumber(record, 'monotonicOffsetMs');
  const classification = requireClassification(record, 'classification');
  const host = requireString(record, 'host');
  const path = requireString(record, 'path');
  const sessionId = requireNullableString(record, 'sessionId');

  return {
    eventId,
    installationId,
    invocationId,
    runId,
    installationSequence,
    invocationSequence,
    schemaVersion,
    type,
    wallClock,
    monotonicOffsetMs,
    classification,
    host,
    path,
    sessionId,
  };
}

/**
 * Recursively reject a `history` key holding an array value anywhere in
 * the snapshot's object graph (FR-045). The prohibition targets the
 * specific quadratic shape spec.md names — `execution.history[]` /
 * `governance.history[]` — i.e. an ARRAY under the literal key `history`,
 * not the bare word "history" appearing as a scalar or a differently
 * shaped value.
 */
function assertNoHistoryArray(record: Record<string, unknown>, path: string): void {
  for (const [key, fieldValue] of Object.entries(record)) {
    const fieldPath = `${path}.${key}`;
    if (key === 'history' && Array.isArray(fieldValue)) {
      throw new Error(
        `snapshot.${fieldPath.slice(path.length + 1)}: per-event history arrays are prohibited (FR-045) ` +
          `— "${fieldPath}" carries an array; history must be reconstructed from the append-only ` +
          'domain-event stream, never resent on a single event',
      );
    }
    if (isPlainObject(fieldValue)) {
      assertNoHistoryArray(fieldValue, fieldPath);
    } else if (Array.isArray(fieldValue)) {
      fieldValue.forEach((item, index) => {
        if (isPlainObject(item)) {
          assertNoHistoryArray(item, `${fieldPath}[${index}]`);
        }
      });
    }
  }
}

function assertWithinSnapshotBound(record: Record<string, unknown>): void {
  const serialized = JSON.stringify(record);
  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > MAX_EVENT_SNAPSHOT_BYTES) {
    throw new Error(
      `snapshot exceeds the bounded-snapshot contract: ${byteLength} bytes > ` +
        `MAX_EVENT_SNAPSHOT_BYTES (${MAX_EVENT_SNAPSHOT_BYTES}) — data-model.md § Snapshot: ` +
        '"Bounded is a contract, not an aspiration"',
    );
  }
}

/**
 * Validate an unknown value as a `SnapshotPayload`: must be a plain
 * object, must fit within `MAX_EVENT_SNAPSHOT_BYTES` when serialized, and
 * must not carry a per-event `history` array anywhere in its object graph
 * (FR-045).
 */
export function validateSnapshot(value: unknown): SnapshotPayload {
  const record = requireRecord(value, 'snapshot');
  assertNoHistoryArray(record, 'snapshot');
  assertWithinSnapshotBound(record);
  return record;
}

/**
 * Validate an unknown value as a full `TelemetryEvent` — both the
 * envelope and the snapshot must independently validate.
 */
export function validateTelemetryEvent(value: unknown): TelemetryEvent {
  const record = requireRecord(value, 'TelemetryEvent');
  const envelope = validateEnvelope(record.envelope);
  const snapshot = validateSnapshot(record.snapshot);
  return { envelope, snapshot };
}

// ---------------------------------------------------------------------------
// Ordering — the ONLY two ordering exports in this module. `eventId` is
// identity, NEVER an ordering key (data-model.md § Identity, PT-013);
// these key off `invocationSequence` exclusively. T016 pins this with a
// guard that would genuinely fail if either function were rewired to read
// `eventId`.
// ---------------------------------------------------------------------------

/**
 * Compare two envelopes by `invocationSequence` — the sequence with
 * domain meaning (FR-040). Never reads `eventId`; UUIDv7's time-ordering
 * is a minting convenience, not a sanctioned ordering key.
 */
export function compareByInvocationSequence(a: EventEnvelope, b: EventEnvelope): number {
  return a.invocationSequence - b.invocationSequence;
}

/**
 * Sort envelopes by `invocationSequence`, ascending. Returns a new array
 * (does not mutate the input).
 */
export function sortByInvocationSequence(
  envelopes: readonly EventEnvelope[],
): EventEnvelope[] {
  return [...envelopes].sort(compareByInvocationSequence);
}
