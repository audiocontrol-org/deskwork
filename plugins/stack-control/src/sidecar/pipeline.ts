/**
 * specs/036-fleet-control-plane — T086 (impl), pairs with T079's RED test
 * (tests/fleet/dedupe-reorder.test.ts). Phase 6 (US4 — trust what the fleet
 * says).
 *
 * THE SIDECAR PIPELINE — the single seam a raw invocation event travels
 * through before it is durably spooled for transmission to the plane. The
 * ORDER is the contract (FR-048/049) and is enforced structurally by this
 * module's single code path, not by convention:
 *
 *   receive -> validate -> normalize+redact -> assign eventId+sequence
 *           -> spool -> (transmit is the caller's concern)
 *
 * WHY REDACTION MUST PRECEDE SPOOLING (FR-048): the sidecar is the last hop
 * under the operator's control. Once a payload is written to the WAL
 * (`src/sidecar/spool/wal.ts`, T084), it persists on disk and will be
 * replayed byte-identical on retry/restart (R-03, FR-049). If redaction ran
 * AFTER spooling (or only at transmit time), raw/sensitive data would sit on
 * disk regardless of whether it was ever successfully transmitted — exactly
 * the leak FR-048 exists to prevent. Redacting BEFORE spooling means the
 * bytes on disk are ALREADY the bytes that are safe to transmit, which is
 * also what makes byte-identity (FR-049) sound: replay re-emits the same
 * redacted bytes, never re-redacts (there is nothing left to redact) and
 * never re-exposes anything that wasn't already safe.
 *
 * `receive()` returns the fully-formed, ALREADY-SPOOLED `TelemetryEvent` —
 * transmit (draining the WAL to the plane over the uplink) is a separate
 * concern (a poller reads `WalHandle.replay()`), deliberately not built
 * here. This mirrors T079's own header: "this method returns the fully-
 * formed, spooled TelemetryEvent so a test (or a real transmitter) can hand
 * it to the plane."
 *
 * SEQUENCE ASSIGNMENT — two distinct counters (data-model.md § Event,
 * src/fleet/sequence.ts's two-sequence model, FR-039/040/041):
 *
 *   - `invocationSequence` (FR-040, the sequence with DOMAIN meaning) is
 *     assigned PER `invocationId`, starting at 1 and incrementing once per
 *     `receive()` call for that invocation. Tracked in-process per pipeline
 *     instance (`invocationSequences` map below) — an invocation's events
 *     all flow through the same pipeline instance within one sidecar
 *     process, so this is exactly the domain-ordering counter FR-040 wants.
 *
 *   - `installationSequence` (FR-039, transport DIAGNOSTICS only, never
 *     domain ordering — FR-041) is the sidecar's durable OUTBOUND counter,
 *     sourced from the WAL's own monotonic sequence (`WalRecord.sequence`,
 *     T084): durable (recovered via `WalHandle.replay()` on open, so it
 *     survives sidecar restart the same way the WAL itself does) and
 *     consistent by construction (this pipeline performs exactly one
 *     `append()` per `receive()`, so the locally-tracked next value always
 *     equals the sequence the WAL is about to assign). This avoids a second,
 *     independently-drifting durable store for what is, functionally, the
 *     same "how many things has this sidecar spooled" count the WAL already
 *     keeps (contrast with `src/cli.ts`'s short-verb emit path, which has no
 *     WAL of its own and instead sources this counter from the
 *     machine-state high-water mark, `src/machine-state/highwater.ts` — both
 *     are legitimate durable sources per this task's brief; this module
 *     picks the WAL because it already durably counts exactly the thing
 *     this pipeline is doing: spooling).
 *
 * NORMALIZE+REDACT: `RawInvocationEvent` (this module's input shape) carries
 * only identity + type + classification — no free-text/path/commit-message/
 * error fields yet reach this seam. Redaction is still performed as a
 * structural pipeline stage (calling `redactEvent` from
 * `src/fleet/redact.ts` with the current, empty snapshot payload) so the
 * ORDERING invariant holds today and needs no rework when a later task
 * extends `RawInvocationEvent` with real snapshot content — only the
 * allowlist passed to `redactEvent` would need to grow.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution (no `@/` alias configured in this
 * plugin). Fail loud on a malformed raw event (Principle V) — never a
 * silent drop or coercion.
 */

import { SystemClock, type Clock } from '../fleet/clock.js';
import { constructEnvelope, type TelemetryEvent } from '../fleet/event.js';
import type { EventClassification, EventType } from '../fleet/types.js';
import {
  createSystemRedactionContext,
  redactEvent,
  type FieldAllowlist,
} from '../fleet/redact.js';
import { openWal, type WalHandle } from './spool/wal.js';

/** The literal event-envelope schema version this pipeline stamps every
 * event with. `src/cli.ts`'s emit-client path uses the same literal `1` —
 * kept as a plain literal here too rather than importing a shared constant
 * that does not yet exist anywhere in this codebase. */
const SCHEMA_VERSION = 1;

/**
 * One raw invocation event as the sidecar-side caller (the emit client, a
 * `govern`/`execute` run loop, etc.) hands it to the pipeline. Deliberately
 * carries NO `eventId` / NO sequence fields — both are minted/assigned
 * inside `receive()` so a caller cannot smuggle a stale or forged value in
 * for either (mirrors `EnvelopeInput`'s own field-omission rationale in
 * `src/fleet/event.ts`).
 */
export interface RawInvocationEvent {
  readonly installationId: string;
  readonly invocationId: string;
  readonly runId: string | null;
  readonly type: EventType;
  readonly classification: EventClassification;
}

/**
 * The sidecar pipeline's public surface. `createPipeline` returns one of
 * these, bound to a single WAL rooted at the directory it was given.
 */
export interface SidecarPipeline {
  /**
   * Run one raw event through the full ordered pipeline (module header) and
   * return the fully-formed, already-spooled `TelemetryEvent`. Never
   * silently drops or coerces a malformed `raw` — throws descriptively
   * instead (Principle V).
   */
  receive(raw: RawInvocationEvent): Promise<TelemetryEvent>;
}

// ---------------------------------------------------------------------------
// Validate — fail loud on malformed input (Principle V). `RawInvocationEvent`
// is already a typed parameter, but a caller crossing an untyped boundary
// (JSON, a differently-compiled caller) can still hand this a structurally
// invalid value at runtime, so every field is checked here rather than
// trusted by the type alone.
// ---------------------------------------------------------------------------

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `RawInvocationEvent.${label}: expected a non-empty string, got ${describeType(value)}`,
    );
  }
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `RawInvocationEvent.${label}: expected a non-empty string or null, got ${describeType(value)}`,
    );
  }
  return value;
}

function isEventClassification(value: unknown): value is EventClassification {
  return value === 'live-only' || value === 'aggregated' || value === 'durable';
}

function requireClassification(value: unknown): EventClassification {
  if (!isEventClassification(value)) {
    throw new Error(
      `RawInvocationEvent.classification: expected one of "live-only" | "aggregated" | ` +
        `"durable", got ${describeType(value)} (${String(value)})`,
    );
  }
  return value;
}

/** Validate + normalize a raw event into a freshly-built, correctly-typed
 * value — never a cast of the input (mirrors `src/fleet/event.ts`'s
 * validation style). */
function validateAndNormalize(raw: RawInvocationEvent): RawInvocationEvent {
  return {
    installationId: requireNonEmptyString(raw.installationId, 'installationId'),
    invocationId: requireNonEmptyString(raw.invocationId, 'invocationId'),
    runId: requireNullableString(raw.runId, 'runId'),
    type: requireNonEmptyString(raw.type, 'type'),
    classification: requireClassification(raw.classification),
  };
}

/**
 * The redaction allowlist for this seam's current scope. Empty today
 * because `RawInvocationEvent` carries no free-text/path fields — see the
 * module header's NORMALIZE+REDACT note. A future task that threads real
 * snapshot content through `RawInvocationEvent` grows this allowlist; it
 * does not change the pipeline's ordering.
 */
const SNAPSHOT_REDACTION_ALLOWLIST: FieldAllowlist = {};

/**
 * Construct + open (or reuse) the WAL for `walDir`, lazily and at most
 * once per pipeline instance. `openWal` is async; `createPipeline` itself
 * is not, so the handle is memoized behind a promise created on first use.
 */
function createWalOpener(walDir: string): () => Promise<WalHandle> {
  let handlePromise: Promise<WalHandle> | null = null;
  return function getWal(): Promise<WalHandle> {
    if (handlePromise === null) {
      handlePromise = openWal(walDir);
    }
    return handlePromise;
  };
}

/**
 * Open (or create) a sidecar pipeline rooted at `walDir` — the directory
 * the crash-safe WAL spool (T084) is opened against. One pipeline instance
 * owns one WAL; every `receive()` call spools exactly one record to it.
 */
export function createPipeline(walDir: string): SidecarPipeline {
  const clock: Clock = new SystemClock();
  // A single monotonic origin for this pipeline instance's whole lifetime
  // (Clock's contract: "two same-process readings" — see clock.ts). Every
  // event's `monotonicOffsetMs` is relative to this origin.
  const originMonotonicMs = clock.monotonicNowMs();

  const getWal = createWalOpener(walDir);

  // Per-invocation domain-ordering counter (FR-040). Starts at 1 for a
  // brand-new invocationId; increments once per `receive()` call for that
  // invocation. In-process only — an invocation's events all flow through
  // the SAME pipeline instance within one sidecar process, which is exactly
  // the scope FR-040's per-invocation ordering needs.
  const invocationSequences = new Map<string, number>();

  // The sidecar's durable outbound counter (FR-039), sourced from the WAL's
  // own monotonic sequence (see module header). `null` until the WAL has
  // been opened and its durable state recovered via `replay()`.
  let nextInstallationSequence: number | null = null;

  function nextInvocationSequence(invocationId: string): number {
    const current = invocationSequences.get(invocationId) ?? 0;
    const next = current + 1;
    invocationSequences.set(invocationId, next);
    return next;
  }

  async function ensureInstallationSequenceRecovered(wal: WalHandle): Promise<void> {
    if (nextInstallationSequence !== null) return;
    // Recover durably: the WAL's own replay reflects every record ever
    // appended (including across a prior process's restart), so the next
    // value continues from there rather than resetting to 1.
    const existing = await wal.replay();
    const maxSequence = existing.reduce((max, record) => Math.max(max, record.sequence), 0);
    nextInstallationSequence = maxSequence + 1;
  }

  function takeInstallationSequence(): number {
    if (nextInstallationSequence === null) {
      throw new Error(
        'createPipeline: installationSequence was not recovered before assignment — ' +
          'ensureInstallationSequenceRecovered() must run before takeInstallationSequence() ' +
          '(caller bug in pipeline.ts).',
      );
    }
    const assigned = nextInstallationSequence;
    nextInstallationSequence += 1;
    return assigned;
  }

  return {
    async receive(rawInput: RawInvocationEvent): Promise<TelemetryEvent> {
      // 1. validate
      const raw = validateAndNormalize(rawInput);

      // 2. normalize+redact — BEFORE spooling (FR-048/049, module header).
      // No free-text fields exist on RawInvocationEvent today; this call is
      // still made so the pipeline STAGE exists at the correct position for
      // when one does — its (currently empty) output IS the snapshot.
      const snapshot: Readonly<Record<string, unknown>> = redactEvent(
        {},
        SNAPSHOT_REDACTION_ALLOWLIST,
        createSystemRedactionContext(walDir),
      );

      // 3. assign eventId + sequence. `constructEnvelope` mints `eventId`
      // internally (mintUuidV7) — never passed in, per its own contract.
      const wal = await getWal();
      await ensureInstallationSequenceRecovered(wal);
      const installationSequence = takeInstallationSequence();
      const invocationSequence = nextInvocationSequence(raw.invocationId);

      const envelope = constructEnvelope(clock, originMonotonicMs, {
        installationId: raw.installationId,
        invocationId: raw.invocationId,
        runId: raw.runId,
        installationSequence,
        invocationSequence,
        schemaVersion: SCHEMA_VERSION,
        type: raw.type,
        classification: raw.classification,
      });

      const event: TelemetryEvent = { envelope, snapshot };

      // 4. spool — the REDACTED event, byte-identical to what transmit will
      // later re-send on retry/replay (FR-049).
      await wal.append(JSON.stringify(event));

      // 5. transmit is the caller's concern (module header) — return the
      // spooled event.
      return event;
    },
  };
}
