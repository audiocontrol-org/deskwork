// Shared plumbing for the document-primitives verbs (archive/unarchive/curate):
// built-in + project grammar dir resolution, and the DocumentModelError →
// exit-code mapping the contracts specify (validation/config → 2; everything
// else, e.g. a write failure, propagates → 1).

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LoadOptions } from '../document-model/document.js';
import { findInstallation } from '../config/installation.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Built-in grammars ship at `plugins/stack-control/grammars/`. */
export const BUILTIN_GRAMMAR_DIR = resolve(here, '..', '..', 'grammars');

/** Grammar load options rooted at a specific installation root (009 T018). */
export function grammarOptsForRoot(root: string): LoadOptions {
  return {
    projectGrammarDir: join(root, '.stack-control', 'grammars'),
    builtinGrammarDir: BUILTIN_GRAMMAR_DIR,
  };
}

/**
 * Grammar dirs for the current invocation (009 T018): resolve the enclosing
 * installation and root the project grammar override at IT, not raw cwd. When
 * outside any installation, only the built-in grammars apply (no bundled
 * project-grammar guess). A non-existent project grammar dir is tolerated by the
 * resolver, so this is behavior-preserving when no installation/override exists.
 */
export function grammarDirs(): LoadOptions {
  const inst = findInstallation(process.cwd());
  return inst ? grammarOptsForRoot(inst.root) : { builtinGrammarDir: BUILTIN_GRAMMAR_DIR };
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
 *
 * `valueFlagNames` is the union of every subaction's value-flag names — the
 * caller passes it so the scanner can recognize a FOLLOWING value-flag token as
 * a forgotten value, not swallow it as free text (AUDIT-BARRAGE-claude-01).
 */
export function scanVerbFlags(
  verb: string,
  args: readonly string[],
  defaultDoc: string,
  booleanFlags: readonly string[],
  valueFlagNames: readonly string[],
): ScannedFlags {
  const recognizedBooleans = new Set(booleanFlags);
  // Every flag NAME the verb recognizes: booleans ∪ value-flags ∪ the universal
  // `doc`. A token `--<name>` whose <name> is in this set is a real flag of the
  // verb, never legitimate free-text prose.
  const recognizedFlagNames = new Set([...booleanFlags, ...valueFlagNames, 'doc']);
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
      //   2. the next token is a RECOGNIZED flag of this verb (a boolean, another
      //      value-flag, or `--doc`) — that is an operator who forgot the value,
      //      and silently swallowing a real flag drops their intent (e.g.
      //      `capture --idea --doc <path> --apply` must NOT consume `--doc` as the
      //      idea, silently writing to the DEFAULT doc; AUDIT-BARRAGE-claude-01).
      //      A `--`-prefixed token that is NOT a recognized flag name is still
      //      accepted as free-text prose (case (1)/(2) only fire on real flags).
      const v = args[++i];
      if (v === undefined || (v.startsWith('--') && recognizedFlagNames.has(v.slice(2)))) {
        // Surface the true fault: if the LEADING token is not itself a flag the
        // verb recognizes, the operator's mistake is an unknown flag, not a
        // missing value — saying "<flag> <value> required" would send them to
        // supply a value and then trip a *different* unknown-flag error from
        // validateFlags on the next attempt (AUDIT-20260609-13).
        if (!recognizedFlagNames.has(token.slice(2))) failUsage(verb, `unknown flag ${token}`);
        failUsage(verb, `${token} <value> required`);
      }
      values.set(token.slice(2), v);
    } else {
      positionals.push(token);
    }
  }
  return { doc, positionals, values, booleans };
}

/** Per-subaction flag grammar shared by the subaction-dispatching verbs. */
export interface SubactionGrammar {
  readonly valueFlags: readonly string[];
  /** Whether `--apply` is meaningful for the subaction. */
  readonly apply: boolean;
  /** Whether `--clear` is meaningful (roadmap `defer`); absent → not allowed. */
  readonly clear?: boolean;
  /** Whether `--chain` is meaningful (roadmap `cluster`); absent → not allowed. */
  readonly chain?: boolean;
  /** Whether `--analyze-clean` is meaningful (roadmap `approve-design`); absent → not allowed. */
  readonly analyzeClean?: boolean;
  /** Max positionals consumed beyond the subaction token. */
  readonly positionals: number;
  /** When true, `positionals` is a floor, not a cap — the subaction accepts an
   * unbounded list (e.g. backlog `promote` batches N item-ids, 012 D5). The
   * per-subaction handler enforces any kind-specific arity itself. */
  readonly unboundedPositionals?: boolean;
}

/**
 * Reject unknown value-flags, an unsupported `--apply`/`--clear`, and extra
 * positionals for the chosen subaction (exit 2) — BEFORE any mutation/query
 * runs. Shared by roadmap/inbox/backlog so the grammar-enforcement is single-
 * sourced (the flag SCAN is already shared via scanVerbFlags). An unknown
 * subaction (`grammar === undefined`) is left to the verb's dispatch switch.
 */
export function validateSubactionFlags(
  verb: string,
  subaction: string,
  grammar: SubactionGrammar | undefined,
  flags: {
    readonly apply: boolean;
    readonly clear?: boolean;
    readonly chain?: boolean;
    readonly analyzeClean?: boolean;
    readonly positionals: readonly string[];
    readonly values: ReadonlyMap<string, string>;
  },
): void {
  if (grammar === undefined) return;
  const allowed = new Set(grammar.valueFlags);
  for (const name of flags.values.keys()) {
    if (!allowed.has(name)) failUsage(verb, `unknown flag --${name} for '${subaction}'`);
  }
  if (flags.apply && !grammar.apply) failUsage(verb, `--apply is not valid for '${subaction}'`);
  if (flags.clear === true && grammar.clear !== true) {
    failUsage(verb, `--clear is not valid for '${subaction}'`);
  }
  if (flags.chain === true && grammar.chain !== true) {
    failUsage(verb, `--chain is not valid for '${subaction}'`);
  }
  if (flags.analyzeClean === true && grammar.analyzeClean !== true) {
    failUsage(verb, `--analyze-clean is not valid for '${subaction}'`);
  }
  if (grammar.unboundedPositionals !== true && flags.positionals.length > grammar.positionals) {
    failUsage(verb, `unexpected positional '${flags.positionals[grammar.positionals]!}' for '${subaction}'`);
  }
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
