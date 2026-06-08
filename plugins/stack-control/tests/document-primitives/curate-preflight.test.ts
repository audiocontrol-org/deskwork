// AUDIT-20260608-25 (RED-first) — curate --apply must PREFLIGHT every
// archive-side fail-loud validation BEFORE it writes the reorder, so a
// validation/config failure leaves the live document untouched (zero writes —
// FR-010). The exposed bug: runCurate reorders + writes the live document
// FIRST, then runs the archive step, which can still throw the row-keyed
// column-schema mismatch. That throw, after a partial write, violates the
// zero-writes promise.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runCurate } from '../../src/document-model/curate-engine.js';
import { DocumentModelError } from '../../src/document-model/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

function tmp(body: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'curate-preflight-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

const ROADMAP4 = [
  '---',
  'doc-grammar: roadmap',
  '---',
  '',
  '# Roadmap',
  '',
  '| Codename | Feature | Scope | Status |',
  '|---|---|---|---|',
  '| impl/a | A | x | shipped |',
  '| design/b | B | y | planned |',
  '',
].join('\n');

describe('AUDIT-20260608-25 — curate --apply archive-side validation is a preflight (zero writes on failure)', () => {
  it('a disordered live doc whose archive step would fail-loud (column-schema mismatch) leaves the live document byte-identical', () => {
    const { docPath, archivePath } = tmp(ROADMAP4, 'ROADMAP.md');

    // Create a 4-col archive by archiving the shipped row.
    runArchive(docPath, { apply: true, ...OPTS });
    expect(existsSync(archivePath)).toBe(true);

    // Rewrite the live doc to a 5-col schema (trailing extra column so status
    // stays in its declared column and the live still parses) that is ALSO
    // disordered (impl/* before design/* — wrong declared order, since the
    // relation ranks [design, plan, impl, multi]) AND has a shipped row (so the
    // archive step has work to do and will hit the column-schema mismatch
    // against the 4-col archive table).
    const disorderedFiveCol = [
      '---',
      'doc-grammar: roadmap',
      '---',
      '',
      '# Roadmap',
      '',
      '| Codename | Feature | Scope | Status | Notes |',
      '|---|---|---|---|---|',
      '| impl/c | C | x | shipped | n2 |',
      '| design/z | Z | s | planned | n1 |',
      '',
    ].join('\n');
    writeFileSync(docPath, disorderedFiveCol, 'utf8');

    const before = readFileSync(docPath, 'utf8');

    // (a) curate --apply throws the archive-side validation error.
    expect(() => runCurate(docPath, { apply: true, ...OPTS })).toThrow(DocumentModelError);

    // (b) zero writes: the live document is byte-identical to before the call —
    // the reorder must NOT have landed ahead of the archive-side failure.
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
