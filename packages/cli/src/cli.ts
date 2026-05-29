#!/usr/bin/env node
/**
 * deskwork — single dispatch entry for the editorial CLI.
 *
 * Each subcommand lives in its own module under ./commands. Subcommands
 * export `run(argv: string[]): Promise<void>`. They emit JSON to stdout
 * for success, write to stderr + `process.exit(N)` (via lib/cli.ts:fail)
 * for failure.
 *
 * Usage:
 *   deskwork <subcommand> [args...]
 *
 * Examples:
 *   deskwork install <project-root> <config-file>
 *   deskwork add "My First Post" --site main
 *   deskwork outline draft-me --author "Jane"
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRetired, printRetiredError } from './commands/retired.ts';

const SUBCOMMANDS: Record<string, () => Promise<{ run: (argv: string[]) => Promise<void> }>> = {
  add: () => import('./commands/add.ts'),
  approve: () => import('./commands/approve.ts'),
  block: () => import('./commands/block.ts'),
  cancel: () => import('./commands/cancel.ts'),
  customize: () => import('./commands/customize.ts'),
  distribute: () => import('./commands/distribute.ts'),
  doctor: () => import('./commands/doctor.ts'),
  induct: () => import('./commands/induct.ts'),
  ingest: () => import('./commands/ingest.ts'),
  install: () => import('./commands/install.ts'),
  iterate: () => import('./commands/iterate.ts'),
  publish: () => import('./commands/publish.ts'),
  'repair-install': () => import('./commands/repair-install.ts'),
  'shortform-start': () => import('./commands/shortform-start.ts'),
};

const subcommand = process.argv[2];
const rawArgv = process.argv.slice(3);

if (!subcommand || subcommand === 'help' || subcommand === '--help') {
  printUsage();
  process.exit(subcommand ? 0 : 2);
}

// Version reporting (#256) — handled before the subcommand parser so
// `--version`, `-v`, and the `version` subcommand all answer "which
// version of the suite am I running?" instead of failing with "unknown
// subcommand". Lockstep versioning means cli + core share a version.
if (subcommand === '--version' || subcommand === '-v' || subcommand === 'version') {
  printVersion();
  process.exit(0);
}

// Retired verbs (v0.11.0): print a stable migration error before the
// SUBCOMMANDS lookup so adopters with stale skill invocations get a
// clear pointer instead of "unknown subcommand". Never returns.
if (isRetired(subcommand)) {
  printRetiredError(subcommand);
}

// Each command treats the first positional as <project-root>. To keep
// invocations short ("deskwork add 'My Post'" instead of
// "deskwork add . 'My Post'"), we inject process.cwd() when the user
// didn't pass an explicit path. The heuristic: the first non-flag arg
// is path-like only when it starts with `/`, `./`, `../`, or is exactly `.`.
// Anything else (a title, a slug, a flag) means "no project-root passed".
const argv = injectProjectRoot(rawArgv);

const loader = SUBCOMMANDS[subcommand];
if (!loader) {
  process.stderr.write(`unknown subcommand: ${subcommand}\n`);
  process.stderr.write(`Available: ${Object.keys(SUBCOMMANDS).sort().join(', ')}\n`);
  process.exit(2);
}

const mod = await loader();
await mod.run(argv);

function injectProjectRoot(args: string[]): string[] {
  const firstPositional = args.find((a) => !a.startsWith('--'));
  if (firstPositional && pathLike(firstPositional)) return args;
  return [process.cwd(), ...args];
}

function pathLike(s: string): boolean {
  return s === '.' || s.startsWith('/') || s.startsWith('./') || s.startsWith('../');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Read a package.json `version` field without `any` / `as` casts. Throws if absent. */
function readPackageVersion(pkgJsonPath: string): string {
  const parsed: unknown = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (!isRecord(parsed) || typeof parsed.version !== 'string') {
    throw new Error(`no string "version" field in ${pkgJsonPath}`);
  }
  return parsed.version;
}

/**
 * Print the running suite versions. @deskwork/cli is read from this
 * package's own package.json (always present, sibling of dist/); core is
 * resolved via its `./package.json` export (declared in core's exports
 * map). @deskwork/studio is not a dependency of the CLI, so it is not
 * reachable here and is intentionally omitted.
 */
function printVersion(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const cliVersion = readPackageVersion(join(here, '..', 'package.json'));
  process.stdout.write(`@deskwork/cli  ${cliVersion}\n`);
  const require = createRequire(import.meta.url);
  const coreVersion = readPackageVersion(require.resolve('@deskwork/core/package.json'));
  process.stdout.write(`@deskwork/core ${coreVersion}\n`);
}

function printUsage(): void {
  const out = subcommand ? process.stdout : process.stderr;
  out.write('Usage: deskwork <subcommand> [args...]\n\n');
  out.write('Setup:\n');
  out.write('  install         bootstrap deskwork in a project\n');
  out.write('  ingest          backfill existing markdown into the calendar\n');
  out.write('  add             capture a new idea (Ideas stage)\n\n');
  out.write('Pipeline:\n');
  out.write('  iterate         within-stage revision (snapshots a version)\n');
  out.write('  approve         advance to the next pipeline stage\n');
  out.write('  publish         move to Published\n');
  out.write('  block           pull an entry off-pipeline (Blocked; resumable via induct)\n');
  out.write('  cancel          pull an entry off-pipeline (Cancelled; rarely resumed)\n');
  out.write('  induct          teleport an entry to a chosen pipeline stage\n\n');
  out.write('Shortform:\n');
  out.write('  shortform-start enqueue a shortform draft for review\n');
  out.write('  distribute      record a posted shortform URL on the calendar\n\n');
  out.write('Maintenance:\n');
  out.write('  doctor          audit / repair calendar + sidecar + frontmatter\n');
  out.write('  customize       copy a plugin default into .deskwork/<category>/<name>.ts\n');
  out.write('  repair-install  prune stale entries from Claude Code\'s plugin registry\n\n');
  out.write('Skill-only verbs (use via /deskwork:<verb>):\n');
  out.write('  status          per-entry state summary\n\n');
  out.write('Run `deskwork <subcommand>` with no further args to see its usage.\n');
  out.write('Retired verbs (plan, outline, draft, pause, resume, review-*) print a migration\n');
  out.write('message; see MIGRATING.md.\n');
}
