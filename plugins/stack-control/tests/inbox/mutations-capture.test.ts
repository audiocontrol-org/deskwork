// T007 (RED-first, US1, 007) — mutations.capture: append a `captured` entry in
// one move; the whole doc re-validates before any write; a duplicate identifier
// or empty idea ⇒ zero-write (byte-for-byte unchanged); dry-run writes nothing;
// FR-006 — capturing one thread leaves every pre-existing entry byte-identical.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { capture } from '../../src/inbox/mutations.js';
import { loadDocument } from '../../src/document-model/document.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { INBOX_OPTS, tmpCopy } from './helpers.js';

describe('mutations.capture (T007)', () => {
  it('appends a captured entry in one move (--apply) and the doc still validates', () => {
    const docPath = tmpCopy('sample-inbox');
    capture(
      docPath,
      { title: 'Spec-link autocompletion', idea: 'Autocomplete roadmap ids in promote --to' },
      INBOX_OPTS,
      true,
    );
    const { doc } = loadDocument(docPath, INBOX_OPTS);
    const unit = doc.units.find((u) => u.identifier === 'Spec-link autocompletion');
    expect(unit).toBeDefined();
    expect(unit!.status).toBe('captured');
  });

  it('records the optional structured body fields when supplied', () => {
    const docPath = tmpCopy('sample-inbox');
    capture(
      docPath,
      {
        title: 'Inbox search',
        idea: 'Full-text search over entries',
        surfaced: '2026-06-08, scoping the verb',
        context: 'list is unfiltered',
        home: 'multi/control-plane-frontend',
      },
      INBOX_OPTS,
      true,
    );
    const src = readFileSync(docPath, 'utf8');
    expect(src).toContain('### Inbox search');
    expect(src).toContain('Full-text search over entries');
    expect(src).toContain('2026-06-08, scoping the verb');
    expect(src).toContain('list is unfiltered');
    expect(src).toContain('multi/control-plane-frontend');
  });

  it('refuses a duplicate identifier atomically — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      capture(docPath, { title: 'Try a TUI inbox view', idea: 'dup' }, INBOX_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an empty / whitespace-only idea — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() => capture(docPath, { title: 'Empty idea', idea: '   ' }, INBOX_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an empty / whitespace-only title — throws + zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    expect(() => capture(docPath, { title: '  ', idea: 'x' }, INBOX_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('dry-run (apply=false) returns the candidate but writes nothing', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const result = capture(docPath, { title: 'Dry idea', idea: 'x' }, INBOX_OPTS, false);
    expect(result.applied).toBe(false);
    expect(result.source).toContain('### Dry idea');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('FR-006 — capturing one thread leaves every pre-existing entry byte-identical', () => {
    const docPath = tmpCopy('sample-inbox');
    capture(docPath, { title: 'A fourth thread', idea: 'held alongside the others' }, INBOX_OPTS, true);
    const src = readFileSync(docPath, 'utf8');
    // A verbatim slice of an untouched pre-existing entry must still be present.
    expect(src).toContain(
      '### Audit-barrage cost telemetry\n- **Surfaced:** 2026-06-08, mid spec-governance loop.',
    );
    // The terminal entry is undisturbed too.
    expect(src).toContain('- **Status:** **promoted** → `stack-control-roadmap.md` `design:gap/inbox-pinning`');
    const { doc } = loadDocument(docPath, INBOX_OPTS);
    expect(doc.units.map((u) => u.identifier)).toContain('Try a TUI inbox view');
    expect(doc.units.map((u) => u.identifier)).toContain('A fourth thread');
    expect(doc.units).toHaveLength(4);
  });
});
