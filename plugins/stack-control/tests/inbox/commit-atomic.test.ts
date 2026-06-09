// AUDIT-BARRAGE-codex-01 (RED-first) — commitCandidate must write atomically
// (write-temp-then-rename in the same directory), never leaving the live
// governed document torn AND never leaving a sibling temp artifact behind.
// Atomicity itself is hard to fault-inject in a stable test, so we lock the
// OBSERVABLE guarantees the fix provides: after apply=true the doc equals the
// candidate and the directory holds ONLY the doc (no `.tmp` residue); a dry-run
// writes nothing and likewise leaves no temp file. Constitution Principle V
// (no partial / torn write).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { commit } from '../../src/inbox/mutations.js';
import { INBOX_OPTS, tmpCopy } from './helpers.js';

const VALID_ENTRY = '\n### An atomic-write idea\n- **Status:** **captured**\n';

describe('commitCandidate atomic-write contract (AUDIT-BARRAGE-codex-01)', () => {
  it('apply=true: the live doc is replaced via rename (its inode changes), not written in place', () => {
    const docPath = tmpCopy('sample-inbox');
    const candidate = readFileSync(docPath, 'utf8') + VALID_ENTRY;

    // A temp-then-rename atomic replace points the path at a NEW inode; an
    // in-place writeFileSync(docPath, …) would keep the original inode. This is
    // a stable, ESM-safe proof of the atomic write (vi.spyOn on a node:fs named
    // export is impossible in ESM — "module namespace is not configurable").
    const inodeBefore = statSync(docPath).ino;
    commit(docPath, candidate, INBOX_OPTS, true);
    const inodeAfter = statSync(docPath).ino;

    expect(inodeAfter).not.toBe(inodeBefore);
    expect(readFileSync(docPath, 'utf8')).toBe(candidate);
  });

  it('apply=true: doc equals candidate AND no temp artifact remains in the dir', () => {
    const docPath = tmpCopy('sample-inbox');
    const candidate = readFileSync(docPath, 'utf8') + VALID_ENTRY;
    const result = commit(docPath, candidate, INBOX_OPTS, true);
    expect(result.applied).toBe(true);
    expect(readFileSync(docPath, 'utf8')).toBe(candidate);

    // The isolated tmpCopy dir holds exactly the one governed document; a
    // write-temp-then-rename that leaks its scratch file would show up here.
    const entries = readdirSync(dirname(docPath));
    expect(entries).toEqual(['DESIGN-INBOX.md']);
    expect(entries.some((e) => e.includes('.tmp'))).toBe(false);
  });

  it('dry-run (apply=false): writes nothing and leaves no temp file', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const candidate = before + VALID_ENTRY;
    const result = commit(docPath, candidate, INBOX_OPTS, false);
    expect(result.applied).toBe(false);
    expect(readFileSync(docPath, 'utf8')).toBe(before);

    const entries = readdirSync(dirname(docPath));
    expect(entries).toEqual(['DESIGN-INBOX.md']);
  });
});
