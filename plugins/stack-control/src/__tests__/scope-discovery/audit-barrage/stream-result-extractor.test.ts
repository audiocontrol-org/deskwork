// specs/014-audit-barrage-reliability — T023 (RED): stream-json result
// extraction (FR-010, research.md D7).
//
// A stream-json lane's stdout is NDJSON. The extractor appends every line to
// the forensic capture `<model>.events.ndjson` verbatim and tracks the
// terminal `result` event; at settle it hands back the result text so the
// spawn wrapper can write `<model>.md` byte-for-byte — the same artifact lift
// already consumes. A stream that ends without a result event yields NULL
// (the artifact is then absent; no partial fabrication — Principle V).

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStreamResultExtractor } from '../../../scope-discovery/audit-barrage/stream-result-extractor.js';

let dir: string;
let counter = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stream-extractor-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function eventsPath(): string {
  counter += 1;
  return join(dir, `lane-${counter}.events.ndjson`);
}

describe('result-event extraction (FR-010)', () => {
  it('returns the terminal result event text byte-for-byte, across chunk splits', async () => {
    const path = eventsPath();
    const x = createStreamResultExtractor(path);
    x.onChunk(Buffer.from('{"type":"system","subtype":"init"}\n{"type":"assist'));
    x.onChunk(Buffer.from('ant","message":"thinking"}\n'));
    x.onChunk(
      Buffer.from(
        '{"type":"result","subtype":"success","result":"# Report\\n\\n### F-01 — finding"}\n',
      ),
    );
    const { resultText } = await x.settle();
    expect(resultText).toBe('# Report\n\n### F-01 — finding');
  });

  it('captures every NDJSON line verbatim in the events file', async () => {
    const path = eventsPath();
    const x = createStreamResultExtractor(path);
    const lines = [
      '{"type":"system","subtype":"init"}',
      'not even json — captured anyway',
      '{"type":"result","subtype":"success","result":"ok"}',
    ];
    x.onChunk(Buffer.from(`${lines.join('\n')}\n`));
    await x.settle();
    const captured = await readFile(path, 'utf8');
    expect(captured).toBe(`${lines.join('\n')}\n`);
  });

  it('a stream ending WITHOUT a result event yields null (artifact stays absent)', async () => {
    const x = createStreamResultExtractor(eventsPath());
    x.onChunk(Buffer.from('{"type":"system","subtype":"init"}\n{"type":"assistant"}\n'));
    const { resultText } = await x.settle();
    expect(resultText).toBeNull();
  });

  it('a trailing partial line (kill mid-event) is still captured forensically', async () => {
    const path = eventsPath();
    const x = createStreamResultExtractor(path);
    x.onChunk(Buffer.from('{"type":"system"}\n{"type":"assistant","mess'));
    const { resultText } = await x.settle();
    expect(resultText).toBeNull();
    const captured = await readFile(path, 'utf8');
    expect(captured).toContain('{"type":"assistant","mess');
  });

  it('the LAST result event wins when several arrive', async () => {
    const x = createStreamResultExtractor(eventsPath());
    x.onChunk(Buffer.from('{"type":"result","result":"first"}\n{"type":"result","result":"second"}\n'));
    const { resultText } = await x.settle();
    expect(resultText).toBe('second');
  });
});
