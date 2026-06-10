// `stackctl setup [--at <dir>] [--apply]` (009 T014) — the create-side verb.
// Resolve-or-create the installation root, resolve every working-file location
// through the shared port, scaffold the missing items (empty-but-valid,
// non-destructive), verify each present item against its consuming parser, and
// report. Dry-run by default; --apply writes. Exit 0 ready / 1 malformed-or-
// write-failure / 2 usage-or-config-refusal (contracts/setup-cli.md).

import { existsSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { findInstallation } from '../config/installation.js';
import { resolvePaths } from '../config/resolve-paths.js';
import { InstallationError } from '../config/errors.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import { MANAGED_KEYS, scaffoldKey, targetExists } from '../setup/scaffold.js';
import { verifyKey } from '../setup/verify.js';
import { renderReport } from '../setup/report.js';
import { failUsage, grammarOptsForRoot } from './document-verb-shared.js';
import type {
  InstallationConfig,
  ResolvedPaths,
  SetupItem,
  SetupReport,
  SetupStatus,
} from '../config/types.js';

interface SetupArgs {
  readonly at: string;
  readonly apply: boolean;
}

function parseArgs(args: readonly string[]): SetupArgs {
  let at = process.cwd();
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token === '--apply') {
      apply = true;
    } else if (token === '--at') {
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) failUsage('setup', '--at <dir> required');
      at = resolvePath(value);
    } else if (token.startsWith('--')) {
      failUsage('setup', `unknown flag ${token}`);
    } else {
      failUsage('setup', `unexpected positional '${token}'`);
    }
  }
  return { at, apply };
}

export async function runSetupCli(args: string[]): Promise<void> {
  const { at, apply } = parseArgs(args);
  if (existsSync(at) && !statSync(at).isDirectory()) {
    failUsage('setup', `--at ${at} is not a directory`);
  }

  const { root, resolved } = resolveTarget(at);
  const grammarOpts = grammarOptsForRoot(root);

  const items: SetupItem[] = [];
  let ready = true;
  for (const key of MANAGED_KEYS) {
    const location = resolved[key];
    const existed = targetExists(key, resolved);
    let status: SetupStatus = existed ? 'already-present' : 'created';

    if (!existed && apply) {
      try {
        scaffoldKey(key, resolved);
      } catch (err) {
        process.stderr.write(`setup: failed to scaffold ${key} at ${location}: ${errorMessage(err)}\n`);
        process.exit(1);
      }
    }

    // Verify whenever the file is on disk now (pre-existing, or just created).
    if (existed || apply) {
      const verdict = verifyKey(key, resolved, grammarOpts);
      if (!verdict.ok) {
        status = 'malformed';
        ready = false;
        items.push({ key, location, status, detail: verdict.detail });
        continue;
      }
    }
    items.push({ key, location, status });
  }

  const report: SetupReport = { installationRoot: root, items, ready };
  process.stdout.write(renderReport(report, !apply));
  process.exit(ready ? 0 : 1);
}

/**
 * Resolve an existing enclosing installation (idempotent re-run), or designate a
 * fresh root at `at` with a default config. A config refusal (escape/collision)
 * exits 2; a malformed existing config exits 1.
 */
function resolveTarget(at: string): { root: string; resolved: ResolvedPaths } {
  try {
    const found = findInstallation(at);
    if (found) return { root: found.root, resolved: found.resolved };
    const root = resolvePath(at);
    const config: InstallationConfig = { version: 1 };
    return { root, resolved: resolvePaths(root, config) };
  } catch (err) {
    if (err instanceof InstallationError) {
      const code = err.code === 'escape' || err.code === 'collision' ? 2 : 1;
      process.stderr.write(`setup: ${err.message}\n`);
      process.exit(code);
    }
    throw err;
  }
}
