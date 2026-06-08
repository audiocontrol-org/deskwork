// T037 generality (SC-005/FR-013): BOTH proof documents are governed by the
// SAME engine code path (loadDocument), differing only in their grammar.
// T038 lossless migration: the governed DESIGN-INBOX.md is the SINGLE source of
// truth (the ungoverned docs-tree source was retired to a pointer 2026-06-08, so
// this test no longer reads it). Assert the historically-migrated entries survive
// as Units (no content dropped), normalized status words are preserved, and the
// document is well-formed (FR-013).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../../src/document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, '..', '..');
const BUILTIN = resolve(PLUGIN_ROOT, 'grammars');
const OPTS = { builtinGrammarDir: BUILTIN };

const INBOX = resolve(PLUGIN_ROOT, 'DESIGN-INBOX.md');
// The live ROADMAP.md migrated to the heading-keyed `roadmap` grammar in 006
// (US6), so the row-keyed half of this "two shapes" proof uses a committed
// row-keyed fixture on the preserved `roadmap-legacy` grammar instead.
const ROW_ROADMAP = resolve(here, 'fixtures', 'row-roadmap.md');

// The 12 entries migrated into the governed inbox at 005 (FR-013), frozen here
// as the no-content-dropped baseline. The former ungoverned source file was
// retired to a pointer (2026-06-08, single-source-of-truth), so the guard reads
// this frozen set rather than a live source file. Later entries append on top.
const MIGRATED_TITLES = [
  'Audit-barrage as a spec-definition governance step',
  'SEDA (staged queues) as the execution-engine architecture',
  'Low-friction out-of-sequence capture as a first-class capability',
  'Execute audit-fixes in an isolated, minimal context (fresh-context fix dispatch)',
  "Clone detector doesn't cover shell scripts — bash duplication is invisible to scope-discovery",
  'Install-drift: nothing checks the .specify install copy against its source',
  'Spec-authoring skill — consolidate "how to write a spec" guidance (DEFINE-phase tooling)',
  "Archive skill to keep live documents lean (port dw-lifecycle's workplan-archive capability)",
  'Plugin-local roadmap with a live queue of in-flight and planned features',
  'Roadmap protocol — keep the roadmap live, crisp, and up-to-date',
  'Relationship between the idea bucket (design-inbox) and the roadmap',
  'Roadmap skill to canonize the roadmap protocol',
];

describe('generality — one engine, two document shapes (T037, SC-005)', () => {
  it('both proof documents load through the SAME engine, differing only in grammar', () => {
    const inbox = loadDocument(INBOX, OPTS);
    const roadmap = loadDocument(ROW_ROADMAP, OPTS);

    // Same code path produced Units for both.
    expect(inbox.doc.units.length).toBeGreaterThan(0);
    expect(roadmap.doc.units.length).toBeGreaterThan(0);

    // The only difference is the grammar: heading-keyed inbox vs row-keyed
    // roadmap-legacy. (The live ROADMAP.md is now heading-keyed `roadmap` after
    // the 006 US6 migration; the row-keyed proof uses the committed fixture.)
    expect(inbox.doc.grammar.id).toBe('design-inbox');
    expect(roadmap.doc.grammar.id).toBe('roadmap-legacy');
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
  it('every migrated entry survives as a Unit identifier in the governed inbox (no entry dropped)', () => {
    const ids = new Set(loadDocument(INBOX, OPTS).doc.units.map((u) => u.identifier));
    expect(MIGRATED_TITLES.length).toBe(12);
    for (const title of MIGRATED_TITLES) {
      expect(ids.has(title)).toBe(true);
    }
  });

  it('normalized status words are preserved in the body (no content dropped)', () => {
    const migrated = readFileSync(INBOX, 'utf8');
    for (const word of ['resolved', 'implemented', 'partially fixed']) {
      expect(migrated).toContain(word);
    }
  });

  it('the governed inbox is well-formed (loads without fail-loud)', () => {
    expect(() => loadDocument(INBOX, OPTS)).not.toThrow();
  });
});
