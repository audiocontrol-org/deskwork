// Shared plumbing for the document-primitives verbs (archive/unarchive/curate):
// built-in + project grammar dir resolution, and the DocumentModelError →
// exit-code mapping the contracts specify (validation/config → 2; everything
// else, e.g. a write failure, propagates → 1).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadOptions } from '../document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Built-in grammars ship at `plugins/stack-control/grammars/`. */
export const BUILTIN_GRAMMAR_DIR = resolve(here, '..', '..', 'grammars');

/** FR-012 override location, relative to the invoking project's working dir. */
export function grammarDirs(): LoadOptions {
  return {
    projectGrammarDir: join(process.cwd(), '.stack-control', 'grammars'),
    builtinGrammarDir: BUILTIN_GRAMMAR_DIR,
  };
}

/** Reject a missing value / unknown flag / stray positional with exit 2. */
export function requireFlagValue(verb: string, flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith('--')) {
    process.stderr.write(`${verb}: ${flag} <value> required\n`);
    process.exit(2);
  }
  return value;
}

export function failUsage(verb: string, message: string): never {
  process.stderr.write(`${verb}: ${message}\n`);
  process.exit(2);
}
