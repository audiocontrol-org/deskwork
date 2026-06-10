// T003 (RED-first, Foundational, 007) — the shared validate-and-commit helper
// (mirrors roadmap/mutations.ts:commit). A candidate that fails whole-document
// validation throws DocumentModelError and leaves the file byte-for-byte
// unchanged (zero-write); a valid candidate writes atomically only on apply;
// dry-run writes nothing. Constitution Principle I + V (fail-loud, no partial
// write).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { commit } from '../../src/inbox/mutations.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { INBOX_OPTS, tmpCopy } from './helpers.js';

const VALID_ENTRY = '\n### A brand new idea\n- **Status:** **captured**\n';
// Re-uses an existing identifier from the fixture → identifier-uniqueness fails.
const DUP_ENTRY = '\n### Try a TUI inbox view\n- **Status:** **captured**\n';

describe('inbox commit helper (T003)', () => {
  it('writes the candidate atomically on apply=true', () => {
    const docPath = tmpCopy('sample-inbox');
    const candidate = readFileSync(docPath, 'utf8') + VALID_ENTRY;
    const result = commit(docPath, candidate, INBOX_OPTS, true);
    expect(result.applied).toBe(true);
    expect(result.source).toBe(candidate);
    expect(readFileSync(docPath, 'utf8')).toBe(candidate);
  });

  it('dry-run (apply=false) returns the candidate but writes nothing', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const candidate = before + VALID_ENTRY;
    const result = commit(docPath, candidate, INBOX_OPTS, false);
    expect(result.applied).toBe(false);
    expect(result.source).toBe(candidate);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an invalid candidate (duplicate identifier) — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const candidate = before + DUP_ENTRY;
    expect(() => commit(docPath, candidate, INBOX_OPTS, true)).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
