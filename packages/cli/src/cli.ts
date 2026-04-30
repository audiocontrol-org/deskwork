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

const SUBCOMMANDS: Record<string, () => Promise<{ run: (argv: string[]) => Promise<void> }>> = {
  add: () => import('./commands/add.ts'),
  approve: () => import('./commands/approve.ts'),
  customize: () => import('./commands/customize.ts'),
  distribute: () => import('./commands/distribute.ts'),
  doctor: () => import('./commands/doctor.ts'),
  draft: () => import('./commands/draft.ts'),
  ingest: () => import('./commands/ingest.ts'),
  install: () => import('./commands/install.ts'),
  iterate: () => import('./commands/iterate.ts'),
  outline: () => import('./commands/outline.ts'),
  pause: () => import('./commands/pause.ts'),
  plan: () => import('./commands/plan.ts'),
  publish: () => import('./commands/publish.ts'),
  'repair-install': () => import('./commands/repair-install.ts'),
  resume: () => import('./commands/resume.ts'),
  'review-cancel': () => import('./commands/review-cancel.ts'),
  'review-help': () => import('./commands/review-help.ts'),
  'review-report': () => import('./commands/review-report.ts'),
  'review-start': () => import('./commands/review-start.ts'),
  'shortform-start': () => import('./commands/shortform-start.ts'),
};

const subcommand = process.argv[2];
const rawArgv = process.argv.slice(3);

if (!subcommand || subcommand === 'help' || subcommand === '--help') {
  printUsage();
  process.exit(subcommand ? 0 : 2);
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

function printUsage(): void {
  const out = subcommand ? process.stdout : process.stderr;
  out.write('Usage: deskwork <subcommand> [args...]\n\n');
  out.write('Lifecycle:\n');
  out.write('  install         bootstrap deskwork in a project\n');
  out.write('  ingest          backfill existing markdown into the calendar\n');
  out.write('  add             append an idea to the calendar\n');
  out.write('  plan            move Ideas → Planned with keywords\n');
  out.write('  outline         scaffold + move Planned → Outlining\n');
  out.write('  draft           move Outlining → Drafting\n');
  out.write('  publish         move to Published\n');
  out.write('  pause           move a non-terminal entry to Paused\n');
  out.write('  resume          restore a Paused entry to its prior stage\n\n');
  out.write('Maintenance:\n');
  out.write('  doctor          audit/repair binding metadata\n');
  out.write('  customize       copy a plugin default into .deskwork/<category>/<name>.ts\n');
  out.write('  repair-install  prune stale entries from Claude Code\'s plugin registry (#89)\n\n');
  out.write('Review loop:\n');
  out.write('  review-start    enqueue a longform draft for review\n');
  out.write('  shortform-start enqueue a shortform draft for review\n');
  out.write('  iterate         snapshot agent revision; back to in-review\n');
  out.write('  approve         finalize an approved workflow\n');
  out.write('  review-cancel   cancel a workflow\n');
  out.write('  review-help     list open workflows\n');
  out.write('  review-report   voice-drift report\n\n');
  out.write('Distribution:\n');
  out.write('  distribute      record a posted shortform URL on the calendar\n\n');
  out.write('Run `deskwork <subcommand>` with no further args to see its usage.\n');
}
