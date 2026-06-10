/**
 * plugins/stack-control/src/scope-discovery/customize.ts
 *
 * Scope-discovery override resolver + `customize` copy helper (010 / US6,
 * T059/T064). Two halves of one contract:
 *
 *   1. RESOLVER — `resolveScopeDiscoveryModule(installationRoot, name)`: a
 *      project override at `<installationRoot>/.stack-control/scope-discovery/
 *      <name>.ts` takes precedence over the plugin default shipped beside this
 *      module at `scope-discovery/<name>.ts`. This is the same flat override
 *      location the `override-drift` doctor rule diffs against, so customize +
 *      doctor agree on where overrides live.
 *
 *   2. COPY — `customizeScopeDiscovery(...)`: copy the plugin default into the
 *      project override location so the operator can edit it; the resolver then
 *      picks the edited copy automatically (no fork). Non-destructive: refuses
 *      to clobber an existing override unless `--force`.
 *
 * No fallback semantics beyond the documented precedence: a requested module
 * whose plugin default doesn't exist fails loud (the operator named a module
 * that isn't a scope-discovery default).
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCodebaseBoundary } from './codebase-boundary.js';
import { errorMessage } from './util/typeguards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** Plugin defaults live in this scope-discovery dir. */
const PLUGIN_DEFAULTS_DIR = __dirname;
/** Project override location, relative to an installation root. */
const OVERRIDE_DIR_REL = join('.stack-control', 'scope-discovery');

/** Where a scope-discovery module resolves from. */
export interface ResolvedModule {
  /** Absolute path to the active module file (override if present, else default). */
  readonly path: string;
  /** True when a project override at the override location took precedence. */
  readonly isOverride: boolean;
}

/** Absolute path to the plugin default for `name` (e.g. 'summary' → .../summary.ts). */
export function pluginDefaultPath(name: string): string {
  return join(PLUGIN_DEFAULTS_DIR, `${name}.ts`);
}

/** Absolute path to a project override for `name`, under the installation root. */
export function overridePath(installationRoot: string, name: string): string {
  return join(installationRoot, OVERRIDE_DIR_REL, `${name}.ts`);
}

/**
 * Resolve which `<name>.ts` is active for the codebase rooted at
 * `installationRoot`: the project override wins; otherwise the plugin default.
 * Fails loud when neither exists (the name isn't a known scope-discovery
 * module and the operator hasn't authored an override).
 */
export function resolveScopeDiscoveryModule(
  installationRoot: string,
  name: string,
): ResolvedModule {
  const override = overridePath(installationRoot, name);
  if (existsSync(override)) {
    return { path: override, isOverride: true };
  }
  const fallback = pluginDefaultPath(name);
  if (!existsSync(fallback)) {
    throw new Error(
      `scope-discovery module '${name}' has no plugin default at ${fallback} ` +
        `and no project override at ${override}`,
    );
  }
  return { path: fallback, isOverride: false };
}

export interface CustomizeResult {
  readonly code: 0 | 2;
  readonly source?: string;
  readonly destination?: string;
  readonly action?: 'created' | 'overwritten' | 'skipped';
}

interface CustomizeOptions {
  readonly name: string;
  readonly startDir: string;
  readonly at: string | null;
  readonly force: boolean;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: stackctl customize scope-discovery <name> [options]',
      '',
      'Copy a scope-discovery plugin default into the project override location',
      'so it can be edited; the runtime resolver then prefers the override.',
      '',
      'Options:',
      '  --at <dir>   Installation walk-up start dir (default: cwd).',
      '  --force      Overwrite an existing override.',
      '  --help, -h   Show this help.',
      '',
      'Exit codes: 0 success, 2 invalid args / no install / unknown module / I/O.',
      '',
    ].join('\n'),
  );
}

export function parseCli(argv: readonly string[]): CustomizeOptions {
  let category: string | null = null;
  let name: string | null = null;
  let at: string | null = null;
  let force = false;
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--at': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--at requires a path');
        at = next;
        i += 1;
        break;
      }
      case '--force':
        force = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        if (arg !== undefined && arg.startsWith('--')) {
          throw new Error(`unknown argument: ${arg}`);
        }
        if (arg !== undefined) positionals.push(arg);
    }
  }
  category = positionals[0] ?? null;
  name = positionals[1] ?? null;
  if (category !== 'scope-discovery') {
    throw new Error('Usage: stackctl customize scope-discovery <name>');
  }
  if (name === null || name.length === 0) {
    throw new Error('customize: a module <name> is required');
  }
  return { name, startDir: process.cwd(), at, force };
}

/**
 * Copy the plugin default for `name` into the project override location.
 * Resolves the installation via the shared boundary resolver; non-destructive
 * unless `--force`.
 */
export function customizeScopeDiscovery(opts: CustomizeOptions): CustomizeResult {
  const boundary = resolveCodebaseBoundary({ startDir: opts.startDir, explicitRoot: opts.at });
  const source = pluginDefaultPath(opts.name);
  if (!existsSync(source)) {
    throw new Error(
      `scope-discovery module '${opts.name}' has no plugin default at ${source} ` +
        `(nothing to customize)`,
    );
  }
  const destination = overridePath(boundary.installationRoot, opts.name);
  if (existsSync(destination) && !opts.force) {
    return { code: 0, source, destination, action: 'skipped' };
  }
  const action: 'created' | 'overwritten' = existsSync(destination) ? 'overwritten' : 'created';
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return { code: 0, source, destination, action };
}

export async function main(argv: readonly string[]): Promise<CustomizeResult> {
  let opts: CustomizeOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(`customize: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
  try {
    const result = customizeScopeDiscovery(opts);
    process.stdout.write(
      `${JSON.stringify(
        {
          category: 'scope-discovery',
          name: opts.name,
          source: result.source,
          destination: result.destination,
          action: result.action,
        },
        null,
        2,
      )}\n`,
    );
    return result;
  } catch (err) {
    process.stderr.write(`customize: ${errorMessage(err)}\n`);
    return { code: 2 };
  }
}
