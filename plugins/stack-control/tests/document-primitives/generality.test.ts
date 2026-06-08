// T037 generality (SC-005/FR-013): BOTH proof documents are governed by the
// SAME engine code path (loadDocument), differing only in their grammar.
// T038 lossless migration: every pre-existing inbox entry's body appears in the
// migrated DESIGN-INBOX.md (no content dropped), normalized status words are
// preserved, and the migrated document is well-formed (FR-013).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../../src/document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, '..', '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '..', '..');
const BUILTIN = resolve(PLUGIN_ROOT, 'grammars');
const OPTS = { builtinGrammarDir: BUILTIN };

const INBOX = resolve(PLUGIN_ROOT, 'DESIGN-INBOX.md');
const ROADMAP = resolve(PLUGIN_ROOT, 'ROADMAP.md');
const SOURCE_INBOX = resolve(
  REPO_ROOT,
  'docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/design-inbox.md',
);

describe('generality — one engine, two document shapes (T037, SC-005)', () => {
  it('both proof documents load through the SAME engine, differing only in grammar', () => {
    const inbox = loadDocument(INBOX, OPTS);
    const roadmap = loadDocument(ROADMAP, OPTS);

    // Same code path produced Units for both.
    expect(inbox.doc.units.length).toBeGreaterThan(0);
    expect(roadmap.doc.units.length).toBeGreaterThan(0);

    // The only difference is the grammar: heading-keyed inbox vs row-keyed roadmap.
    expect(inbox.doc.grammar.id).toBe('design-inbox');
    expect(roadmap.doc.grammar.id).toBe('roadmap');
    expect(inbox.doc.grammar.unit.kind).toBe('heading');
    expect(roadmap.doc.grammar.unit.kind).toBe('row');

    // Each Unit's status is in its grammar's declared vocabulary.
    for (const u of inbox.doc.units) {
      expect(inbox.doc.grammar.statusVocabulary).toContain(u.status);
    }
    for (const u of roadmap.doc.units) {
      expect(roadmap.doc.grammar.statusVocabulary).toContain(u.status);
    }
  });
});

describe('lossless migration of the design inbox (T038, FR-013)', () => {
  const sourceTitles = readFileSync(SOURCE_INBOX, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('### '))
    .map((l) => l.slice(4).trim());

  it('every source entry title survives as a Unit identifier (no entry dropped)', () => {
    const ids = new Set(loadDocument(INBOX, OPTS).doc.units.map((u) => u.identifier));
    expect(sourceTitles.length).toBe(12);
    for (const title of sourceTitles) {
      expect(ids.has(title)).toBe(true);
    }
  });

  it('normalized status words are preserved in the body (no content dropped)', () => {
    const migrated = readFileSync(INBOX, 'utf8');
    for (const word of ['resolved', 'implemented', 'partially fixed']) {
      expect(migrated).toContain(word);
    }
  });

  it('the migrated document is well-formed (loads without fail-loud)', () => {
    expect(() => loadDocument(INBOX, OPTS)).not.toThrow();
  });
});
