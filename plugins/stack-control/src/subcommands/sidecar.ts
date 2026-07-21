// specs/036-fleet-control-plane — sidecar-daemon (`stackctl sidecar run`).
//
// The CLI front door for the runnable sidecar daemon (src/sidecar/daemon.ts):
// resolves the installation root + plane URL, runs `runSidecarDaemon`, and — on
// a WON election — stays alive holding the socket + uplink open until SIGINT/
// SIGTERM, then stops gracefully. A LOST election exits silently (exit 0) per
// the bind-wins contract (local-socket-protocol.md § C6): another sidecar is
// already the elected one for this installation.
//
// PLANE-URL RESOLUTION: `--plane-url <url>` (explicit) wins; else the daemon
// itself falls back to `STACKCTL_CP_URL`. Config-file `plane.url` resolution is
// a KNOWN GAP: the installation config-loader (src/config/config-loader.ts) does
// not yet parse the `plane` block (its KNOWN_TOP_LEVEL set omits `plane`, so a
// config carrying one would fail loud), so wiring `PlaneConfig.url` here would
// be dead code today. When the loader learns `plane`, resolution slots in as
// `--plane-url` > `STACKCTL_CP_URL` > `config.plane.url` — the spec's precedence
// (env over config), with the explicit flag ahead of both.
//
// STRICT ARG PARSING mirrors execute-check.ts / plane.ts (AUDIT-20260605-09,
// "no flag silently ignored"): an unknown flag, a missing `--plane-url` value,
// a stray positional, or a missing/unknown subaction is a usage error (exit 2).
//
// The cli-help descriptor lives at `src/cli-help/surfaces/fleet.ts` (T120-T125),
// wired from this module's `SUBACTION_SPECS` below; the SKILL.md is
// `skills/sidecar/SKILL.md`.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 module resolution (no `@/` alias configured).

import { openEnrollmentCustody } from '../machine-state/enrollment-custody.js';
import { locateHostState } from '../machine-state/locate.js';
import { runSidecarDaemon } from '../sidecar/daemon.js';
import type { SubactionGrammar } from './document-verb-shared.js';

const SIDECAR_USAGE =
  'usage: sidecar (run [--plane-url <url>] | set-enrollment --token <cred>)';
const RUN_USAGE = 'usage: sidecar run [--plane-url <url>]';
const SET_ENROLLMENT_USAGE = 'usage: sidecar set-enrollment --token <cred>';

/**
 * The `sidecar` verb's per-subaction grammar — read by the cli-help surface
 * builder (`src/cli-help/surfaces/fleet.ts`) so `--help` cannot drift from
 * what `parseRunArgs`/`parseSetEnrollmentArgs` actually accept. Descriptive
 * metadata only: it does not drive `runSidecar`'s own strict hand-rolled
 * parsing above, so this module's runtime behavior and exit codes are
 * unchanged by its presence.
 */
export const SUBACTION_SPECS: Readonly<Record<string, SubactionGrammar>> = {
  run: { valueFlags: ['plane-url'], apply: false, positionals: 0 },
  'set-enrollment': { valueFlags: ['token'], apply: false, positionals: 0 },
};

interface RunArgs {
  readonly planeUrl?: string;
}

// Strict arg parsing for `run`: accept ONLY an optional `--plane-url <value>`;
// reject a missing value, an unknown flag, or a stray positional with exit 2.
function parseRunArgs(args: string[]): RunArgs {
  let planeUrl: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--plane-url') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`sidecar run: --plane-url <url> requires a value (${RUN_USAGE})\n`);
        process.exit(2);
      }
      planeUrl = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(`sidecar run: unexpected argument '${arg}' (${RUN_USAGE})\n`);
    process.exit(2);
  }
  return { planeUrl };
}

/**
 * `sidecar run [--plane-url <url>]` — elect + run the sidecar daemon for the
 * current installation, staying alive until SIGINT/SIGTERM. A lost election
 * exits silently (0); a won election holds the process open and stops
 * gracefully on a stop signal.
 */
async function runSidecarRun(args: string[]): Promise<void> {
  const { planeUrl } = parseRunArgs(args);

  const daemon = runSidecarDaemon({
    installationRoot: process.cwd(),
    planeUrl,
  });

  const start = await daemon.started;
  if (start.kind === 'lost') {
    // Losing the bind-wins election is normal and quiet (C6): another sidecar
    // already holds this installation's socket. Exit silently.
    return;
  }

  process.stdout.write(`sidecar: elected — listening at ${start.socketPath}\n`);

  // Stay alive until a stop signal, then tear the daemon down gracefully.
  await new Promise<void>((resolve) => {
    let stopping = false;
    const onSignal = (): void => {
      if (stopping) return;
      stopping = true;
      daemon.stop().then(
        () => resolve(),
        () => resolve(),
      );
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });
}

interface SetEnrollmentArgs {
  readonly token: string;
}

// Strict arg parsing for `set-enrollment`: accept ONLY a required
// `--token <value>`; reject a missing value, a missing flag, an unknown flag,
// or a stray positional with exit 2 — mirrors `parseRunArgs` above.
function parseSetEnrollmentArgs(args: string[]): SetEnrollmentArgs {
  let token: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--token') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(
          `sidecar set-enrollment: --token <cred> requires a value (${SET_ENROLLMENT_USAGE})\n`,
        );
        process.exit(2);
      }
      token = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(
      `sidecar set-enrollment: unexpected argument '${arg}' (${SET_ENROLLMENT_USAGE})\n`,
    );
    process.exit(2);
  }
  if (token === undefined) {
    process.stderr.write(
      `sidecar set-enrollment: --token <cred> is required (${SET_ENROLLMENT_USAGE})\n`,
    );
    process.exit(2);
  }
  return { token };
}

/**
 * `sidecar set-enrollment --token <cred>` — store the operator-issued
 * enrollment credential into HOST-LEVEL custody (shared across every
 * installation on this host), so a later `sidecar run` can self-enroll
 * (Task 10). Never echoes the credential value.
 */
async function runSidecarSetEnrollment(args: string[]): Promise<void> {
  const { token } = parseSetEnrollmentArgs(args);

  openEnrollmentCustody(locateHostState().durableDir).write(token);

  process.stdout.write('sidecar: enrollment credential stored\n');
}

/**
 * `stackctl sidecar <subaction> [...]`. Subactions: `run`, `set-enrollment`.
 * A missing or unrecognized subaction is a usage error (exit 2), matching
 * every other stackctl verb's strict-arg contract.
 */
export async function runSidecar(args: string[]): Promise<void> {
  const [subaction, ...rest] = args;

  if (subaction === undefined) {
    process.stderr.write(`sidecar: subcommand required (${SIDECAR_USAGE})\n`);
    process.exit(2);
  }

  if (subaction === 'run') {
    await runSidecarRun(rest);
    return;
  }

  if (subaction === 'set-enrollment') {
    await runSidecarSetEnrollment(rest);
    return;
  }

  process.stderr.write(`sidecar: unknown subcommand '${subaction}' (${SIDECAR_USAGE})\n`);
  process.exit(2);
}
