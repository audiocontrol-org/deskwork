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

const PLANE_USAGE =
  'usage: plane serve [...] | plane issue-enrollment [--label <host>] | plane revoke (--token <t> | --enrollment <e>)';
const SERVE_USAGE = 'usage: plane serve --port <n>';
const ISSUE_ENROLLMENT_USAGE = 'usage: plane issue-enrollment [--label <host>]';
const REVOKE_USAGE = 'usage: plane revoke (--token <t> | --enrollment <e>)';

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
  'issue-enrollment': { valueFlags: ['label'], apply: false, positionals: 0 },
  revoke: { valueFlags: ['token', 'enrollment'], apply: false, positionals: 0 },
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

interface IssueEnrollmentArgs {
  readonly label: string | undefined;
}

// Strict arg parsing for `issue-enrollment`: optional `--label <value>`;
// reject a missing value, an unknown flag, or a stray positional with exit 2
// (mirrors `parseServeArgs` above — no flag silently ignored).
function parseIssueEnrollmentArgs(args: string[]): IssueEnrollmentArgs {
  let label: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--label') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`plane issue-enrollment: --label <host> requires a value (${ISSUE_ENROLLMENT_USAGE})\n`);
        process.exit(2);
      }
      label = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(`plane issue-enrollment: unexpected argument '${arg}' (${ISSUE_ENROLLMENT_USAGE})\n`);
    process.exit(2);
  }
  return { label };
}

/**
 * `plane issue-enrollment [--label <host>]` — mint a fresh enrollment
 * credential on THIS plane host, register it in the fleet registry, and
 * print it once to stdout. This is the one secret the operator carries to a
 * foreign host's sidecar so it can self-enroll (`POST /v1/enroll`); unlike a
 * telemetry token (never echoed — see `no-creds-in-cli.test.ts`), printing
 * the enrollment credential here is the intended, correct behavior — there
 * is no other channel for the operator to retrieve it.
 */
async function runIssueEnrollment(args: string[]): Promise<void> {
  const { label } = parseIssueEnrollmentArgs(args);

  const root = process.cwd();
  const location = locateMachineState(root);
  const registry = loadFleetRegistry(join(location.durableDir, 'plane'));

  const credential = mintCredential();
  registry.addCredential(credential, label ?? 'unlabeled');

  process.stdout.write(`plane: minted enrollment credential (label: ${label ?? 'unlabeled'})\n`);
  process.stdout.write(`${credential}\n`);
}

interface RevokeArgs {
  readonly token: string | undefined;
  readonly enrollment: string | undefined;
}

// Strict arg parsing for `revoke`: EXACTLY ONE of `--token <value>` or
// `--enrollment <value>` is required. Both or neither, a missing value, an
// unknown flag, or a stray positional is a usage error — exit 2 (mirrors
// `parseServeArgs`/`parseIssueEnrollmentArgs` above — no flag silently
// ignored).
function parseRevokeArgs(args: string[]): RevokeArgs {
  let token: string | undefined;
  let enrollment: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--token') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`plane revoke: --token <t> requires a value (${REVOKE_USAGE})\n`);
        process.exit(2);
      }
      token = value;
      i++; // consume the value
      continue;
    }
    if (arg === '--enrollment') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`plane revoke: --enrollment <e> requires a value (${REVOKE_USAGE})\n`);
        process.exit(2);
      }
      enrollment = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(`plane revoke: unexpected argument '${arg}' (${REVOKE_USAGE})\n`);
    process.exit(2);
  }
  if (token === undefined && enrollment === undefined) {
    process.stderr.write(`plane revoke: exactly one of --token or --enrollment is required (${REVOKE_USAGE})\n`);
    process.exit(2);
  }
  if (token !== undefined && enrollment !== undefined) {
    process.stderr.write(`plane revoke: --token and --enrollment are mutually exclusive (${REVOKE_USAGE})\n`);
    process.exit(2);
  }
  return { token, enrollment };
}

/**
 * `plane revoke (--token <t> | --enrollment <e>)` — revoke a telemetry
 * token (an enrolled instance stops being accepted) or an enrollment
 * credential (no new enrollment from that host). Exactly one of the two is
 * required. Unlike `issue-enrollment`, revoke's argument is a secret the
 * operator already holds (they're revoking it, not retrieving it) — it is
 * NOT echoed back to stdout, matching the never-echo-telemetry-tokens
 * contract (`no-creds-in-cli.test.ts`).
 *
 * SCOPE NOTE: the revocation is written to the registry (`enrollment.json`)
 * and takes effect at the NEXT `plane serve` — the running plane snapshots
 * its accepted set at startup (`buildServeRuntime`). Live revocation
 * without restart is a named follow-on in the design's Scope Boundary, not
 * implemented here.
 */
async function runRevoke(args: string[]): Promise<void> {
  const { token, enrollment } = parseRevokeArgs(args);

  const root = process.cwd();
  const location = locateMachineState(root);
  const registry = loadFleetRegistry(join(location.durableDir, 'plane'));

  if (token !== undefined) {
    registry.revokeToken(token);
    process.stdout.write('plane: token revoked (effective at next plane serve)\n');
    return;
  }

  // enrollment is guaranteed defined here (parseRevokeArgs enforces
  // exactly-one-of), but TypeScript can't see that across the branch —
  // narrow explicitly rather than reaching for a non-null assertion.
  if (enrollment !== undefined) {
    registry.revokeCredential(enrollment);
    process.stdout.write('plane: enrollment credential revoked (effective at next plane serve)\n');
    return;
  }
}

/**
 * `stackctl plane <subaction> [...]`. `serve`, `issue-enrollment`, and
 * `revoke` are the subactions. A missing or unrecognized subaction is a
 * usage error (exit 2), matching every other stackctl verb's strict-arg
 * contract.
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

  if (subaction === 'issue-enrollment') {
    await runIssueEnrollment(rest);
    return;
  }

  if (subaction === 'revoke') {
    await runRevoke(rest);
    return;
  }

  process.stderr.write(`plane: unknown subcommand '${subaction}' (${PLANE_USAGE})\n`);
  process.exit(2);
}
