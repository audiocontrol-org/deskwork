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

import { locateMachineState } from '../machine-state/locate.js';
import { openTokenCustody } from '../machine-state/token.js';

const USAGE = 'usage: plane provision-token --token <value>';

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

/**
 * `stackctl plane <subaction> [...]`. Today's only subaction is
 * `provision-token` (PT-015). A missing or unrecognized subaction is a
 * usage error (exit 2), matching every other stackctl verb's strict-arg
 * contract.
 */
export async function runPlane(args: string[]): Promise<void> {
  const [subaction, ...rest] = args;

  if (subaction === undefined) {
    process.stderr.write(`plane: subcommand required (${USAGE})\n`);
    process.exit(2);
  }

  if (subaction === 'provision-token') {
    await runProvisionToken(rest);
    return;
  }

  process.stderr.write(`plane: unknown subcommand '${subaction}' (${USAGE})\n`);
  process.exit(2);
}
