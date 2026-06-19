// Shared scaffolding for the 028 Phase-4 roadmap edge-mutation suite. Mirrors the
// fixture style in tests/roadmap/helpers.ts (fixtures on disk; never mock the
// filesystem — .claude/rules/testing.md), rooted at the in-tree built-in
// `roadmap` grammar so the typed graph (depends-on/part-of/markers) loads.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadOptions } from '../../document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));

export const BUILTIN_GRAMMAR_DIR = resolve(here, '..', '..', '..', 'grammars');
export const ROADMAP_OPTS: LoadOptions = { builtinGrammarDir: BUILTIN_GRAMMAR_DIR };

/** Write an inline heading-keyed roadmap document to a fresh temp dir. */
export function writeTempRoadmap(bodyLines: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-edge-'));
  const docPath = join(dir, 'ROADMAP.md');
  const src = ['---', 'doc-grammar: roadmap', '---', '', '# roadmap', '', ...bodyLines, ''].join('\n');
  writeFileSync(docPath, src, 'utf8');
  return docPath;
}
