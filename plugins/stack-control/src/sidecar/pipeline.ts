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
 *     equals the sequence the WAL is about to assign). This reuses the WAL's
 *     own durable count rather than standing up a second, independently-
 *     drifting durable store (contrast `src/cli.ts`'s short-verb emit path,
 *     which has no WAL and instead sources this counter from the machine-state
 *     high-water mark, `src/machine-state/highwater.ts`).
 *
 * SNAPSHOT (AUDIT-20260717-12; specs/037): `receive()` picks a snapshot path by
 * event TYPE. The 036 path redacts a `{content,allowlist}` snapshot (via
 * `redactEvent`) BEFORE the WAL append so the bytes on disk are ALREADY redacted
 * (FR-047/048, SC-013); an absent snapshot still runs the stage over `{}` so the
 * ORDERING invariant holds. The specs/037 `BARE_SNAPSHOT_EVENT_TYPES` instead
 * carry the producer's already-safe bare status snapshot through INTACT (see
 * `RawInvocationEvent.bareSnapshot`). The `RedactionContext` is an injected DI
 * seam (default `createSystemRedactionContext(walDir)`) for deterministic tests.
 * IDENTITY (specs/037): `receive()` PRESERVES the producer's host/path/sessionId
 * onto the re-minted envelope; only eventId + both sequences are re-minted.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 resolution (no `@/` alias configured in this
 * plugin). Fail loud on a malformed raw event (Principle V) — never a
 * silent drop or coercion.
 */

import { SystemClock, type Clock } from '../fleet/clock.js';
import { constructEnvelope, type SnapshotPayload, type TelemetryEvent } from '../fleet/event.js';
import { knownEventTypes } from '../fleet/classification.js';
import type { EventClassification, EventEnvelope, EventType } from '../fleet/types.js';
import {
  createSystemRedactionContext,
  redactEvent,
  type FieldAllowlist,
  type RedactionContext,
} from '../fleet/redact.js';
import { openWal, type WalHandle } from './spool/wal.js';

/** The literal event-envelope schema version this pipeline stamps every
 * event with. Bumped to `2` for specs/037 (the envelope now carries the
 * instance-identity fields host/path/sessionId); the short-verb emit path
 * (src/telemetry/invocation-telemetry.ts) stamps the same `2`. Kept as a plain
 * literal here rather than importing a shared constant that does not yet exist
 * anywhere in this codebase. */
const SCHEMA_VERSION = 2;

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
  /**
   * The observed instance's identity (specs/037 § D8), PRESERVED onto the
   * re-minted envelope. The producer derived host/path from the REAL install root
   * (realpath), so the sidecar carries them through rather than re-derive from its
   * spool dir; only the producer knows `sessionId`, so it is threaded here (never
   * hardcoded null). eventId + both sequences stay sidecar-authoritative
   * (FR-039/040/049) — those, and only those, are NOT preserved from the inbound.
   */
  readonly host: string;
  readonly path: string;
  readonly sessionId: string | null;
  /**
   * Optional raw, UN-redacted `{content, allowlist}` snapshot. Present ⇒
   * `receive()` `redactEvent`s it and spools the REDACTED result BEFORE the WAL
   * append (FR-047/048, AUDIT-20260717-12). Used by the 036 path only — every
   * type EXCEPT the specs/037 durable-identity types (see `bareSnapshot`).
   */
  readonly snapshot?: RawSnapshot;
  /**
   * Optional BARE, already-safe status snapshot (specs/037) — e.g. `{phase, from,
   * item}` / `{sessionId, startedAt}`. Carried through INTACT (NOT the
   * deny-by-default `{content,allowlist}` redaction, which would drop every field
   * for lack of an allowlist) for `BARE_SNAPSHOT_EVENT_TYPES` only; the plane
   * re-bounds it via `validateSnapshot` (≤32 KiB, no history arrays).
   */
  readonly bareSnapshot?: SnapshotPayload;
}

/**
 * The event types whose BARE, already-safe status snapshot survives to the plane
 * INTACT — the specs/037 durable-identity types (`{phase,from,item}` /
 * `{sessionId,startedAt}`) plus `invocation.completed`'s `{outcome, verb}` (the
 * verb name is a stackctl subcommand, not user content, so the fleet timeline can
 * show WHAT ran). A CLOSED set, so the passthrough does NOT open a general "bare
 * snapshot bypasses redaction" hole — every OTHER type still travels the 036
 * `{content,allowlist}` deny-by-default redaction path (FR-047/048).
 */
const BARE_SNAPSHOT_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'session.started',
  'session.ended',
  'phase.entered',
  'invocation.completed',
]);

/**
 * A raw snapshot as handed to the pipeline: the un-redacted content and the
 * `FieldAllowlist` describing each field's redaction policy (deny-by-default —
 * a field absent from `allowlist` never reaches disk). The pipeline never
 * spools `content` directly; only `redactEvent(content, allowlist, ctx)`.
 */
export interface RawSnapshot {
  readonly content: SnapshotPayload;
  readonly allowlist: FieldAllowlist;
}

/** Options for {@link createPipeline}. */
export interface PipelineOptions {
  /**
   * The redaction context used for every `receive()` on this pipeline. Default
   * `createSystemRedactionContext(walDir)` (the real machine). Injected so a
   * test drives a deterministic context (Constitution Principle VI).
   */
  readonly redactionContext?: RedactionContext;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recover the `(invocationId, invocationSequence)` pair a spooled WAL record
 * carries in its JSON payload (AUDIT-20260718-07). The payload is exactly what
 * `receive()` wrote: `JSON.stringify({ envelope, snapshot })`. Returns `null`
 * for anything that does not parse into a well-formed envelope carrying both
 * fields — recovery seeds a high-water mark, so an unreadable record simply
 * does not contribute (never a throw that would brick pipeline construction).
 */
function recoverInvocationFromPayload(
  payload: string,
): { readonly invocationId: string; readonly invocationSequence: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const envelope = parsed.envelope;
  if (!isRecord(envelope)) return null;
  const invocationId = envelope.invocationId;
  const invocationSequence = envelope.invocationSequence;
  if (typeof invocationId !== 'string' || invocationId.length === 0) return null;
  if (
    typeof invocationSequence !== 'number' ||
    !Number.isInteger(invocationSequence) ||
    invocationSequence < 1
  ) {
    return null;
  }
  return { invocationId, invocationSequence };
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `RawInvocationEvent.${label}: expected a non-empty string, got ${describeType(value)}`,
    );
  }
  return value;
}

/**
 * Narrow a raw `type` to `EventType` against the registered catalog
 * (`knownEventTypes()`). Fail loud on an unknown type (Principle V) — an
 * unregistered type has no classification. `.find` yields `EventType |
 * undefined`, so the narrowing needs no cast.
 */
function requireEventType(value: unknown, label: string): EventType {
  const raw = requireNonEmptyString(value, label);
  const match = knownEventTypes().find((known) => known === raw);
  if (match === undefined) {
    throw new Error(
      `RawInvocationEvent.${label}: unknown event type ${JSON.stringify(raw)} — every ` +
        'event type must be registered in the classification catalog (src/fleet/classification.ts)',
    );
  }
  return match;
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
    type: requireEventType(raw.type, 'type'),
    classification: requireClassification(raw.classification),
    // Instance identity (specs/037) — validated + carried through so the re-mint
    // PRESERVES the producer's host/path/sessionId rather than re-deriving them.
    host: requireNonEmptyString(raw.host, 'host'),
    path: requireNonEmptyString(raw.path, 'path'),
    sessionId: requireNullableString(raw.sessionId, 'sessionId'),
  };
}

/**
 * The redaction allowlist used when an event carries NO snapshot. Empty
 * because there is nothing to allow — deny-by-default over an empty payload
 * yields `{}`. An event that DOES carry snapshot content supplies its own
 * `FieldAllowlist` on `raw.snapshot.allowlist`.
 */
const EMPTY_SNAPSHOT_ALLOWLIST: FieldAllowlist = {};
const EMPTY_SNAPSHOT_CONTENT: SnapshotPayload = {};

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
export function createPipeline(walDir: string, options?: PipelineOptions): SidecarPipeline {
  const clock: Clock = new SystemClock();
  // The redaction context is resolved ONCE per pipeline instance (default: the
  // real machine). Injected in tests for determinism.
  const redactionContext: RedactionContext =
    options?.redactionContext ?? createSystemRedactionContext(walDir);
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

  // AUDIT-20260718-44: the single in-flight recovery promise. `null` until
  // the FIRST caller (across however many concurrent `receive()` calls race
  // a fresh pipeline) starts recovery; from then on every caller — including
  // ones that arrive before it resolves — awaits this SAME promise instead of
  // independently re-running `wal.replay()`. This is what makes
  // `ensureSequencesRecovered` idempotent/serialized without changing the
  // recovery logic itself (still exactly one WAL replay -> max
  // installationSequence + per-invocation max, see below).
  let recoveryPromise: Promise<void> | null = null;

  function nextInvocationSequence(invocationId: string): number {
    const current = invocationSequences.get(invocationId) ?? 0;
    const next = current + 1;
    invocationSequences.set(invocationId, next);
    return next;
  }

  /**
   * Ensure `nextInstallationSequence`/`invocationSequences` are recovered
   * from the WAL, running the recovery AT MOST ONCE for this pipeline
   * instance's whole lifetime — even when N concurrent `receive()` calls all
   * observe `nextInstallationSequence === null` at once (AUDIT-20260718-44).
   * Without this, each racing caller independently re-enters, each redundantly
   * `await`s its OWN `wal.replay()`, and each redundantly resets
   * `nextInstallationSequence` from a snapshot that may already be stale by
   * the time it lands — a hazard whose consequence (a duplicate
   * installationSequence) is latent rather than provably safe: it depends on
   * `wal.replay()`/`wal.append()` staying fully synchronous internally, an
   * implementation detail this function must not rely on. Memoizing the
   * in-flight promise removes the reentrancy entirely rather than trying to
   * out-race it.
   */
  function ensureSequencesRecovered(wal: WalHandle): Promise<void> {
    if (nextInstallationSequence !== null) return Promise.resolve();
    if (recoveryPromise === null) {
      recoveryPromise = (async () => {
        // Recover durably from ONE WAL replay: the WAL reflects every record
        // ever appended (including across a prior process's restart). Both
        // counters continue from there rather than resetting to 1.
        const existing = await wal.replay();
        let maxSequence = 0;
        for (const record of existing) {
          // installationSequence (FR-039): the WAL's own monotonic sequence.
          if (record.sequence > maxSequence) maxSequence = record.sequence;
          // invocationSequence (FR-040, AUDIT-20260718-07): the per-invocation
          // domain-ordering counter lives INSIDE the spooled payload. Seed the
          // map from the max seen per invocationId so a post-restart event
          // for an in-flight invocation continues (does not regress below the
          // plane's already-applied high-water mark and get silently dropped
          // as stale).
          const recovered = recoverInvocationFromPayload(record.payload);
          if (recovered !== null) {
            const current = invocationSequences.get(recovered.invocationId) ?? 0;
            if (recovered.invocationSequence > current) {
              invocationSequences.set(recovered.invocationId, recovered.invocationSequence);
            }
          }
        }
        nextInstallationSequence = maxSequence + 1;
      })();
    }
    return recoveryPromise;
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

      // 2. normalize snapshot — BEFORE spooling (FR-048/049, module header).
      // TWO paths, chosen by event TYPE (never a general redaction bypass):
      // BARE_SNAPSHOT_EVENT_TYPES (specs/037) carry the producer's bare,
      // already-safe status snapshot through INTACT (the plane re-bounds it via
      // validateSnapshot); every OTHER type is the 036 path, UNCHANGED — redact
      // under its own allowlist (or `{}`) so raw content NEVER reaches disk.
      let snapshot: Readonly<Record<string, unknown>>;
      if (BARE_SNAPSHOT_EVENT_TYPES.has(raw.type)) {
        snapshot = rawInput.bareSnapshot ?? EMPTY_SNAPSHOT_CONTENT;
      } else {
        const rawSnapshot = rawInput.snapshot;
        const snapshotContent = rawSnapshot?.content ?? EMPTY_SNAPSHOT_CONTENT;
        const snapshotAllowlist = rawSnapshot?.allowlist ?? EMPTY_SNAPSHOT_ALLOWLIST;
        snapshot = redactEvent(snapshotContent, snapshotAllowlist, redactionContext);
      }

      // 3. assign eventId + sequence. `constructEnvelope` mints `eventId`
      // internally (mintUuidV7) — never passed in, per its own contract.
      const wal = await getWal();
      await ensureSequencesRecovered(wal);
      const installationSequence = takeInstallationSequence();
      const invocationSequence = nextInvocationSequence(raw.invocationId);

      const constructed = constructEnvelope(
        clock,
        originMonotonicMs,
        {
          installationId: raw.installationId,
          invocationId: raw.invocationId,
          runId: raw.runId,
          installationSequence,
          invocationSequence,
          schemaVersion: SCHEMA_VERSION,
          type: raw.type,
          classification: raw.classification,
          sessionId: raw.sessionId, // PRODUCER's — preserved, never hardcoded null
        },
        walDir, // constructs wallClock/monotonic; host/path derived here are overridden next
      );

      // PRESERVE the producer's instance identity. constructEnvelope DERIVES
      // host/path from its installationRoot arg (FR-011), so it just derived them
      // from `walDir` (the SPOOL dir) — wrong for the observed instance. Override
      // with the producer's host/path (realpath of the REAL install root) via a
      // fresh typed EventEnvelope literal (no cast). The sidecar-authoritative
      // fields (eventId + both sequences) come from `constructed`, untouched.
      const envelope: EventEnvelope = {
        ...constructed,
        host: raw.host,
        path: raw.path,
      };

      const event: TelemetryEvent = { envelope, snapshot };

      // 4. spool — the REDACTED event, byte-identical to what transmit will
      // later re-send on retry/replay (FR-049).
      await wal.append(JSON.stringify(event));

      // 5. transmit is the caller's concern (module header) — return spooled event.
      return event;
    },
  };
}
