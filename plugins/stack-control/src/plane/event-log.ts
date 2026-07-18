// specs/036-fleet-control-plane — AUDIT-20260717-14 (persist + replay the
// live event log). Pairs with tests/fleet/plane-runtime-fixes.test.ts's
// restart-recovery scenario.
//
// THE DEFECT THIS CLOSES: `createPlaneRuntime` held the entire accepted-event
// history in a single in-process array with NO persistence, so a plane
// restart (deploy, crash, supervisor bounce) wiped the whole live registry —
// and the ingesting sidecars will not naturally replay already-accepted
// (200'd) events, since their WAL drain cursor already advanced past them. The
// feature's stated purpose (durable operational visibility into a fleet) did
// not survive the plane's OWN restart.
//
// THE FIX (proportionate, single-operator scale FR-078): every ACCEPTED
// classified event is appended, append-only, to a durable on-disk log
// (JSONL). On boot, `createEventLog` REPLAYS that log so a fresh runtime over
// the same durable dir rehydrates its registry — restart recovers.
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
// filesystem. A corrupt persisted line fails loud (never silently skipped).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateEnvelope } from '../fleet/event.js';
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
 * internally consistent — never trusted verbatim off disk.
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
  const envelope = validateEnvelope((raw as { envelope: unknown }).envelope);
  return { envelope, classification: envelope.classification, type: envelope.type };
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

  const replayed: ClassifiedEvent[] = [];
  if (existsSync(path)) {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      replayed.push(parseLine(line, path));
    }
  }

  return {
    replayed,
    append(event: ClassifiedEvent): void {
      appendFileSync(path, `${JSON.stringify(event)}\n`);
    },
  };
}
