// AUDIT-20260608-53 (MEDIUM, defensive consistency) — `runUnarchive` must assert
// that the lifted Unit's PARSED identity matches the requested `--id` before any
// write. `locateInArchive` finds the archived content by a RAW match (heading text
// or the identifier-column cell === opts.id) and never runs the grammar's
// identifier production; `parseLifted` then re-parses that content THROUGH the
// grammar to recover the Unit. The two derive identity independently; nothing
// bridges them. If they ever disagree, unarchive would write a Unit back under an
// UNEXPECTED identity (and drop the ledger entry for the requested id) — a silent
// identity drift. This test pins the defensive guard.
//
// Why the divergence is exercised against the guard directly (not through a
// crafted grammar): with ANY self-consistent grammar the drift is unreachable
// through the public `runUnarchive` flow, and that is provable, not an oversight —
//
//   - HEADING-keyed: the identifier IS the heading text. `locateInArchive` matches
//     the heading whose `text === opts.id`; `parseLifted` returns `h.text` as the
//     identifier. They are the SAME string by construction. A grammar whose
//     production transformed the heading text would break locate itself (locate
//     would no longer find the marker), so no opts.id reaches `parseLifted`.
//   - ROW-keyed: `archive` writes the RAW source row as the archived body and
//     stores the PARSED identifier in the ledger. `runUnarchive` first requires a
//     ledger entry for `opts.id` (so opts.id must equal the parsed identifier),
//     THEN `locateInArchive` requires `cells[idCol] === opts.id` on the raw
//     archive row (so opts.id must equal the raw column cell). Both gates pass
//     only when raw === parsed — i.e. the grammar is self-consistent — at which
//     point `parseLifted` necessarily re-derives that same value.
//
// So the guard is genuinely defensive: it closes the gap between "located by id"
// and "parsed identity" for any FUTURE grammar/refactor that could break the
// invariant the two earlier gates currently rely on. The first test forces a
// lifted Unit whose identity differs from the requested id and asserts the guard
// fails loud (naming both ids) with zero writes; the round-trip test confirms the
// guard is a no-op when identities agree (the self-consistent built-in grammar).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import {
  runUnarchive,
  assertLiftedIdentityMatches,
} from '../../src/document-model/unarchive-engine.js';
import { loadDocument } from '../../src/document-model/document.js';
import { readLedger } from '../../src/document-model/ledger.js';
import { DocumentModelError, type Unit } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const NOW = '2026-06-08T00:00:00.000Z';
const OPTS = { now: NOW, builtinGrammarDir: BUILTIN };

function tmpDoc(body: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'unarchive-identity-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

describe('unarchive identity-match guard (AUDIT-20260608-53)', () => {
  it('fails loud naming BOTH ids when the lifted identity differs from the requested id', () => {
    // Force the divergent condition the guard exists for: a lifted Unit parsed to
    // an identity that does NOT equal the id used to locate it.
    const lifted: Unit = {
      identifier: 'parsed-impl/x',
      status: 'shipped',
      orderValue: 'impl',
      span: { startLine: 1, endLine: 1 },
      body: '| impl/x | shipped |',
    };

    let message = '';
    expect(() => assertLiftedIdentityMatches('impl/x', lifted)).toThrow(DocumentModelError);
    try {
      assertLiftedIdentityMatches('impl/x', lifted);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('impl/x'); // the requested id
    expect(message).toContain('parsed-impl/x'); // the parsed (divergent) identity
  });

  it('is a no-op when the lifted identity matches the requested id', () => {
    const lifted: Unit = {
      identifier: 'impl/x',
      status: 'shipped',
      orderValue: 'impl',
      span: { startLine: 1, endLine: 1 },
      body: '| impl/x | shipped |',
    };
    expect(() => assertLiftedIdentityMatches('impl/x', lifted)).not.toThrow();
  });

  it('the self-consistent built-in roadmap grammar still round-trips (guard never fires in the happy path)', () => {
    const ROADMAP = [
      '---',
      'doc-grammar: roadmap',
      '---',
      '',
      '# Roadmap',
      '',
      '| Codename | Feature | Scope | Status |',
      '|---|---|---|---|',
      '| design/insight-capture | Capture | one move | planned |',
      '| impl/execution-engine | Engine | fan-out | shipped |',
      '',
    ].join('\n');
    const { docPath, archivePath } = tmpDoc(ROADMAP, 'ROADMAP.md');

    runArchive(docPath, { apply: true, ...OPTS }); // archives impl/execution-engine (shipped)
    expect(loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier)).toEqual([
      'design/insight-capture',
    ]);

    // Identities agree (roadmap returns the marker verbatim) → no throw, normal
    // round-trip, ledger emptied.
    expect(() =>
      runUnarchive(docPath, { id: 'impl/execution-engine', apply: true, ...OPTS }),
    ).not.toThrow();
    expect(existsSync(docPath)).toBe(true);
    expect(loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier)).toEqual([
      'design/insight-capture',
      'impl/execution-engine',
    ]);
    expect(readLedger(readFileSync(archivePath, 'utf8'))).toEqual([]);
  });
});
