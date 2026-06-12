/**
 * plugins/stack-control/scripts/rebuild-artifact-from-events.ts
 *
 * Forensic utility (specs/014): rebuild a stream-json lane's `<model>.md`
 * artifact from its recorded `<model>.events.ndjson` capture by replaying
 * the events through the CURRENT stream-result extractor. Useful when an
 * extractor fix lands after a run was recorded — the events capture is the
 * source of truth; the artifact is derived.
 *
 * Usage: tsx scripts/rebuild-artifact-from-events.ts <events.ndjson> <out.md>
 *
 * Exits 1 (artifact stays unwritten) when the recorded stream never
 * delivered a terminal result event — a killed lane is not retroactively
 * given an artifact (Principle V).
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStreamResultExtractor } from '../src/scope-discovery/audit-barrage/stream-result-extractor.js';

async function main(): Promise<void> {
  const [eventsPath, outPath] = process.argv.slice(2);
  if (eventsPath === undefined || outPath === undefined) {
    process.stderr.write(
      'usage: tsx scripts/rebuild-artifact-from-events.ts <events.ndjson> <out.md>\n',
    );
    process.exit(2);
  }
  // The extractor re-captures events as a side effect; aim that at a
  // throwaway location so the original recording is never touched.
  const scratch = mkdtempSync(join(tmpdir(), 'rebuild-artifact-'));
  try {
    const extractor = createStreamResultExtractor(join(scratch, 'replay.events.ndjson'));
    extractor.onChunk(readFileSync(eventsPath));
    const { resultText } = await extractor.settle();
    if (resultText === null) {
      process.stderr.write(
        'rebuild-artifact-from-events: the recorded stream has no terminal result ' +
          'event — no artifact can be rebuilt (killed/incomplete lane).\n',
      );
      process.exit(1);
    }
    writeFileSync(outPath, resultText, 'utf8');
    process.stderr.write(
      `rebuild-artifact-from-events: wrote ${Buffer.byteLength(resultText, 'utf8')} bytes to ${outPath}\n`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

void main();
