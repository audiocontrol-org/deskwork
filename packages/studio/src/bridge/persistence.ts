/**
 * JSONL append-only chat log for the studio ↔ Claude Code bridge.
 *
 * - Each ChatLogRow is one JSON line in <projectRoot>/.deskwork/chat-log/<YYYY-MM-DD>.jsonl
 * - Per-message writes use `appendFile` with `flag: 'a'`. The day
 *   "rotation" is just a path-resolution change — `appendFile`
 *   creates the new day's file on first write, so no explicit
 *   atomic rename is needed; the rotation is bookkeeping for the
 *   path resolver.
 * - On replay, monotonic `seq` and non-decreasing `ts` invariants
 *   are checked. Violations emit a `corruption-marker` row inline
 *   without dropping the bad rows — the operator surfaces decide
 *   how to render the marker.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatLogRow, CorruptionMarker } from './types.ts';

interface ChatLogOptions {
  readonly projectRoot: string;
  readonly dateProvider?: () => Date;
}

interface LoadHistoryOptions {
  readonly sinceSeq?: number;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 100;

function rowSeq(row: ChatLogRow): number | null {
  if ('role' in row && row.role === 'operator') return row.seq;
  if ('kind' in row && (row.kind === 'tool-use' || row.kind === 'prose')) {
    return row.seq;
  }
  return null;
}

function rowTs(row: ChatLogRow): number {
  return row.ts;
}

export class ChatLog {
  private readonly projectRoot: string;
  private readonly dateProvider: () => Date;
  private currentDate: string | null = null;
  private directoryEnsured = false;

  constructor(opts: ChatLogOptions) {
    this.projectRoot = opts.projectRoot;
    this.dateProvider = opts.dateProvider ?? (() => new Date());
  }

  async append(row: ChatLogRow): Promise<void> {
    // Per-message append uses appendFile with flag 'a'. Day rotation
    // is internal bookkeeping — the new day's file is created lazily
    // by the first appendFile call against its path.
    const path = await this.resolveAndEnsurePath();
    const line = `${JSON.stringify(row)}\n`;
    await appendFile(path, line, { flag: 'a' });
  }

  async loadHistory(opts: LoadHistoryOptions = {}): Promise<ChatLogRow[]> {
    const sinceSeq = opts.sinceSeq ?? 0;
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const path = this.currentLogPath();
    if (!existsSync(path)) return [];

    const raw = await readFile(path, 'utf8');
    const lines = raw.split('\n');
    const parsed: ChatLogRow[] = [];
    for (const line of lines) {
      if (line.length === 0) continue;
      const candidate = parseRow(line);
      if (candidate === null) continue;
      parsed.push(candidate);
    }

    const withMarkers = injectCorruptionMarkers(parsed);

    const filtered: ChatLogRow[] = [];
    for (const row of withMarkers) {
      const seq = rowSeq(row);
      if (seq !== null && seq <= sinceSeq) continue;
      filtered.push(row);
      if (filtered.length >= limit) break;
    }
    return filtered;
  }

  private currentLogPath(): string {
    const date = this.currentDateString();
    return join(this.projectRoot, '.deskwork', 'chat-log', `${date}.jsonl`);
  }

  private currentDateString(): string {
    const d = this.dateProvider();
    const yyyy = d.getFullYear().toString().padStart(4, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private async resolveAndEnsurePath(): Promise<string> {
    const date = this.currentDateString();
    if (date !== this.currentDate) {
      this.currentDate = date;
      this.directoryEnsured = false;
    }
    if (!this.directoryEnsured) {
      const dir = join(this.projectRoot, '.deskwork', 'chat-log');
      await mkdir(dir, { recursive: true });
      this.directoryEnsured = true;
    }
    return this.currentLogPath();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseRow(line: string): ChatLogRow | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const obj = value;

  const kind = obj['kind'];
  const role = obj['role'];

  if (role === 'operator') {
    if (typeof obj['seq'] !== 'number') return null;
    if (typeof obj['ts'] !== 'number') return null;
    if (typeof obj['text'] !== 'string') return null;
    const contextRef = obj['contextRef'];
    if (contextRef !== undefined && typeof contextRef !== 'string') return null;
    if (contextRef === undefined) {
      return {
        seq: obj['seq'],
        ts: obj['ts'],
        role: 'operator',
        text: obj['text'],
      };
    }
    return {
      seq: obj['seq'],
      ts: obj['ts'],
      role: 'operator',
      text: obj['text'],
      contextRef,
    };
  }

  if (kind === 'tool-use') {
    if (typeof obj['seq'] !== 'number') return null;
    if (typeof obj['ts'] !== 'number') return null;
    if (typeof obj['tool'] !== 'string') return null;
    const status = obj['status'];
    if (
      status !== undefined &&
      status !== 'starting' &&
      status !== 'done' &&
      status !== 'error'
    ) {
      return null;
    }
    const base = {
      kind: 'tool-use' as const,
      seq: obj['seq'],
      ts: obj['ts'],
      tool: obj['tool'],
      args: obj['args'],
    };
    const withResult =
      'result' in obj ? { ...base, result: obj['result'] } : base;
    return status === undefined ? withResult : { ...withResult, status };
  }

  if (kind === 'prose') {
    if (typeof obj['seq'] !== 'number') return null;
    if (typeof obj['ts'] !== 'number') return null;
    if (typeof obj['text'] !== 'string') return null;
    return {
      kind: 'prose',
      seq: obj['seq'],
      ts: obj['ts'],
      text: obj['text'],
    };
  }

  if (kind === 'corruption-marker') {
    if (typeof obj['from'] !== 'number') return null;
    if (typeof obj['to'] !== 'number') return null;
    if (typeof obj['ts'] !== 'number') return null;
    return {
      kind: 'corruption-marker',
      from: obj['from'],
      to: obj['to'],
      ts: obj['ts'],
    };
  }

  return null;
}

function injectCorruptionMarkers(rows: ChatLogRow[]): ChatLogRow[] {
  const out: ChatLogRow[] = [];
  let prevSeq: number | null = null;
  let prevTs: number | null = null;

  for (const row of rows) {
    const seq = rowSeq(row);
    const ts = rowTs(row);

    if (seq !== null && prevSeq !== null) {
      const seqGap = seq !== prevSeq + 1;
      const tsBackwards = prevTs !== null && ts < prevTs;
      if (seqGap || tsBackwards) {
        const marker: CorruptionMarker = {
          kind: 'corruption-marker',
          from: prevSeq,
          to: seq,
          ts,
        };
        out.push(marker);
      }
    }

    out.push(row);
    if (seq !== null) prevSeq = seq;
    prevTs = ts;
  }

  return out;
}
