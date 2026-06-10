// T012 (RED-first, US2, 007) — mutations.promote / mutations.drop: advance-style
// status rewrite of the design-inbox `**Status:**` bullet + a recorded body line.
// promote sets `promoted` + records the target reference; drop sets `dropped` +
// records the reason. Absent or already-terminal entry → throws + zero write.
// FR-014/FR-012: promote ONLY records the target reference — it does NOT create
// or validate the target artifact (the ref need not exist anywhere).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { capture, promote, drop } from '../../src/inbox/mutations.js';
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

describe('mutations status-line locator anchoring (AUDIT-BARRAGE-claude-01)', () => {
  // The status locator must anchor to a LEADING list bullet — a body field whose
  // free text contains the literal substring `**Status:**` (a natural single-line
  // input for an inbox about its own tooling) must NOT be clobbered by transition.
  it('promote rewrites the real status bullet, not an idea field containing the literal `**Status:**`', () => {
    const docPath = tmpCopy('sample-inbox');
    // `**Status:**` appears in the idea prose but is NOT a leading status bullet.
    // (The grammar's own statusOf ignores it because it is not followed by a
    //  status word; the bug under test is the transition LOCATOR matching it.)
    const idea = 'Sort inbox by **Status:**, then by date';
    capture(docPath, { title: 'Status filter idea', idea }, INBOX_OPTS, true);
    promote(docPath, 'Status filter idea', 'multi:gap/inbox-status-filter', INBOX_OPTS, true);
    // The real status became promoted...
    expect(statusOf(docPath, 'Status filter idea')).toBe('promoted');
    // ...and the idea prose is still present verbatim (it was NOT overwritten).
    const src = readFileSync(docPath, 'utf8');
    expect(src).toContain(`- **Idea:** ${idea}`);
    expect(src).toContain('multi:gap/inbox-status-filter');
  });
});

describe('mutations triage newline-injection rejection (AUDIT-BARRAGE-claude-02 + codex-02)', () => {
  const INJECT = '\n### Injected\n- **Status:** **captured**';

  it('promote --to containing a newline throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      promote(docPath, 'Try a TUI inbox view', `multi:gap/x${INJECT}`, INBOX_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('drop --reason containing a newline throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      drop(docPath, 'Try a TUI inbox view', `superseded${INJECT}`, INBOX_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('promote --to containing a carriage return throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      promote(docPath, 'Try a TUI inbox view', 'multi:gap/x\rinjected', INBOX_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
