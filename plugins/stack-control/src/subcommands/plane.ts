// specs/037-instance-observability (plan: docs/superpowers/plans/
// 2026-07-20-fleet-multihost-enrollment.md) — Task 5.
//
// `plane serve` now boots against the FLEET REGISTRY (Task 1's
// `loadFleetRegistry`) rather than a single operator-provisioned `--token`.
// This is a CLEAN BREAK (no back-compat shim): the old `provision-token`
// subaction and its single-token `--token` binding on `serve` are DELETED —
// per-installation accepted tokens/instances now come from the registry's
// live `activeTokens()` / `instanceBindings()` maps, populated by enrollment
// (`POST /v1/enroll`, Task 2/3) rather than an operator-run CLI verb.
//
// LOOPBACK SELF-ENROLLMENT: on first serve (no enrollment credentials yet
// registered), `buildServeRuntime` mints one, adds it to the registry, and
// writes it into the HOST-level enrollment custody
// (`locateHostState().durableDir`, `enrollment-custody.ts`) — the exact
// credential a sidecar on THIS host reads to self-enroll. This is the same
// path a remote host's operator-issued credential takes; host A's own
// sidecars enroll through it identically, no privileged shortcut.
//
// `plane` is a thin subaction dispatcher — `serve` is its only subaction
// today. STRICT ARG PARSING mirrors execute-check.ts's contract
// (AUDIT-20260605-09, "no flag silently ignored"): an unknown flag, a
// missing `--port` value, a stray positional, or a missing/unknown
// subaction is a usage error — exit 2, never a silently-accepted no-op.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 module resolution (no `@/` alias configured).

import { join } from 'node:path';
import { locateHostState, locateMachineState } from '../machine-state/locate.js';
import { mintOrReadInstallationId } from '../machine-state/identity.js';
import { openEnrollmentCustody } from '../machine-state/enrollment-custody.js';
import { createPlaneRuntime, type PlaneRuntime } from '../plane/runtime.js';
import { loadFleetRegistry, mintCredential } from '../plane/fleet-registry.js';
import { createEnrollHandler } from '../plane/http/enroll.js';
import type { SubactionGrammar } from './document-verb-shared.js';

const PLANE_USAGE = 'usage: plane serve [...]';
const SERVE_USAGE = 'usage: plane serve --port <n>';

/**
 * The `plane` verb's per-subaction grammar — read by the cli-help surface
 * builder (`src/cli-help/surfaces/fleet.ts`) so `--help` cannot drift from
 * what `parseServeArgs` actually accepts. DESCRIPTIVE metadata only: it
 * feeds the help-only commander Command `buildGrammarSurfaceCommand` builds;
 * it does not drive `runPlane`'s own strict hand-rolled parsing below, so
 * this module's runtime behavior and exit codes are unchanged by its
 * presence.
 */
export const SUBACTION_SPECS: Readonly<Record<string, SubactionGrammar>> = {
  serve: { valueFlags: ['port'], apply: false, positionals: 0 },
};

interface ServeArgs {
  readonly port: number;
}

// Strict arg parsing for `serve`: require `--port <n>`; reject a missing
// value, an unknown flag, or a stray positional with exit 2 (mirrors
// execute-check.ts — no flag silently ignored).
function parseServeArgs(args: string[]): ServeArgs {
  let port: number | undefined;
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
    process.stderr.write(`plane serve: unexpected argument '${arg}' (${SERVE_USAGE})\n`);
    process.exit(2);
  }
  if (port === undefined) {
    process.stderr.write(`plane serve: --port <n> required (${SERVE_USAGE})\n`);
    process.exit(2);
  }
  return { port };
}

/**
 * Build the runnable plane runtime for `installationRoot`'s fleet registry
 * (Task 1's `loadFleetRegistry`, rooted at `<durableDir>/plane/fleet/`).
 * Pure assembly, factored out of `runServe` so a test can prove the wiring
 * (registry load + loopback seed + runtime construction) without binding a
 * real socket.
 *
 * LOOPBACK SEED: when the registry has no enrollment credentials yet (the
 * very first `plane serve` for this installation), mints one, registers it
 * (`registry.addCredential(seed, 'local')`), and writes it into this HOST's
 * enrollment custody (`locateHostState().durableDir`) — the same file a
 * sidecar on this host reads to self-enroll (`enrollment-custody.ts`).
 */
export function buildServeRuntime(installationRoot: string): { readonly runtime: PlaneRuntime } {
  const location = locateMachineState(installationRoot);
  // Ensure this installation's identity is minted before the plane serves —
  // mirrors the prior `runServe`'s eager mint (side effect only; the id
  // itself is not threaded into the registry-backed runtime options below).
  mintOrReadInstallationId(installationRoot);

  const planeDurableDir = join(location.durableDir, 'plane');
  const registry = loadFleetRegistry(planeDurableDir);

  if (registry.enrollmentCredentials().size === 0) {
    const seed = mintCredential();
    registry.addCredential(seed, 'local');
    openEnrollmentCustody(locateHostState().durableDir).write(seed);
  }

  const runtime = createPlaneRuntime({
    acceptedTokens: registry.activeTokens(),
    acceptedInstances: registry.instanceBindings(),
    revokedTokens: registry.revokedTokens(),
    commandStoreDir: join(planeDurableDir, 'commands'),
    enrollment: { handler: createEnrollHandler(registry) },
  });

  return { runtime };
}

/**
 * `plane serve --port <n>` — start the runnable plane the dogfood drives.
 * Builds the runtime from the fleet registry (`buildServeRuntime`) and
 * listens on `--port`. The process stays alive holding the server open
 * (Ctrl-C / SIGTERM to stop).
 */
async function runServe(args: string[]): Promise<void> {
  const { port } = parseServeArgs(args);

  const { runtime } = buildServeRuntime(process.cwd());
  const server = runtime.createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.removeListener('error', reject);
      // The bound port (relevant when --port 0 chose an ephemeral one).
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
 * `stackctl plane <subaction> [...]`. `serve` is the only subaction. A
 * missing or unrecognized subaction is a usage error (exit 2), matching
 * every other stackctl verb's strict-arg contract.
 */
export async function runPlane(args: string[]): Promise<void> {
  const [subaction, ...rest] = args;

  if (subaction === undefined) {
    process.stderr.write(`plane: subcommand required (${PLANE_USAGE})\n`);
    process.exit(2);
  }

  if (subaction === 'serve') {
    await runServe(rest);
    return;
  }

  process.stderr.write(`plane: unknown subcommand '${subaction}' (${PLANE_USAGE})\n`);
  process.exit(2);
}
