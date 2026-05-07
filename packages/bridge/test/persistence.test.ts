/**
 * ChatLog tests — exercises append/replay round-trip, sinceSeq +
 * limit filters, day rotation, lazy directory creation, corruption
 * detection (seq gap + reverse-ts), and missing-file behavior.
 *
 * Uses on-disk tmpdir fixtures (mkdtempSync); does NOT mock the fs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatLog } from '@/persistence.ts';
import type { ChatLogRow } from '@/types.ts';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'studio-bridge-persistence-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeLog(dateProvider?: () => Date): ChatLog {
  if (dateProvider === undefined) {
    return new ChatLog({ projectRoot: tmp });
  }
  return new ChatLog({ projectRoot: tmp, dateProvider });
}

describe('ChatLog — append/loadHistory round trip', () => {
  it('writes 3 rows and loads 3 in order', async () => {
    const log = makeLog();
    const rows: ChatLogRow[] = [
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { seq: 2, ts: 200, role: 'operator', text: 'two' },
      { seq: 3, ts: 300, role: 'operator', text: 'three' },
    ];
    for (const r of rows) await log.append(r);
    const got = await log.loadHistory();
    expect(got.length).toBe(3);
    expect(got).toEqual(rows);
  });

  it('handles tool-use and prose rows', async () => {
    const log = makeLog();
    const rows: ChatLogRow[] = [
      { seq: 1, ts: 100, role: 'operator', text: 'do it' },
      {
        kind: 'tool-use',
        seq: 2,
        ts: 200,
        tool: 'Bash',
        args: { command: 'ls' },
        result: 'foo\nbar',
        status: 'done',
      },
      { kind: 'prose', seq: 3, ts: 300, text: 'done' },
    ];
    for (const r of rows) await log.append(r);
    const got = await log.loadHistory();
    expect(got).toEqual(rows);
  });

  it('lazily creates the chat-log directory on first append', async () => {
    const log = makeLog();
    const dir = join(tmp, '.deskwork', 'chat-log');
    expect(existsSync(dir)).toBe(false);
    await log.append({ seq: 1, ts: 100, role: 'operator', text: 'first' });
    expect(existsSync(dir)).toBe(true);
  });
});

describe('ChatLog — filters', () => {
  it('sinceSeq filters out rows at or below the cursor', async () => {
    const log = makeLog();
    for (let i = 1; i <= 5; i += 1) {
      await log.append({ seq: i, ts: i * 10, role: 'operator', text: `m${i}` });
    }
    const got = await log.loadHistory({ sinceSeq: 2 });
    const seqs = got
      .filter((r) => r.kind !== 'corruption-marker')
      .map((r) => (r.kind === 'corruption-marker' ? -1 : r.seq));
    expect(seqs).toEqual([3, 4, 5]);
  });

  it('limit caps the number of returned rows', async () => {
    const log = makeLog();
    for (let i = 1; i <= 10; i += 1) {
      await log.append({ seq: i, ts: i * 10, role: 'operator', text: `m${i}` });
    }
    const got = await log.loadHistory({ limit: 3 });
    expect(got.length).toBe(3);
  });
});

describe('ChatLog — corruption detection', () => {
  it('seq gap (1, 2, 5) emits a marker between row 2 and row 5', async () => {
    const log = makeLog();
    await log.append({ seq: 1, ts: 100, role: 'operator', text: 'a' });
    await log.append({ seq: 2, ts: 200, role: 'operator', text: 'b' });
    await log.append({ seq: 5, ts: 500, role: 'operator', text: 'e' });
    const got = await log.loadHistory();
    expect(got.length).toBe(4);
    expect(got[0]).toMatchObject({ seq: 1 });
    expect(got[1]).toMatchObject({ seq: 2 });
    expect(got[2]).toMatchObject({
      kind: 'corruption-marker',
      from: 2,
      to: 5,
    });
    expect(got[3]).toMatchObject({ seq: 5 });
  });

  it('reverse-ts emits a marker between the affected rows', async () => {
    const log = makeLog();
    await log.append({ seq: 1, ts: 500, role: 'operator', text: 'late-first' });
    await log.append({ seq: 2, ts: 300, role: 'operator', text: 'earlier' });
    const got = await log.loadHistory();
    const markerCount = got.filter((r) => r.kind === 'corruption-marker').length;
    expect(markerCount).toBe(1);
    expect(got[1]).toMatchObject({
      kind: 'corruption-marker',
      from: 1,
      to: 2,
    });
  });
});

describe('ChatLog — day rotation', () => {
  it('appends on day 1 and day 2 land in separate files', async () => {
    let now = new Date('2026-05-06T10:00:00Z');
    const log = makeLog(() => now);
    await log.append({ seq: 1, ts: 100, role: 'operator', text: 'day1' });

    now = new Date('2026-05-07T11:00:00Z');
    await log.append({ seq: 1, ts: 200, role: 'operator', text: 'day2' });

    const dir = join(tmp, '.deskwork', 'chat-log');
    const day1Path = join(dir, '2026-05-06.jsonl');
    const day2Path = join(dir, '2026-05-07.jsonl');
    expect(existsSync(day1Path)).toBe(true);
    expect(existsSync(day2Path)).toBe(true);

    const day1Raw = readFileSync(day1Path, 'utf8').trim();
    const day1Parsed: unknown = JSON.parse(day1Raw);
    expect(day1Parsed).toMatchObject({ role: 'operator', text: 'day1' });

    // loadHistory uses the current day per dateProvider. now points to day2.
    const got = await log.loadHistory();
    expect(got.length).toBe(1);
    const row = got[0];
    if (row === undefined || row.kind === 'corruption-marker' || row.kind === 'tool-use' || row.kind === 'prose') {
      throw new Error('expected operator message on day 2');
    }
    expect(row.text).toBe('day2');
  });
});

describe('ChatLog — concurrent appends', () => {
  it('50 concurrent appends produce 50 rows in seq order with no duplicates and no gaps', async () => {
    const log = makeLog();
    const rows: ChatLogRow[] = Array.from({ length: 50 }, (_, i) => ({
      seq: i + 1,
      ts: (i + 1) * 10,
      role: 'operator' as const,
      text: `m${i + 1}`,
    }));
    await Promise.all(rows.map((r) => log.append(r)));

    const got = await log.loadHistory({ limit: 100 });
    const seqs: number[] = [];
    for (const row of got) {
      if (row.kind === 'corruption-marker') {
        throw new Error('unexpected corruption marker in concurrent append test');
      }
      seqs.push(row.seq);
    }
    expect(seqs.length).toBe(50);
    expect(seqs).toEqual(rows.map((r) => r.seq));
    expect(new Set(seqs).size).toBe(50);
  });

  it('concurrent appends crossing a day rotation land in the correct files', async () => {
    // Use local-time year/month/day — currentDateString reads local components.
    let now = new Date(2026, 4, 6, 12, 0, 0);
    const log = makeLog(() => now);
    const day1Rows: ChatLogRow[] = Array.from({ length: 5 }, (_, i) => ({
      seq: i + 1,
      ts: 100 + i,
      role: 'operator' as const,
      text: `d1-${i + 1}`,
    }));
    const day2Rows: ChatLogRow[] = Array.from({ length: 5 }, (_, i) => ({
      seq: i + 1,
      ts: 200 + i,
      role: 'operator' as const,
      text: `d2-${i + 1}`,
    }));

    await Promise.all(day1Rows.map((r) => log.append(r)));
    now = new Date(2026, 4, 7, 12, 0, 0);
    await Promise.all(day2Rows.map((r) => log.append(r)));

    const dir = join(tmp, '.deskwork', 'chat-log');
    const day1Path = join(dir, '2026-05-06.jsonl');
    const day2Path = join(dir, '2026-05-07.jsonl');
    const day1Lines = readFileSync(day1Path, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0);
    const day2Lines = readFileSync(day2Path, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0);
    expect(day1Lines.length).toBe(5);
    expect(day2Lines.length).toBe(5);
  });
});

describe('ChatLog — loadHistory input validation', () => {
  it('throws when limit is 0', async () => {
    const log = makeLog();
    await expect(log.loadHistory({ limit: 0 })).rejects.toThrow(/limit/);
  });

  it('throws when limit is negative', async () => {
    const log = makeLog();
    await expect(log.loadHistory({ limit: -1 })).rejects.toThrow(/limit/);
  });

  it('throws when limit is non-integer', async () => {
    const log = makeLog();
    await expect(log.loadHistory({ limit: 1.5 })).rejects.toThrow(/limit/);
  });

  it('throws when sinceSeq is negative', async () => {
    const log = makeLog();
    await expect(log.loadHistory({ sinceSeq: -1 })).rejects.toThrow(/sinceSeq/);
  });

  it('accepts no opts and empty opts', async () => {
    const log = makeLog();
    await expect(log.loadHistory()).resolves.toEqual([]);
    await expect(log.loadHistory({})).resolves.toEqual([]);
  });
});

describe('ChatLog — empty/missing file', () => {
  it('loadHistory returns [] when the file does not exist', async () => {
    const log = makeLog();
    const got = await log.loadHistory();
    expect(got).toEqual([]);
  });

  it('loadHistory tolerates blank lines in the file', async () => {
    const log = makeLog();
    await log.append({ seq: 1, ts: 100, role: 'operator', text: 'one' });
    // Inject a blank line directly to ensure the parser skips it.
    const dir = join(tmp, '.deskwork', 'chat-log');
    const day = (() => {
      const d = new Date();
      const yyyy = d.getFullYear().toString().padStart(4, '0');
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();
    const path = join(dir, `${day}.jsonl`);
    writeFileSync(path, '\n\n', { flag: 'a' });
    await log.append({ seq: 2, ts: 200, role: 'operator', text: 'two' });
    const got = await log.loadHistory();
    expect(got.length).toBe(2);
  });
});
