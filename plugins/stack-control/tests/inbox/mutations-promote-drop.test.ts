// T012 (RED-first, US2, 007) — mutations.promote / mutations.drop: advance-style
// status rewrite of the design-inbox `**Status:**` bullet + a recorded body line.
// promote sets `promoted` + records the target reference; drop sets `dropped` +
// records the reason. Absent or already-terminal entry → throws + zero write.
// FR-014/FR-012: promote ONLY records the target reference — it does NOT create
// or validate the target artifact (the ref need not exist anywhere).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { promote, drop } from '../../src/inbox/mutations.js';
import { loadDocument } from '../../src/document-model/document.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { INBOX_OPTS, tmpCopy } from './helpers.js';

function statusOf(docPath: string, id: string): string {
  const { doc } = loadDocument(docPath, INBOX_OPTS);
  return doc.units.find((u) => u.identifier === id)!.status;
}

describe('mutations.promote (T012)', () => {
  it('sets status promoted and records the target reference (--apply)', () => {
    const docPath = tmpCopy('sample-inbox');
    promote(docPath, 'Try a TUI inbox view', 'multi:gap/inbox-tui', INBOX_OPTS, true);
    expect(statusOf(docPath, 'Try a TUI inbox view')).toBe('promoted');
    expect(readFileSync(docPath, 'utf8')).toContain('multi:gap/inbox-tui');
  });

  it('FR-014 — records an arbitrary target ref without creating/validating it', () => {
    const docPath = tmpCopy('sample-inbox');
    // A target reference that exists nowhere — promote must still succeed,
    // recording it (record-and-reuse; creation is a separate step).
    promote(docPath, 'Try a TUI inbox view', 'does:not/exist-anywhere', INBOX_OPTS, true);
    expect(statusOf(docPath, 'Try a TUI inbox view')).toBe('promoted');
    expect(readFileSync(docPath, 'utf8')).toContain('does:not/exist-anywhere');
  });

  it('refuses an absent entry — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() => promote(docPath, 'No such entry', 'x', INBOX_OPTS, true)).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an already-terminal entry — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    // 'Inbox entry pinning' is already promoted in the fixture.
    expect(() => promote(docPath, 'Inbox entry pinning', 'x', INBOX_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('dry-run (apply=false) writes nothing', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = promote(docPath, 'Try a TUI inbox view', 'multi:gap/x', INBOX_OPTS, false);
    expect(r.applied).toBe(false);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});

describe('mutations.drop (T012)', () => {
  it('sets status dropped and records the reason (--apply)', () => {
    const docPath = tmpCopy('sample-inbox');
    drop(docPath, 'Audit-barrage cost telemetry', 'superseded by the diminishing-returns log', INBOX_OPTS, true);
    expect(statusOf(docPath, 'Audit-barrage cost telemetry')).toBe('dropped');
    expect(readFileSync(docPath, 'utf8')).toContain('superseded by the diminishing-returns log');
  });

  it('refuses an absent entry — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() => drop(docPath, 'No such entry', 'x', INBOX_OPTS, true)).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an already-terminal entry — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() => drop(docPath, 'Inbox entry pinning', 'x', INBOX_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
