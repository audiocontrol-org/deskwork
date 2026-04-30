/**
 * deskwork repair-install — recover from Claude Code's stale plugin
 * registry state (issue #89).
 *
 * Symptom: after a series of /plugin install + /plugin marketplace
 * update + /reload-plugins cycles, ~/.claude/plugins/installed_plugins.json
 * accumulates entries pointing at cache directories that no longer
 * exist on disk. Claude Code wires PATH from these stale entries, so
 * `command -v deskwork` returns nothing even though the marketplace
 * clone at ~/.claude/plugins/marketplaces/deskwork/ is intact.
 *
 * The fix on Claude Code's side is registry hygiene (prune entries on
 * write; reconcile against disk on reload). Until that lands, this
 * command lets adopters self-heal: prune deskwork-owned entries whose
 * installPath doesn't exist, then re-install via /plugin install +
 * /reload-plugins to repopulate the cache.
 *
 * Argv shape: no positional args. Optional flags:
 *
 *   --dry-run    Show what would be pruned without writing.
 *   --json       Machine-readable output.
 *
 * The CLI dispatcher injects process.cwd() as args[0] when no path-like
 * arg is present; this command ignores it.
 *
 * Exit codes:
 *   0  Registry was already clean OR pruned cleanly.
 *   1  Registry not found, malformed, or unrecognized version.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface InstallEntry {
  readonly scope: string;
  readonly installPath: string;
  readonly version: string;
  readonly installedAt?: string;
  readonly lastUpdated?: string;
  readonly gitCommitSha?: string;
  readonly projectPath?: string;
}

interface Registry {
  readonly version: number;
  plugins: Record<string, InstallEntry[]>;
}

const REGISTRY_PATH = join(homedir(), '.claude/plugins/installed_plugins.json');
const MARKETPLACE_CLONE = join(homedir(), '.claude/plugins/marketplaces/deskwork');
const DESKWORK_PLUGINS = ['deskwork', 'deskwork-studio', 'dw-lifecycle'] as const;
const DESKWORK_KEYS = DESKWORK_PLUGINS.map((p) => `${p}@deskwork`);

interface PruneReport {
  readonly registryPath: string;
  readonly marketplaceClonePresent: boolean;
  readonly pruned: ReadonlyArray<{ readonly key: string; readonly entry: InstallEntry }>;
  readonly kept: ReadonlyArray<{ readonly key: string; readonly entry: InstallEntry }>;
  readonly missingAfterPrune: ReadonlyArray<string>;
  readonly registryWritten: boolean;
}

export async function run(argv: string[]): Promise<void> {
  const dryRun = argv.includes('--dry-run');
  const json = argv.includes('--json');

  if (!existsSync(REGISTRY_PATH)) {
    process.stderr.write(`installed_plugins.json not found at ${REGISTRY_PATH}\n`);
    process.exit(1);
  }

  let registry: Registry;
  try {
    registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`failed to parse ${REGISTRY_PATH}: ${reason}\n`);
    process.exit(1);
  }

  if (typeof registry.version !== 'number' || registry.version > 2) {
    process.stderr.write(
      `unrecognized installed_plugins.json version: ${String(registry.version)}\n` +
        `this command was written for version 2 — bail out and edit the file by hand if you trust the change.\n`,
    );
    process.exit(1);
  }
  if (!registry.plugins || typeof registry.plugins !== 'object') {
    process.stderr.write(`installed_plugins.json missing 'plugins' object\n`);
    process.exit(1);
  }

  const report = pruneRegistry(registry, dryRun);
  emit(report, { json });
  process.exit(0);
}

export function pruneRegistry(registry: Registry, dryRun: boolean): PruneReport {
  const pruned: Array<{ key: string; entry: InstallEntry }> = [];
  const kept: Array<{ key: string; entry: InstallEntry }> = [];

  for (const key of DESKWORK_KEYS) {
    const entries = registry.plugins[key];
    if (!Array.isArray(entries)) continue;
    const live: InstallEntry[] = [];
    for (const entry of entries) {
      if (entry.installPath && existsSync(entry.installPath)) {
        live.push(entry);
        kept.push({ key, entry });
      } else {
        pruned.push({ key, entry });
      }
    }
    if (live.length > 0) {
      registry.plugins[key] = live;
    } else {
      delete registry.plugins[key];
    }
  }

  let registryWritten = false;
  if (!dryRun && pruned.length > 0) {
    writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    registryWritten = true;
  }

  const missingAfterPrune = DESKWORK_PLUGINS.filter((p) => {
    const liveEntries = registry.plugins[`${p}@deskwork`];
    return !liveEntries || liveEntries.length === 0;
  });

  return {
    registryPath: REGISTRY_PATH,
    marketplaceClonePresent: existsSync(MARKETPLACE_CLONE),
    pruned,
    kept,
    missingAfterPrune,
    registryWritten,
  };
}

function emit(report: PruneReport, opts: { json: boolean }): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (report.pruned.length === 0) {
    process.stdout.write('Registry has no stale deskwork entries — install state looks consistent.\n');
    if (report.missingAfterPrune.length > 0) {
      process.stdout.write(`\nNote: no entries registered for: ${report.missingAfterPrune.join(', ')}.\n`);
      process.stdout.write('If you need any of these, install via Claude Code:\n');
      for (const name of report.missingAfterPrune) {
        process.stdout.write(`  /plugin install ${name}@deskwork\n`);
      }
      process.stdout.write('  /reload-plugins\n');
    }
    return;
  }

  const verb = report.registryWritten ? 'Pruned' : 'Would prune';
  const count = report.pruned.length;
  process.stdout.write(`${verb} ${count} stale entr${count === 1 ? 'y' : 'ies'} pointing at non-existent paths:\n`);
  for (const { key, entry } of report.pruned) {
    process.stdout.write(`  ${key}  scope=${entry.scope}  version=${entry.version}\n`);
    process.stdout.write(`    ${entry.installPath}\n`);
  }

  if (report.kept.length > 0) {
    process.stdout.write(`\nKept ${report.kept.length} live entr${report.kept.length === 1 ? 'y' : 'ies'}:\n`);
    for (const { key, entry } of report.kept) {
      process.stdout.write(`  ${key}  scope=${entry.scope}  version=${entry.version}\n`);
    }
  }

  if (report.registryWritten) {
    process.stdout.write(`\nWrote cleaned registry to ${report.registryPath}\n`);
  } else {
    process.stdout.write('\n(dry-run: registry not modified — re-run without --dry-run to apply.)\n');
  }

  if (report.missingAfterPrune.length > 0) {
    process.stdout.write('\nNext steps to restore the bin(s) on PATH:\n');
    process.stdout.write('  In Claude Code, run:\n');
    for (const name of report.missingAfterPrune) {
      process.stdout.write(`    /plugin install ${name}@deskwork\n`);
    }
    process.stdout.write('    /reload-plugins\n');
    process.stdout.write('\n  Verify with:\n');
    for (const name of report.missingAfterPrune) {
      process.stdout.write(`    command -v ${name}\n`);
    }
  }

  if (!report.marketplaceClonePresent) {
    process.stdout.write('\nWarning: marketplace clone at ');
    process.stdout.write(MARKETPLACE_CLONE);
    process.stdout.write(` is missing.\n`);
    process.stdout.write('You may need to re-add the marketplace before /plugin install will work:\n');
    process.stdout.write('  /plugin marketplace add audiocontrol-org/deskwork\n');
  }
}
