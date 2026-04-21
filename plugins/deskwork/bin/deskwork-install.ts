#!/usr/bin/env tsx
/**
 * deskwork-install — validate a deskwork config, write it to disk, and seed
 * empty calendar files for every configured site.
 *
 * Usage:
 *   deskwork-install <project-root> <config-file>
 *
 * The config-file must contain valid JSON matching the DeskworkConfig schema
 * (see lib/config.ts). On success the script:
 *   1. Writes the validated config to <project-root>/.deskwork/config.json
 *   2. Creates an empty calendar file at each site's calendarPath, but only
 *      when no file is already there
 *   3. Prints a summary of what was written and what was left untouched
 *
 * Exits non-zero with an actionable message on any failure. Idempotent:
 * re-running with the same config leaves existing calendars alone.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseConfig, configPath } from '../lib/config.ts';
import { renderEmptyCalendar } from '../lib/calendar.ts';

function usage(): never {
  console.error('Usage: deskwork-install <project-root> <config-file>');
  process.exit(2);
}

const [projectRootArg, configFileArg] = process.argv.slice(2);
if (!projectRootArg || !configFileArg) usage();

const projectRoot = isAbsolute(projectRootArg)
  ? projectRootArg
  : resolve(process.cwd(), projectRootArg);
const configFile = isAbsolute(configFileArg)
  ? configFileArg
  : resolve(process.cwd(), configFileArg);

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
