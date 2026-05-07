#!/usr/bin/env node
/**
 * SessionStart hook for the deskwork plugin's studio bridge.
 *
 * When the project's `.deskwork/config.json` has `studioBridge.enabled === true`,
 * emit a SessionStart `additionalContext` directive that instructs the agent to
 * dispatch `/deskwork:listen` once. Otherwise, exit silently.
 *
 * Failure modes (missing config, malformed JSON, missing field) all degrade to
 * silent no-op so the hook never blocks session boot. Diagnostics are written
 * to stderr only — stdout is reserved for the JSON directive contract.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const configPath = join(projectRoot, '.deskwork', 'config.json');

const directive = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext:
      'The deskwork-studio bridge is enabled for this project ' +
      '(`.deskwork/config.json` → `studioBridge.enabled: true`). ' +
      'Run `/deskwork:listen` now to drop into bridge listen mode so the ' +
      'operator can dispatch from the studio chat panel.',
  },
};

function silentExit() {
  process.exit(0);
}

let stat;
try {
  stat = statSync(configPath);
} catch {
  silentExit();
}
if (!stat.isFile()) silentExit();

let raw;
try {
  raw = readFileSync(configPath, 'utf8');
} catch (err) {
  process.stderr.write(
    `deskwork bridge-autostart: could not read ${configPath}: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  silentExit();
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  process.stderr.write(
    `deskwork bridge-autostart: malformed JSON in ${configPath}: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  silentExit();
}

const enabled =
  parsed !== null &&
  typeof parsed === 'object' &&
  !Array.isArray(parsed) &&
  parsed.studioBridge !== null &&
  typeof parsed.studioBridge === 'object' &&
  !Array.isArray(parsed.studioBridge) &&
  parsed.studioBridge.enabled === true;

if (!enabled) silentExit();

process.stdout.write(JSON.stringify(directive));
process.stdout.write('\n');
process.exit(0);
