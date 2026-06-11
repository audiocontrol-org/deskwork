/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/stream-result-extractor.ts
 *
 * specs/014-audit-barrage-reliability — stream-json result extraction
 * (FR-010, research.md D7).
 *
 * A stream-json lane's stdout is NDJSON (one event per line). This consumer:
 *
 *   1. appends every line VERBATIM to the lane's forensic capture
 *      `<model>.events.ndjson` (liveness post-mortems read this; lift never
 *      does) — including non-JSON noise and a trailing partial line cut off
 *      by a kill;
 *   2. tracks the terminal `result` event (`{"type":"result", "result":
 *      "<markdown>"}`); the LAST one wins. At settle the result text is
 *      handed back so the spawn wrapper can write `<model>.md` byte-for-byte
 *      — the exact artifact contract lift already consumes.
 *
 * A stream that ends without a result event settles with `resultText: null`
 * and the spawn wrapper writes NO markdown artifact — a killed lane's
 * partial chatter is never fabricated into a report (Principle V).
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { isPlainObject } from '../util/typeguards.js';

export interface StreamResultExtraction {
  readonly resultText: string | null;
}

export interface StreamResultExtractor {
  /** Feed a raw stdout chunk (arbitrary NDJSON line fragmentation). */
  onChunk(chunk: Buffer): void;
  /** Flush the capture, close the events file, and report the result text. */
  settle(): Promise<StreamResultExtraction>;
}

export function createStreamResultExtractor(
  eventsPath: string,
): StreamResultExtractor {
  let eventsStream: WriteStream | null = null;
  let partial = '';
  let resultText: string | null = null;
  let streamError: Error | null = null;

  function ensureStream(): WriteStream {
    if (eventsStream === null) {
      eventsStream = createWriteStream(eventsPath);
      eventsStream.on('error', (err) => {
        // Captured and re-thrown at settle: the forensic capture failing is a
        // filesystem fault the orchestrator is allowed to crash on, but the
        // child's stdio handlers must never throw mid-'data' event.
        streamError = err;
      });
    }
    return eventsStream;
  }

  function consumeLine(line: string): void {
    ensureStream().write(`${line}\n`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // non-JSON noise: captured verbatim above, never extracted
    }
    if (!isPlainObject(parsed)) return;
    const resultField = parsed['result'];
    if (parsed['type'] === 'result' && typeof resultField === 'string') {
      resultText = resultField;
    }
  }

  return {
    onChunk(chunk: Buffer): void {
      partial += chunk.toString('utf8');
      let newlineIndex = partial.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = partial.slice(0, newlineIndex);
        partial = partial.slice(newlineIndex + 1);
        consumeLine(line);
        newlineIndex = partial.indexOf('\n');
      }
    },

    async settle(): Promise<StreamResultExtraction> {
      // A trailing partial line (kill mid-event) is forensic data too —
      // capture it raw; it cannot be a parseable terminal result.
      if (partial.length > 0) {
        ensureStream().write(partial);
        partial = '';
      }
      if (eventsStream !== null) {
        const stream = eventsStream;
        await new Promise<void>((resolveEnd, rejectEnd) => {
          stream.once('error', rejectEnd);
          stream.once('finish', resolveEnd);
          stream.end();
        });
      }
      if (streamError !== null) throw streamError;
      return { resultText };
    },
  };
}
