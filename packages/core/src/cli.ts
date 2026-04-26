/**
 * Tiny argv helpers shared by the bin/ scripts.
 *
 * We intentionally avoid pulling in a heavyweight CLI framework — each
 * helper has a small surface, and hand-rolled parsing keeps the scripts
 * transparent. Unknown flags throw so typos surface as an error instead of
 * being silently ignored.
 */

import { isAbsolute, resolve } from 'node:path';

export interface ParsedArgs {
  /** Positional args in order. */
  positional: string[];
  /** Flags and their string values; repeated flags overwrite. */
  flags: Record<string, string>;
  /** Boolean flags present on the command line (no value). */
  booleans: Set<string>;
}

/**
 * Parse argv into positionals, `--flag value` pairs, and boolean flags.
 *
 * @param argv          The argv slice to parse (e.g. `process.argv.slice(2)`).
 * @param known         Flag names that accept a following value.
 * @param booleanFlags  Flag names that are boolean (no value follows).
 *
 * Throws on unknown flags and missing values.
 */
export function parseArgs(
  argv: string[],
  known: readonly string[],
  booleanFlags: readonly string[] = [],
): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const booleans = new Set<string>();
  const knownSet = new Set(known);
  const boolSet = new Set(booleanFlags);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (boolSet.has(name)) {
      booleans.add(name);
      continue;
    }
    if (!knownSet.has(name)) {
      throw new Error(`Unknown flag: --${name}`);
    }
    if (eq >= 0) {
      flags[name] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Flag --${name} requires a value`);
      }
      flags[name] = next;
      i++;
    }
  }
  return { positional, flags, booleans };
}

/** Resolve a path arg to an absolute path, relative to cwd when not absolute. */
export function absolutize(pathArg: string): string {
  return isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
}

/**
 * Print a fatal error message to stderr and exit non-zero.
 *
 * Use this for user-facing failures (bad args, missing files, schema errors).
 * Developer errors (bugs) should throw and let the stack trace through.
 */
export function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** Print a JSON result to stdout followed by a newline. */
export function emit(result: unknown): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
