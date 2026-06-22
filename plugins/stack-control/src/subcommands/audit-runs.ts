// TASK-425 — `stackctl audit-runs <list|prune>`: bounded retention for the
// audit-barrage run dirs under `<install>/.stack-control/audit-runs/`. The barrage
// persists every run (PROMPT.md, INDEX.md, per-model output, stderr/) as the lift
// source + triage evidence and never deletes them — they grow without bound
// (observed: 279 dirs / 108 MB). This verb gives the operator a sanctioned
// retention sweep (keep-last-N or older-than-T-days), dry-run by default.
//
// The SELECTION is the pure `selectForPrune` (src/audit-runs/prune.ts); this file
// owns only the IO (resolve dir, readdir, recursive size, rm) + flag grammar.
// Exit 0 success; 1 fail-loud (outside an installation); 2 usage.

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInstallation } from '../config/installation.js';
import { InstallationError } from '../config/errors.js';
import { parseRunDirTimestamp, selectForPrune } from '../audit-runs/prune.js';
import {
  failUsage,
  scanVerbFlags,
  validateSubactionFlags,
  type SubactionGrammar,
} from './document-verb-shared.js';

export const SUBACTION_SPECS: Readonly<Record<string, SubactionGrammar>> = {
  list: { valueFlags: ['at'], apply: false, positionals: 0 },
  prune: { valueFlags: ['at', 'keep-last', 'older-than-days'], apply: true, positionals: 0 },
};

const ALL_VALUE_FLAGS: readonly string[] = [
  ...new Set(Object.values(SUBACTION_SPECS).flatMap((s) => s.valueFlags)),
];

interface Flags {
  readonly apply: boolean;
  readonly values: ReadonlyMap<string, string>;
  readonly positionals: readonly string[];
}

function scanFlags(args: readonly string[]): Flags {
  const s = scanVerbFlags('audit-runs', args, '', ['apply'], ALL_VALUE_FLAGS);
  return { apply: s.booleans.has('apply'), values: s.values, positionals: s.positionals };
}

/** Resolve `<install>/.stack-control/audit-runs/`, honoring `--at`. */
function resolveRunsDir(flags: Flags): string {
  const at = flags.values.get('at');
  const installation = resolveInstallation(at ?? process.cwd());
  return join(installation.root, '.stack-control', 'audit-runs');
}

/** Run-dir names (run-dir grammar only) under `runsDir`; [] when the dir is absent. */
function readRunDirNames(runsDir: string): string[] {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && parseRunDirTimestamp(e.name) !== null)
    .map((e) => e.name);
}

/** Total bytes under `dir` (recursive). Symlinks are not followed. */
function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function sumSizes(runsDir: string, names: readonly string[]): number {
  return names.reduce((acc, name) => acc + dirSizeBytes(join(runsDir, name)), 0);
}

/** Read-only: count + total size + each run dir (newest first). */
function emitList(flags: Flags): void {
  const runsDir = resolveRunsDir(flags);
  const names = readRunDirNames(runsDir).sort().reverse();
  if (names.length === 0) {
    process.stdout.write(`audit-runs list: 0 run dirs under ${runsDir}\n`);
    return;
  }
  const total = sumSizes(runsDir, names);
  process.stdout.write(
    `audit-runs list: ${names.length} run dir${names.length === 1 ? '' : 's'} (${formatBytes(total)}) under ${runsDir}\n`,
  );
  for (const name of names) {
    process.stdout.write(`  - ${name} (${formatBytes(dirSizeBytes(join(runsDir, name)))})\n`);
  }
}

/** Parse a flag value as a non-negative integer, failing usage otherwise. */
function requireCount(raw: string, flag: string): number {
  if (!/^\d+$/.test(raw)) failUsage('audit-runs', `${flag} must be a non-negative integer (got '${raw}')`);
  return Number.parseInt(raw, 10);
}

/** Mutating: prune by keep-last-N or older-than-T-days (dry-run unless --apply). */
function emitPrune(flags: Flags): void {
  const keepLastRaw = flags.values.get('keep-last');
  const olderRaw = flags.values.get('older-than-days');
  if ((keepLastRaw === undefined) === (olderRaw === undefined)) {
    failUsage(
      'audit-runs',
      'prune requires EXACTLY ONE of --keep-last <n> or --older-than-days <t>',
    );
  }
  const runsDir = resolveRunsDir(flags);
  const names = readRunDirNames(runsDir);
  const opts =
    keepLastRaw !== undefined
      ? { keepLast: requireCount(keepLastRaw, '--keep-last'), now: new Date() }
      : { olderThanDays: requireCount(olderRaw!, '--older-than-days'), now: new Date() };
  const { prune } = selectForPrune(names, opts);

  if (prune.length === 0) {
    process.stdout.write(`audit-runs prune: nothing to prune (${names.length} run dir(s) retained)\n`);
    return;
  }
  const reclaim = sumSizes(runsDir, prune);
  if (!flags.apply) {
    process.stdout.write(
      `audit-runs prune: dry-run — would prune ${prune.length} run dir(s), freeing ${formatBytes(reclaim)} (use --apply to delete)\n`,
    );
    for (const name of prune) process.stdout.write(`  - ${name}\n`);
    return;
  }
  for (const name of prune) rmSync(join(runsDir, name), { recursive: true, force: true });
  process.stdout.write(
    `audit-runs prune: pruned ${prune.length} run dir(s), freed ${formatBytes(reclaim)}\n`,
  );
}

export async function runAuditRunsCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage('audit-runs', 'a subaction is required (usage: audit-runs <list|prune> [flags])');
  }
  const flags = scanFlags(args.slice(1));
  validateSubactionFlags('audit-runs', subaction, SUBACTION_SPECS[subaction], flags);
  try {
    switch (subaction) {
      case 'list':
        emitList(flags);
        return;
      case 'prune':
        emitPrune(flags);
        return;
      default:
        failUsage('audit-runs', `unknown subaction '${subaction}' (known: list, prune)`);
    }
  } catch (err) {
    if (err instanceof InstallationError) {
      const prefix = err.code === 'not-found' ? 'FATAL — ' : '';
      process.stderr.write(`audit-runs: ${prefix}${err.message}\n`);
      process.exit(err.code === 'escape' || err.code === 'collision' ? 2 : 1);
    }
    throw err;
  }
}
