// T002 (006) — shared scaffolding for the roadmap suite: fixture-path + grammar
// resolution against the built-in heading-keyed `roadmap` grammar, plus a
// temp-dir writer for inline roadmap documents. Mirrors the temp-dir style in
// tests/document-primitives (fixtures on disk; never mock the filesystem —
// .claude/rules/testing.md).

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadOptions } from '../../src/document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = resolve(here, 'fixtures');
export const BUILTIN_GRAMMAR_DIR = resolve(here, '..', '..', 'grammars');
export const ROADMAP_OPTS: LoadOptions = { builtinGrammarDir: BUILTIN_GRAMMAR_DIR };

/** Absolute path to a fixture roadmap document (`<name>.md`). */
export function fixturePath(name: string): string {
  return join(FIXTURES, `${name}.md`);
}

/** Write an inline heading-keyed roadmap document to a fresh temp dir. */
export function writeTempRoadmap(bodyLines: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-'));
  const docPath = join(dir, 'ROADMAP.md');
  const src = ['---', 'doc-grammar: roadmap', '---', '', '# roadmap', '', ...bodyLines, ''].join('\n');
  writeFileSync(docPath, src, 'utf8');
  return docPath;
}
