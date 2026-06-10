// `stackctl install-drift` (010 T070 / US8) — advisory drift check over the
// locally-sourced `.specify` extension copies. Non-blocking: exits 0 always
// (advisory, per FR-033 / R6). Resolves the plugin root from this module's
// location and the project root from cwd.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeInstallDrift, renderInstallDrift } from '../scope-discovery/install-drift.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// src/subcommands → src → plugin root
const PLUGIN_ROOT = resolve(HERE, '..', '..');

export async function runInstallDrift(args: string[]): Promise<void> {
  let projectRoot = process.cwd();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--project-root') {
      const next = args[++i];
      if (next === undefined) {
        process.stderr.write('install-drift: --project-root requires a path\n');
        process.exit(2);
      }
      projectRoot = resolve(next);
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'Usage: stackctl install-drift [--project-root <path>]\n' +
          '  Advisory: warns (non-blocking) when local .specify extension copies have\n' +
          '  drifted from the plugin source. Exits 0 always.\n',
      );
      return;
    } else {
      process.stderr.write(`install-drift: unknown flag: ${a}\n`);
      process.exit(2);
    }
  }

  const report = computeInstallDrift({ pluginRoot: PLUGIN_ROOT, projectRoot });
  renderInstallDrift(report, (s) => process.stdout.write(s));
  process.exit(0); // advisory — never blocks
}
