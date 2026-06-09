// T002 (007) — shared scaffolding for the inbox suite: fixture-path + grammar
// resolution against the built-in `design-inbox` grammar, plus an isolated
// tmp-copy of a committed fixture (fixtures on disk; never mock the filesystem —
// .claude/rules/testing.md). Mirrors tests/roadmap/helpers.ts.

import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadOptions } from '../../src/document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = resolve(here, 'fixtures');
export const BUILTIN_GRAMMAR_DIR = resolve(here, '..', '..', 'grammars');
export const INBOX_OPTS: LoadOptions = { builtinGrammarDir: BUILTIN_GRAMMAR_DIR };

/** Absolute path to a fixture inbox document (`<name>.md`). */
export function fixturePath(name: string): string {
  return join(FIXTURES, `${name}.md`);
}

/** Copy a committed fixture into a fresh temp dir; return the isolated doc path. */
export function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-'));
  const docPath = join(dir, 'DESIGN-INBOX.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}
