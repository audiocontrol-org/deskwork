/**
 * specs/036/037 — the SINGLE-FRAME ingest path, extracted from `daemon.ts` and
 * made NON-FATAL by construction (AUDIT-20260719-18).
 *
 * A poison/malformed `event` frame must NEVER crash the sidecar daemon. This is
 * the ingest-side member of the file-local family of single-unit guards that
 * already enforce that discipline elsewhere:
 *   - `computeFleetTickGuarded` / `computeInstanceTickGuarded` (plane) — a bad
 *     tick is CAUGHT, surfaced, and dropped; it never terminates the process.
 *   - `recordDroppedRecord` / `recordUndeliveredCommand` (daemon.ts) — a
 *     permanently-rejected spool record / an undeliverable command is surfaced
 *     LOUD-by-default (stderr) and dropped, never silently swallowed.
 *
 * `ingestFrameGuarded` CATCHES a single frame's ingest failure — an absent
 * (null) host/path identity, or ANY throw out of `receive` — SURFACES it via
 * `recordDroppedFrame`, and DROPS that one frame, returning normally. Because it
 * never rejects, the throw can never propagate uncaught out of the
 * frame-received callback and take the whole telemetry uplink down. "Fail loud"
 * here means SURFACE + reject this ONE event, NOT crash the daemon.
 *
 * The strict identity guarantee for VALID live producers is UNCHANGED: a legit
 * 037 producer always carries host/path (schemaVersion ≥ 2, FR-011), and the
 * strict socket parser already rejects a null/absent host/path at the boundary
 * (`validateEnvelope` strict), so a null reaching here is a genuine
 * producer/legacy defect (e.g. a stale pre-037 CLI binary talking to an
 * upgraded, long-lived sidecar during a rollout). The happy path threads the
 * preserved producer identity into `receive` exactly as before.
 *
 * Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.
 */
import type { EventFrame } from '../telemetry/protocol.js';
import type { RawInvocationEvent, SidecarPipeline } from './pipeline.js';

/** What was dropped and WHY when a single frame's ingest fails (mirrors
 * `DroppedSpoolRecord`'s "name what is discarded" discipline, FR-017). */
export interface DroppedFrame {
  /** The dropped frame's runId (may be null on a run-less event). */
  readonly runId: string | null;
  /** Human-readable reason the frame was dropped rather than ingested. */
  readonly reason: string;
}

/** Collaborators `ingestFrameGuarded` needs, injected so the unit under test is
 * the guard logic itself (never a real WAL or socket). */
export interface IngestFrameDeps {
  /** The pipeline receive seam (redact + spool). */
  readonly receive: (raw: RawInvocationEvent) => ReturnType<SidecarPipeline['receive']>;
  /** Surface a dropped frame (loud-by-default in production, injectable in tests). */
  readonly recordDroppedFrame: (info: DroppedFrame) => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ingest ONE `event` frame, GUARDED. NEVER throws / NEVER rejects: a bad frame
 * is surfaced via `recordDroppedFrame` and dropped, so it can never become an
 * unhandled rejection that terminates the daemon.
 */
export async function ingestFrameGuarded(frame: EventFrame, deps: IngestFrameDeps): Promise<void> {
  const env = frame.event.envelope;
  const { host, path } = env;
  // Absent (null) instance identity — a genuine producer/legacy defect that got
  // past the strict socket parser (or a future non-strict path). Surface + DROP
  // the ONE frame; never throw it into the frame-received callback
  // (AUDIT-20260719-18: a poison frame must not crash the daemon).
  if (host === null || path === null) {
    deps.recordDroppedFrame({
      runId: env.runId,
      reason:
        'received an event frame with absent host/path — a live producer frame must carry ' +
        'instance identity (host/path derived at emit, FR-011); this one frame is dropped.',
    });
    return;
  }
  try {
    await deps.receive({
      installationId: env.installationId,
      invocationId: env.invocationId,
      runId: env.runId,
      type: env.type,
      classification: env.classification,
      // specs/037: PRESERVE the producer's instance identity (host/path derived
      // by the producer from the REAL install root; sessionId is producer-only
      // context) so the pipeline re-mint carries them through intact.
      host,
      path,
      sessionId: env.sessionId,
      // The producer's bare snapshot — carried INTACT for the specs/037
      // durable-identity types, ignored for every other (036-redaction) type.
      bareSnapshot: frame.event.snapshot,
    });
  } catch (error) {
    // Any failure ingesting this ONE frame (redaction, WAL append, validation)
    // is non-fatal: surface + drop, never propagate.
    deps.recordDroppedFrame({
      runId: env.runId,
      reason: `ingesting this frame threw and it was dropped: ${describeError(error)}`,
    });
  }
}
