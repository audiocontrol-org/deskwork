// specs/036-fleet-control-plane — T101 (impl), Phase 7 (US5 — serve
// history without amplifying the capped store). Pairs with the RED test at
// tests/fleet/history-timings.test.ts (this task's own RED, no dedicated
// RED test existed before T101).
//
// Fills the `runHistory` / `runTimings` route slots T051 (src/plane/http/
// server.ts) already declares:
//   - `runHistory` → GET /v1/runs/{runId}/history  (C7)
//   - `runTimings` → GET /v1/runs/{runId}/timings  (C7, FR-085)
//
// READ SEAM (contracts/plane-client-api.md C7, data-model.md § Storage
// layout, SC-008/SC-009): both functions read through an INJECTED
// `CdnReader` (T099, src/storage/cdn-reader.ts) — never an `ObjectStorePort`
// directly. There is no parameter through which either function COULD
// reach the durable store on its own, so a direct capped-store read is
// structurally impossible here, the same discipline `fleetSnapshot` /
// `perRunDetail` (api.ts, T053/T054) already hold for the LIVE path (see
// tests/fleet/live-no-cloud-read.test.ts, T090). History is deliberately
// the one place a durable-store read is allowed to happen at all — but
// only ever CDN-fronted, never direct.
//
// OBJECT KEY (data-model.md § Storage layout ~140): the finalized run's
// history lives at `runs/{installationId}/{runId}/summary.json` — a
// REVISION-FREE, canned, path-only key ("finalized once at run end").
// Unlike the derived-summary artifact (T098, `derived/summary-{rev}.json`,
// revision-in-the-key because it can be recomputed on a late event), the
// finalized run summary never changes once written, so reading it needs no
// revision resolution, probing, or listing — a `listObjects` call would
// itself be a capped-store operation this module must never perform
// (research.md ~127: "the plane's own index resolves the manifest-revision
// pointer — no... listing to find the newest revision").
//
// FR-085 HONESTY: design / spec / execution / governance phase durations
// are read from whatever the archived record actually carries. A phase the
// record does not carry is represented as `undefined` — never fabricated —
// mirroring the same no-fallback discipline `FleetEntry` (T050, src/plane/
// registry.ts) already applies to its deliberately-omitted compass/model/
// git facets (see that module's header comment).
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 resolution (no `@/` alias — this plugin has none). Parses
// `unknown` JSON with explicit field-by-field validation (mirrors
// src/plane/commands/store.ts's `parseRecord`) rather than a type
// assertion — a malformed archived record fails loud, never silently.

import type { CdnReader } from '../../storage/cdn-reader.js';

// ---------------------------------------------------------------------------
// Object key (data-model.md § Storage layout ~140).
// ---------------------------------------------------------------------------

/** Inputs to {@link runHistoryObjectKey}. */
export interface RunHistoryObjectKeyInput {
  readonly installationId: string;
  readonly runId: string;
}

/**
 * Deterministic, revision-free object key for a run's finalized history
 * record: `runs/{installationId}/{runId}/summary.json`. Written once at run
 * end (data-model.md § Storage layout); reading it never requires
 * discovering a revision.
 */
export function runHistoryObjectKey(input: RunHistoryObjectKeyInput): string {
  if (input.installationId.length === 0) {
    throw new Error('runHistoryObjectKey: installationId must be a non-empty string.');
  }
  if (input.runId.length === 0) {
    throw new Error('runHistoryObjectKey: runId must be a non-empty string.');
  }
  return `runs/${input.installationId}/${input.runId}/summary.json`;
}

// ---------------------------------------------------------------------------
// FR-085 — the four named phase durations, never collapsed, never
// fabricated (mirrors C4's "three axes never collapsed" discipline one
// level over: four independently-honest phases, not one summary number).
// ---------------------------------------------------------------------------

/** One phase's duration, present only when the archived record actually
 * carries it. There is no "unknown" variant beyond simple absence
 * (`undefined` at the call site) — a present {@link PhaseDuration} is
 * always a real, validated non-negative duration. */
export interface PhaseDuration {
  readonly durationMs: number;
}

/**
 * The four FR-085 phase durations, each independently `PhaseDuration |
 * undefined`. `undefined` means "the archived record does not carry this
 * phase" — an honest absence, never a fabricated `0` or a dropped field.
 */
export interface RunPhaseDurations {
  readonly design: PhaseDuration | undefined;
  readonly spec: PhaseDuration | undefined;
  readonly execution: PhaseDuration | undefined;
  readonly governance: PhaseDuration | undefined;
}

const PHASE_DURATIONS_ABSENT: RunPhaseDurations = {
  design: undefined,
  spec: undefined,
  execution: undefined,
  governance: undefined,
};

// ---------------------------------------------------------------------------
// C7 — History (GET /v1/runs/{runId}/history).
// ---------------------------------------------------------------------------

/** The parsed, bounded historical record for one run. */
export interface RunHistoryRecord {
  readonly installationId: string;
  readonly runId: string;
  readonly phases: RunPhaseDurations;
}

/**
 * `runHistory`'s bounded result (C7). `found: false` is a clean, typed
 * outcome for "no archived history yet" (the run never finalized, or has
 * not yet been archived) — never a thrown error; a 404 from the CDN reader
 * is an expected, legitimate shape of "not there yet" (mirrors
 * `CdnReadResult`'s own 404-is-not-an-error contract, T099).
 */
export type RunHistoryResult =
  | { readonly found: true; readonly record: RunHistoryRecord }
  | { readonly found: false; readonly installationId: string; readonly runId: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalPhaseDuration(
  phases: Record<string, unknown>,
  phase: 'design' | 'spec' | 'execution' | 'governance',
  key: string,
): PhaseDuration | undefined {
  const value = phases[phase];
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error(
      `runHistory: archived record at ${JSON.stringify(key)} has a non-object ` +
        `${JSON.stringify(phase)} phase entry.`,
    );
  }
  const { durationMs } = value;
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error(
      `runHistory: archived record at ${JSON.stringify(key)} has an invalid ` +
        `${JSON.stringify(`${phase}.durationMs`)} — must be a non-negative finite number, ` +
        `received: ${String(durationMs)}.`,
    );
  }
  return { durationMs };
}

/**
 * Parse the archived history object's raw bytes into a {@link
 * RunHistoryRecord}. `unknown`-typed, field-validated (no `as`) — a
 * malformed archived record fails loud (Principle V) rather than silently
 * producing a partially-fabricated result.
 */
function parseRunHistoryRecord(
  body: Uint8Array,
  key: string,
  installationId: string,
  runId: string,
): RunHistoryRecord {
  const text = new TextDecoder().decode(body);
  const raw: unknown = JSON.parse(text);
  if (!isPlainObject(raw)) {
    throw new Error(`runHistory: archived record at ${JSON.stringify(key)} is not a JSON object.`);
  }

  const { phases: phasesRaw } = raw;
  if (phasesRaw !== undefined && !isPlainObject(phasesRaw)) {
    throw new Error(
      `runHistory: archived record at ${JSON.stringify(key)} has a non-object "phases" field.`,
    );
  }
  const phasesContainer: Record<string, unknown> = phasesRaw === undefined ? {} : phasesRaw;

  return {
    installationId,
    runId,
    phases: {
      design: readOptionalPhaseDuration(phasesContainer, 'design', key),
      spec: readOptionalPhaseDuration(phasesContainer, 'spec', key),
      execution: readOptionalPhaseDuration(phasesContainer, 'execution', key),
      governance: readOptionalPhaseDuration(phasesContainer, 'governance', key),
    },
  };
}

/**
 * Read one run's archived history (C7, `GET /v1/runs/{runId}/history`)
 * through the injected {@link CdnReader} — the ONLY seam through which this
 * function can reach the durable store, and only ever CDN-fronted (T099
 * absorbs repeated/varied client reads of the same canned key into a single
 * origin transaction, SC-008). The object key is revision-free and
 * path-only (no query-string influence, FR-069), so this read is exactly
 * the "canned" shape C7 requires.
 */
export async function runHistory(
  reader: CdnReader,
  installationId: string,
  runId: string,
): Promise<RunHistoryResult> {
  const key = runHistoryObjectKey({ installationId, runId });
  const result = await reader.readObject(key);
  if (result.status === 404) {
    return { found: false, installationId, runId };
  }
  if (result.body === null) {
    throw new Error(
      `runHistory: CdnReader reported status 200 with a null body for ${JSON.stringify(key)} — ` +
        'a 200 must always carry a body (CdnReadResult contract, T099).',
    );
  }
  const record = parseRunHistoryRecord(result.body, key, installationId, runId);
  return { found: true, record };
}

// ---------------------------------------------------------------------------
// C7 — Timings (GET /v1/runs/{runId}/timings, FR-085).
// ---------------------------------------------------------------------------

/** `runTimings`'s response (C7/FR-085): the four named phase durations for
 * one run, each honestly present or absent — see {@link RunPhaseDurations}. */
export interface RunTimings {
  readonly runId: string;
  readonly phases: RunPhaseDurations;
}

/**
 * Read one run's FR-085 phase durations (`GET /v1/runs/{runId}/timings`).
 * Delegates to {@link runHistory} for the archived record — the four named
 * phases live in that SAME archived object, so there is exactly one source
 * of truth for both endpoints, never a second parallel read path that could
 * drift from it. When no archived record exists yet (`found: false`), every
 * phase is honestly absent — this is a "no data yet" projection, not a
 * fabricated all-zero timing.
 */
export async function runTimings(
  reader: CdnReader,
  installationId: string,
  runId: string,
): Promise<RunTimings> {
  const history = await runHistory(reader, installationId, runId);
  if (!history.found) {
    return { runId, phases: PHASE_DURATIONS_ABSENT };
  }
  return { runId, phases: history.record.phases };
}
