/**
 * deskwork-install — validate a deskwork config, write it to disk, and seed
 * empty calendar files for every configured site.
 *
 * Usage (one-arg, project-root defaults to cwd):
 *   deskwork install <config-file>
 *
 * Usage (two-arg, explicit project-root):
 *   deskwork install <project-root> <config-file>
 *
 * The agent inside Claude Code is already running in the host project's
 * working directory, so the one-arg form is the natural call. The
 * explicit two-arg form is preserved for scripted use (CI bootstrapping
 * a project from outside, etc.).
 *
 * The config-file must contain valid JSON matching the DeskworkConfig
 * schema (see lib/config.ts). On success the script:
 *   1. Writes the validated config to <project-root>/.deskwork/config.json
 *   2. Creates an empty calendar file at each site's calendarPath, but
 *      only when no file is already there
 *   3. Prints a summary of what was written and what was left untouched
 *
 * Exits non-zero with an actionable message on any failure. Idempotent:
 * re-running with the same config leaves existing calendars alone.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseConfig, configPath } from '@deskwork/core/config';
import { renderEmptyCalendar } from '@deskwork/core/calendar';

export async function run(argv: string[]): Promise<void> {
  function usage(): never {
    console.error(
      'Usage: deskwork install [<project-root>] <config-file>',
    );
    process.exit(2);
  }

  // Two argv shapes possible after the cli dispatcher has run:
  //   [<config-file>]                    → project-root defaults to cwd
  //   [<project-root>, <config-file>]    → explicit project-root
  // The dispatcher's pathLike heuristic injects cwd for non-path-like
  // first args, so `deskwork install bare.json` arrives here as the
  // two-arg form `[cwd, bare.json]`. The one-arg form below only fires
  // when the user passed an absolute or relative path as the single
  // positional (e.g. `deskwork install /tmp/config.json`).
  let projectRootArg: string;
  let configFileArg: string;
  if (argv.length === 1) {
    projectRootArg = process.cwd();
    configFileArg = argv[0];
  } else if (argv.length === 2) {
    [projectRootArg, configFileArg] = argv;
  } else {
    usage();
  }

  const projectRoot = isAbsolute(projectRootArg)
    ? projectRootArg
    : resolve(process.cwd(), projectRootArg);
  const configFile = isAbsolute(configFileArg)
    ? configFileArg
    : resolve(process.cwd(), configFileArg);

  // Heads-up so the operator (or the agent reading the output) can
  // interrupt before any disk writes if the inferred project-root is
  // wrong. Prints to stdout so it lands above the success summary.
  console.log(`Installing into: ${projectRoot}`);

  if (!existsSync(projectRoot)) {
    console.error(`Project root does not exist: ${projectRoot}`);
    process.exit(1);
  }
  if (!existsSync(configFile)) {
    console.error(`Config file does not exist: ${configFile}`);
    process.exit(1);
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFileSync(configFile, 'utf-8'));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`Config file is not valid JSON: ${reason}`);
    process.exit(1);
  }

  let config;
  try {
    config = parseConfig(rawConfig);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(reason);
    process.exit(1);
  }

  const writtenConfigPath = configPath(projectRoot);
  mkdirSync(dirname(writtenConfigPath), { recursive: true });
  writeFileSync(
    writtenConfigPath,
    JSON.stringify(config, null, 2) + '\n',
    'utf-8',
  );

  const createdCalendars: string[] = [];
  const preservedCalendars: string[] = [];

  for (const [slug, site] of Object.entries(config.sites)) {
    const absPath = join(projectRoot, site.calendarPath);
    if (existsSync(absPath)) {
      preservedCalendars.push(`${slug}: ${site.calendarPath}`);
      continue;
    }
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, renderEmptyCalendar(), 'utf-8');
    createdCalendars.push(`${slug}: ${site.calendarPath}`);
  }

  console.log(`Wrote config: ${writtenConfigPath}`);
  console.log(`Sites configured: ${Object.keys(config.sites).join(', ')}`);
  console.log(`Default site: ${config.defaultSite}`);
  if (createdCalendars.length > 0) {
    console.log(`Created calendars:`);
    for (const c of createdCalendars) console.log(`  - ${c}`);
  }
  if (preservedCalendars.length > 0) {
    console.log(`Left existing calendars untouched:`);
    for (const c of preservedCalendars) console.log(`  - ${c}`);
  }
}
