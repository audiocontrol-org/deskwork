// specs/014-audit-barrage-reliability — T023 (RED): stream-json result
// extraction (FR-010, research.md D7).
//
// A stream-json lane's stdout is NDJSON. The extractor appends every line to
// the forensic capture `<model>.events.ndjson` verbatim and tracks the
// terminal `result` event; at settle it hands back the result text so the
// spawn wrapper can write `<model>.md` byte-for-byte — the same artifact lift
// already consumes. A stream that ends without a result event yields NULL
// (the artifact is then absent; no partial fabrication — Principle V).

import { existsSync } from 'node:fs';
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

describe('multi-turn assistant-text assembly (FR-005 distortion fix, 2026-06-11 SC-001 replay)', () => {
  // The live FR-005 verification caught this: a plan-mode agentic run emitted
  // its 6 finding blocks in a MID-RUN assistant message; the terminal result
  // event carried only the wrap-up summary (a duplicate of the LAST assistant
  // text). Last-message-only extraction produced an artifact with zero
  // finding blocks — unliftable. The artifact must assemble EVERY assistant
  // text block when the stream completed its protocol.
  function assistantEvent(text: string): string {
    return JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text }] },
    });
  }

  it('assembles all assistant text blocks; the result-event duplicate of the final message is not doubled', async () => {
    const x = createStreamResultExtractor(eventsPath());
    const findings = '### AUDIT-BARRAGE-claude-01 — mid-run finding\n\nSeverity: high';
    const summary = 'Bottom line: one finding, see above.';
    x.onChunk(
      Buffer.from(
        [
          assistantEvent('Starting the audit.'),
          assistantEvent(findings),
          assistantEvent(summary),
          JSON.stringify({ type: 'result', subtype: 'success', result: summary }),
        ].join('\n') + '\n',
      ),
    );
    const { resultText } = await x.settle();
    expect(resultText).toBe(`Starting the audit.\n\n${findings}\n\n${summary}`);
  });

  it('a result text that is NOT a duplicate of the last assistant text is appended, never dropped', async () => {
    const x = createStreamResultExtractor(eventsPath());
    x.onChunk(
      Buffer.from(
        [
          assistantEvent('mid-run analysis'),
          JSON.stringify({ type: 'result', result: 'distinct final text' }),
        ].join('\n') + '\n',
      ),
    );
    const { resultText } = await x.settle();
    expect(resultText).toBe('mid-run analysis\n\ndistinct final text');
  });

  it('a killed stream with assistant texts but NO result event still yields null (artifact stays absent)', async () => {
    const x = createStreamResultExtractor(eventsPath());
    x.onChunk(Buffer.from(`${assistantEvent('partial work before the kill')}\n`));
    const { resultText } = await x.settle();
    expect(resultText).toBeNull();
  });
});

describe('events-capture honesty (AUDIT-20260611-21)', () => {
  // The events file is created LAZILY on the first consumed line. A lane
  // that never delivered a stdout byte (spawn failure, zero-output stream)
  // must settle reporting that NO capture was written — and the file must
  // genuinely not exist — so the spawn wrapper never records an eventsPath
  // naming a nonexistent file (same artifact-honesty posture as the
  // AUDIT-01 report-bytes fix).
  it('a settle with zero chunks consumed reports eventsCaptured false and creates NO file', async () => {
    const path = eventsPath();
    const x = createStreamResultExtractor(path);
    const extraction = await x.settle();
    expect(extraction.resultText).toBeNull();
    expect(extraction.eventsCaptured).toBe(false);
    expect(existsSync(path)).toBe(false);
  });

  it('a settle that consumed at least one line reports eventsCaptured true and the file exists', async () => {
    const path = eventsPath();
    const x = createStreamResultExtractor(path);
    x.onChunk(Buffer.from('{"type":"system","subtype":"init"}\n'));
    const extraction = await x.settle();
    expect(extraction.eventsCaptured).toBe(true);
    expect(existsSync(path)).toBe(true);
  });
});
