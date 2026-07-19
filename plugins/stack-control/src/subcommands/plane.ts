// specs/036-fleet-control-plane — T119 (impl), pairs with T119's RED test
// (tests/fleet/plane-provision-token.test.ts).
//
// PT-015 (research.md): the bearer token is placed into the machine-local
// durable store by an EXPLICIT operator-run verb. NO join-code exchange, NO
// automatic enrollment — a single-operator fleet (FR-078) does not need one.
// Revocation is plane-side (removing the token from the plane's accepted
// set) — a separate concern, out of scope here. This module owns ONLY the
// sidecar-side placement: an operator runs `stackctl plane provision-token
// --token <value>` and the value lands in T118's token custody
// (src/machine-state/token.ts, 0600, machine-local, never in `.stack-control/`).
//
// `provision-token` is the ONLY subaction implemented today. `runPlane` is
// structured as a thin subaction dispatcher precisely so a future sibling
// subaction can be added as its own `run<Subaction>` + one more dispatch arm
// without disturbing this one. T124 wires the top-level `plane` verb into
// the CLI dispatcher; this module owns only the verb's own logic.
//
// STRICT ARG PARSING mirrors execute-check.ts's contract (AUDIT-20260605-09,
// "no flag silently ignored"): an unknown flag, a missing `--token` value, a
// stray positional, or a missing/unknown subaction is a usage error — exit 2,
// never a silently-accepted no-op.
//
// THE TOKEN IS A CREDENTIAL (contracts/sidecar-plane-protocol.md § C6) — this
// verb never echoes it to stdout/stderr, on success or otherwise; only a
// confirmation message is printed.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 module resolution (no `@/` alias configured).

import { join } from 'node:path';
import { locateMachineState } from '../machine-state/locate.js';
import { openTokenCustody } from '../machine-state/token.js';
import { mintOrReadInstallationId } from '../machine-state/identity.js';
import { createPlaneRuntime } from '../plane/runtime.js';
import { buildServeRuntimeOptions } from './plane-serve-options.js';
import type { SubactionGrammar } from './document-verb-shared.js';

const USAGE = 'usage: plane provision-token --token <value>';
const PLANE_USAGE = 'usage: plane <provision-token | serve> [...]';
const SERVE_USAGE = 'usage: plane serve --port <n> --token <accepted-bearer>';

/**
 * The `plane` verb's per-subaction grammar — read by the cli-help surface
 * builder (`src/cli-help/surfaces/fleet.ts`, T120-T125) so `--help` cannot
 * drift from what `parseProvisionTokenArgs`/`parseServeArgs` actually accept.
 * This is DESCRIPTIVE metadata only: it feeds the help-only commander Command
 * `buildGrammarSurfaceCommand` builds; it does not drive `runPlane`'s own
 * strict hand-rolled parsing above, so this module's runtime behavior and
 * exit codes are unchanged by its presence.
 */
export const SUBACTION_SPECS: Readonly<Record<string, SubactionGrammar>> = {
  'provision-token': { valueFlags: ['token'], apply: false, positionals: 0 },
  serve: { valueFlags: ['port', 'token'], apply: false, positionals: 0 },
};

interface ProvisionTokenArgs {
  readonly token: string;
}

// Strict arg parsing for the `provision-token` subaction: accept ONLY
// `--token <value>`; reject a missing value, an unknown flag, or a stray
// positional with exit 2 — a typo must never silently no-op.
function parseProvisionTokenArgs(args: string[]): ProvisionTokenArgs {
  let token: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--token') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`plane provision-token: --token <value> required (${USAGE})\n`);
        process.exit(2);
      }
      token = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(
      `plane provision-token: unexpected argument '${arg}' (${USAGE})\n`,
    );
    process.exit(2);
  }
  if (token === undefined) {
    process.stderr.write(`plane provision-token: --token <value> required (${USAGE})\n`);
    process.exit(2);
  }
  return { token };
}

/**
 * `plane provision-token --token <value>` — the PT-015 operator-run
 * placement verb. Resolves the machine-local store for the current
 * installation (`locateMachineState(process.cwd())`, mirroring cli.ts's own
 * `installationRoot` convention) and writes `token` into T118's token
 * custody at `TOKEN_FILE_MODE` (0600), overwriting any prior value —
 * provisioning and rotation are the same operation.
 */
async function runProvisionToken(args: string[]): Promise<void> {
  const { token } = parseProvisionTokenArgs(args);

  const installationRoot = process.cwd();
  const location = locateMachineState(installationRoot);
  openTokenCustody(location.durableDir).write(token);

  // Confirmation ONLY — never the token value itself (it's a credential).
  process.stdout.write('plane: bearer token provisioned\n');
}

interface ServeArgs {
  readonly port: number;
  readonly token: string;
}

// Strict arg parsing for `serve`: require `--port <n>` and `--token <value>`;
// reject a missing value, an unknown flag, or a stray positional with exit 2
// (mirrors execute-check.ts / provision-token — no flag silently ignored).
function parseServeArgs(args: string[]): ServeArgs {
  let port: number | undefined;
  let token: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--port') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`plane serve: --port <n> required (${SERVE_USAGE})\n`);
        process.exit(2);
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        process.stderr.write(`plane serve: --port must be an integer in 0..65535, got '${value}'\n`);
        process.exit(2);
      }
      port = parsed;
      i++; // consume the value
      continue;
    }
    if (arg === '--token') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`plane serve: --token <value> required (${SERVE_USAGE})\n`);
        process.exit(2);
      }
      token = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(`plane serve: unexpected argument '${arg}' (${SERVE_USAGE})\n`);
    process.exit(2);
  }
  if (port === undefined) {
    process.stderr.write(`plane serve: --port <n> required (${SERVE_USAGE})\n`);
    process.exit(2);
  }
  if (token === undefined) {
    process.stderr.write(`plane serve: --token <value> required (${SERVE_USAGE})\n`);
    process.exit(2);
  }
  return { port, token };
}

/**
 * `plane serve --port <n> --token <accepted>` — start the runnable plane the
 * dogfood drives. Builds the runtime options via `buildServeRuntimeOptions`
 * (the shared, tested assembly), which seeds the runtime's accepted-token set
 * with the single `--token` mapped to THIS installation's id
 * (`mintOrReadInstallationId`) AND binds that token to this installation's
 * `host:path` instance identity (`deriveInstanceId(installationRoot)`, D8) so
 * the T038 instance-mismatch check (`refuseInstanceMismatch`) is LIVE on the
 * real serve path — an ingest claiming a DIFFERENT `host:path` is refused 403
 * (AUDIT-20260719-01). Roots the durable command + late-event stores under the
 * machine-local durable dir, and listens on `--port`. The process stays alive
 * holding the server open (Ctrl-C / SIGTERM to stop).
 *
 * SEAM (flagged, not silently deferred): the accepted-token source is a
 * SINGLE `--token`. A multi-installation fleet needs a per-installation
 * accepted-token registry (a file the operator provisions via
 * `provision-token` on each host, read here) — out of scope for the
 * single-operator dogfood (FR-078); the runtime already accepts a full
 * `ReadonlyMap<token, installationId>`, so widening `serve` is additive.
 */
async function runServe(args: string[]): Promise<void> {
  const { port, token } = parseServeArgs(args);

  const installationRoot = process.cwd();
  const location = locateMachineState(installationRoot);
  const installationId = mintOrReadInstallationId(installationRoot);
  const commandStoreDir = join(location.durableDir, 'plane', 'commands');

  const runtime = createPlaneRuntime(
    buildServeRuntimeOptions({
      tokens: [token],
      installationId,
      installationRoot,
      commandStoreDir,
    }),
  );
  const server = runtime.createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      // The bound port (relevant when --port 0 chose an ephemeral one) — the
      // token itself is a credential and is NEVER echoed.
      const address = server.address();
      const boundPort = typeof address === 'object' && address !== null ? address.port : port;
      process.stdout.write(`plane: serving on port ${boundPort}\n`);
      resolve();
    });
  });

  // Hold the process open until the server closes (signal-driven).
  await new Promise<void>((resolve) => {
    server.once('close', () => resolve());
  });
}

/**
 * `stackctl plane <subaction> [...]`. Subactions: `provision-token` (PT-015)
 * and `serve` (T124). A missing or unrecognized subaction is a usage error
 * (exit 2), matching every other stackctl verb's strict-arg contract.
 */
export async function runPlane(args: string[]): Promise<void> {
  const [subaction, ...rest] = args;

  if (subaction === undefined) {
    process.stderr.write(`plane: subcommand required (${PLANE_USAGE})\n`);
    process.exit(2);
  }

  if (subaction === 'provision-token') {
    await runProvisionToken(rest);
    return;
  }

  if (subaction === 'serve') {
    await runServe(rest);
    return;
  }

  process.stderr.write(`plane: unknown subcommand '${subaction}' (${PLANE_USAGE})\n`);
  process.exit(2);
}
