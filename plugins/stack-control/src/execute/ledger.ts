// 033 T022 (US3) — the durable execution ledger (data-model ExecutionLedger; FR-010/011).
//
// Append-only JSONL of per-task completion records. SDD's hard-won lesson — controllers
// that lost their place re-dispatched entire completed task sequences (the single most
// expensive failure observed) — makes this ledger NON-optional. It gives:
//   - resume safety (SC-005): `completedTaskIds` tells the controller which tasks NOT to
//     re-dispatch after an interruption/compaction;
//   - observability (SC-004/FR-011): each record carries the declared tier + resolved
//     model the subagent was dispatched with, plus the commit range for recovery.
//
// Anchored in the installation working-file set (installation-anchor invariant) — the
// ledger lives under `<root>/<baseDir>/execute/`, never in a cross-plugin location.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isPlainObject } from '../scope-discovery/util/typeguards.js';

/** One completed-task record (data-model ExecutionLedger entry). */
export interface LedgerEntry {
  readonly id: string;
  readonly tierLabel: string;
  readonly model: string;
  /** `<base7>..<head7>` of the task's commits (recovery map, per SDD). */
  readonly commitRange: string;
  /** The task-review verdict (the adopted discipline's gate). */
  readonly reviewClean: boolean;
}

/** Minimal installation shape the ledger path needs (installation-anchor invariant). */
export interface LedgerAnchor {
  readonly root: string;
  /** Internal-store base; defaults to `.stack-control` (the config default). */
  readonly baseDir?: string;
}

/** Resolve the per-feature ledger path under the installation working-file set. */
export function ledgerPathFor(anchor: LedgerAnchor, specName: string): string {
  const base = anchor.baseDir ?? '.stack-control';
  return join(anchor.root, base, 'execute', `${specName}.ledger.jsonl`);
}

/** Append one completion record (creates the ledger directory on first write). */
export function appendLedgerEntry(path: string, entry: LedgerEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
}

/** Read every ledger record (empty list for an absent ledger — a clean first run). */
export function readLedgerEntries(path: string): readonly LedgerEntry[] {
  if (!existsSync(path)) return [];
  const body = readFileSync(path, 'utf8');
  const entries: LedgerEntry[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    entries.push(parseEntry(trimmed, path));
  }
  return entries;
}

/** The set of task ids already recorded complete — a resumed run skips these (SC-005). */
export function completedTaskIds(path: string): ReadonlySet<string> {
  return new Set(readLedgerEntries(path).map((e) => e.id));
}

/** Narrow a JSONL line to a LedgerEntry, failing loud on a malformed record (no `as`). */
function parseEntry(line: string, path: string): LedgerEntry {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (err) {
    throw new Error(`ledger ${path}: malformed JSONL line: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isPlainObject(raw)) throw new Error(`ledger ${path}: a record is not an object`);
  const { id, tierLabel, model, commitRange, reviewClean } = raw;
  if (typeof id !== 'string' || typeof tierLabel !== 'string' || typeof model !== 'string') {
    throw new Error(`ledger ${path}: a record has a non-string id/tierLabel/model`);
  }
  if (typeof commitRange !== 'string' || typeof reviewClean !== 'boolean') {
    throw new Error(`ledger ${path}: a record has a non-string commitRange or non-boolean reviewClean`);
  }
  return { id, tierLabel, model, commitRange, reviewClean };
}
