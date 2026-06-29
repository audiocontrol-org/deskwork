// 033 T021 (US3) — the durable execution ledger (data-model ExecutionLedger; FR-010/011).
//
// RED-first: append-only per-task records {id, tierLabel, model, commitRange, reviewClean}
// give resume safety (a resumed/compacted run does not re-dispatch a task already recorded
// complete — SC-005) and make the per-task tier/model observable afterward (SC-004). The
// ledger is anchored in the installation working-file set (installation-anchor invariant).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLedgerEntry, readLedgerEntries, completedTaskIds, ledgerPathFor } from '../../execute/ledger.js';
import type { LedgerEntry } from '../../execute/ledger.js';

const ENTRY: LedgerEntry = { id: 'T001', tierLabel: 'fast', model: 'haiku', commitRange: 'abc1234..def5678', reviewClean: true };

describe('execution ledger (033 T021)', () => {
  let work: string;
  let path: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'stackctl-ledger-'));
    path = join(work, 'ledger.jsonl');
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it('appends an entry and reads it back (tier + model observable afterward — SC-004)', () => {
    appendLedgerEntry(path, ENTRY);
    expect(readLedgerEntries(path)).toEqual([ENTRY]);
  });

  it('is append-only across multiple records', () => {
    appendLedgerEntry(path, ENTRY);
    appendLedgerEntry(path, { id: 'T002', tierLabel: 'powerful', model: 'opus', commitRange: 'def5678..0099aab', reviewClean: true });
    const entries = readLedgerEntries(path);
    expect(entries.map((e) => e.id)).toEqual(['T001', 'T002']);
  });

  it('creates the ledger directory on first append (no pre-existing dir required)', () => {
    const nested = join(work, 'a', 'b', 'ledger.jsonl');
    appendLedgerEntry(nested, ENTRY);
    expect(existsSync(nested)).toBe(true);
  });

  it('reports already-complete ids so a resumed run does not re-dispatch them (SC-005)', () => {
    appendLedgerEntry(path, ENTRY);
    appendLedgerEntry(path, { id: 'T002', tierLabel: 'balanced', model: 'sonnet', commitRange: 'x..y', reviewClean: true });
    const done = completedTaskIds(path);
    expect(done.has('T001')).toBe(true);
    expect(done.has('T002')).toBe(true);
    expect(done.has('T999')).toBe(false);
  });

  it('returns an empty set / list for an absent ledger (clean first run)', () => {
    expect(readLedgerEntries(path)).toEqual([]);
    expect(completedTaskIds(path).size).toBe(0);
  });

  it('anchors the ledger path under the installation working-file set', () => {
    const p = ledgerPathFor({ root: '/inst', baseDir: '.stack-control' }, '033-model-sized-dispatch');
    expect(p).toBe(join('/inst', '.stack-control', 'execute', '033-model-sized-dispatch.ledger.jsonl'));
  });
});
