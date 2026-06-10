// 011 T012 — `stackctl session-start` (read-only boot orientation). Resolves the
// enclosing installation (--at override, else cwd), assembles the orientation,
// prints the report, and STOPS — no authoring/implementation step fires (the
// two-session boundary; FR-002/FR-021). Strictly read-only: 0 on-disk changes
// (SC-008). Fails loud outside any installation directing to `stackctl setup`
// (FR-014; no bundled-copy fallback). See contracts/session-start-cli.md.
//
// Exit codes: 0 oriented; 1 fail-loud (outside an installation / malformed
// config); 2 usage error (unknown flag).

import { resolveInstallation } from '../config/installation.js';
import { InstallationError } from '../config/errors.js';
import { orient } from '../session/orient.js';
import { renderOrientation } from '../session/report.js';

interface StartFlags {
  readonly at: string | null;
  readonly json: boolean;
}

function usage(message: string): never {
  process.stderr.write(`session-start: ${message}\n`);
  process.stderr.write('usage: stackctl session-start [--at <dir>] [--json]\n');
  process.exit(2);
}

function parseFlags(args: readonly string[]): StartFlags {
  let at: string | null = null;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json') {
      json = true;
    } else if (arg === '--at') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) usage('--at requires a <dir> value');
      at = value;
      i++;
    } else if (arg.startsWith('--at=')) {
      at = arg.slice('--at='.length);
      if (at.length === 0) usage('--at requires a <dir> value');
    } else {
      usage(`unexpected argument '${arg}'`);
    }
  }
  return { at, json };
}

export async function runSessionStartCli(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const startDir = flags.at ?? process.cwd();

  let installation;
  try {
    installation = resolveInstallation(startDir);
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`session-start: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const report = orient({ installation, repoRoot: installation.root });

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderOrientation(report));
  }
  // Read-only + STOP: no writes, no /speckit-* step (FR-002/FR-021).
}
