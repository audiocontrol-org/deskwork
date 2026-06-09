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

/** Result of the generic subaction-verb flag scan. */
export interface ScannedFlags {
  readonly doc: string;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
  /** Recognized boolean flags that were present (e.g. `apply`, `clear`). */
  readonly booleans: ReadonlySet<string>;
}

/**
 * Generic flag scan shared by the subaction-dispatching verbs (`roadmap`,
 * `inbox`): a recognized `--<booleanFlag>` becomes membership in `booleans`;
 * `--doc <path>` sets the doc (defaulting to `defaultDoc`); any other
 * `--<name> <value>` lands in `values`; bare tokens are positionals. A flag
 * missing its value fails usage (exit 2). The per-subaction grammar (which
 * value-flags/booleans/positionals each subaction permits) is validated
 * separately by each verb.
 */
export function scanVerbFlags(
  verb: string,
  args: readonly string[],
  defaultDoc: string,
  booleanFlags: readonly string[],
): ScannedFlags {
  const recognizedBooleans = new Set(booleanFlags);
  let doc = defaultDoc;
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token.startsWith('--') && recognizedBooleans.has(token.slice(2))) {
      booleans.add(token.slice(2));
    } else if (token === '--doc') {
      const v = args[++i];
      if (v === undefined || v.startsWith('--')) failUsage(verb, '--doc <path> required');
      doc = v;
    } else if (token.startsWith('--')) {
      // Generic free-text value flags (inbox/roadmap `--idea`, `--scope`, …)
      // accept a value that itself begins with `--` — flag-shaped prose is
      // legitimate single-line content for a tool about CLI/process ideas
      // (e.g. `--idea "--apply should be rejected on list"`)
      // (AUDIT-BARRAGE codex-02/claude-02). The two cases that stay usage errors:
      //   1. no next token at all (value flag at the very end of argv); and
      //   2. the next token is a RECOGNIZED boolean flag for this verb — that is
      //      an operator who forgot the value, and silently swallowing the
      //      boolean would drop their intent (e.g. `defer <id> --until --apply`
      //      must NOT consume `--apply` as the condition; AUDIT-20260608-04).
      // (The dedicated `--doc` branch above keeps its own stricter guard.)
      const v = args[++i];
      if (v === undefined || (v.startsWith('--') && recognizedBooleans.has(v.slice(2)))) {
        failUsage(verb, `${token} <value> required`);
      }
      values.set(token.slice(2), v);
    } else {
      positionals.push(token);
    }
  }
  return { doc, positionals, values, booleans };
}

/** The first positional, failing usage with a subaction-specific message. */
export function requirePositional(
  verb: string,
  positionals: readonly string[],
  message: string,
): string {
  const first = positionals[0];
  if (first === undefined) failUsage(verb, message);
  return first;
}

/** Require a named `--<flag> <value>` from a scanned value map. */
export function requireMapValue(
  verb: string,
  values: ReadonlyMap<string, string>,
  name: string,
): string {
  const v = values.get(name);
  if (v === undefined) failUsage(verb, `--${name} <value> required`);
  return v;
}
