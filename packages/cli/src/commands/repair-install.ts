/**
 * deskwork repair-install — recover from Claude Code plugin-cache eviction
 * (issues #89, #125, #131).
 *
 * Thin wrapper around the marketplace-clone-resident bash script at
 * `~/.claude/plugins/marketplaces/deskwork/scripts/repair-install.sh`.
 *
 * The actual repair logic lives in bash because the deskwork CLI itself
 * is unreachable when the cache is wiped — the hook that auto-runs the
 * repair (configured per-adopter in their `.claude/settings.json`) needs
 * to operate without depending on `deskwork` being on PATH. The wrapper
 * exists so `deskwork repair-install` continues to work as an
 * operator-driven recovery path AFTER the cache has been restored.
 *
 * Argv shape: forwards all flags to the bash script. Common flags:
 *
 *   --quiet     Silent on healthy state. Used by SessionStart hooks.
 *   --check     Read-only — report state without modifying.
 *
 * Exit codes follow the bash script's contract:
 *   0  Healthy or repaired successfully.
 *   1  Repair failed (marketplace clone missing, fs error, etc.).
 *   2  Usage error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SCRIPT_PATH = join(
  homedir(),
  '.claude/plugins/marketplaces/deskwork/scripts/repair-install.sh',
);

export async function run(argv: string[]): Promise<void> {
  // The CLI dispatcher injects process.cwd() as args[0] when no
  // path-like arg is present. Drop anything that doesn't look like a
  // flag — only `--*` and `-x` reach the bash script.
  const flags = argv.filter((arg) => arg.startsWith('-'));

  if (!existsSync(SCRIPT_PATH)) {
    process.stderr.write(
      `repair-install script missing at ${SCRIPT_PATH}\n` +
        `the marketplace clone may not be present. In Claude Code, run:\n` +
        `  /plugin marketplace add audiocontrol-org/deskwork\n`,
    );
    process.exit(1);
  }

  const result = spawnSync('bash', [SCRIPT_PATH, ...flags], {
    stdio: 'inherit',
  });

  if (result.error) {
    process.stderr.write(`failed to invoke repair-install script: ${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
