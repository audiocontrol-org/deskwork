// Mounted-verb declarations for the fleet-control-plane family (036 T120-T125,
// rewired 037 Task 5; FR-003 non-drift). Two multi-subaction verbs:
//
//   - `plane` (src/subcommands/plane.ts) — `serve` (start the runnable plane
//     HTTP endpoint, boot against the fleet registry), `issue-enrollment`
//     (mint + register a fresh host enrollment credential, printed once),
//     and `revoke` (revoke a telemetry token or an enrollment credential,
//     effective at the next `serve`). The prior `provision-token` subaction
//     was DELETED (clean break, no back-compat alias) when `serve` moved
//     onto the fleet registry (037 Task 5): accepted tokens now come from
//     enrollment (`POST /v1/enroll`), not an operator-run CLI verb.
//   - `sidecar` (src/subcommands/sidecar.ts) — `run` (elect + run the
//     sidecar daemon for this installation) and `set-enrollment` (store the
//     operator-issued enrollment credential in host-level custody, for a
//     later self-enroll).
//
// Both are built via `buildGrammarSurfaceCommand`, driven by each module's own
// exported `SUBACTION_SPECS` (the same non-drift pattern `backlog`/`inbox` use
// in `mounted-verbs.ts`) — the help surface is read FROM the grammar, never
// hand-transcribed, so it cannot drift from the flags documented alongside
// each verb's real (hand-rolled) parser. Neither verb's runtime dispatcher is
// driven by `SUBACTION_SPECS`; it is descriptive metadata for the help surface
// only, so this file changes zero runtime parsing behavior.
//
// Mediation (Decision 4 — declared, never inferred): every subaction here is
// MUTATING —
//   - `plane serve` opens a network service and writes the durable command
//     store under the machine-local durable dir.
//   - `sidecar run` spawns/binds a local socket and writes the sidecar's spool.
//   - `sidecar set-enrollment` writes the enrollment credential into the
//     host-level durable dir.
// Neither verb is claimed as a `CAPABILITY_REGISTRY` `cliArgv0` backend
// identity, so `check-front-door`'s C2c treats both as first-class stackctl
// verbs (mediation N/A) — declaring `mutating` here is still required so
// `command-surface.ts`'s `requireSubActionMediation` guard does not throw.

import { SUBACTION_SPECS as PLANE_SPECS } from '../../subcommands/plane.js';
import { SUBACTION_SPECS as SIDECAR_SPECS } from '../../subcommands/sidecar.js';
import type { MediationClass, MountedVerb } from '../command-surface.js';
import { buildGrammarSurfaceCommand } from '../surface-builder.js';

const PLANE_MEDIATION: Readonly<Record<string, MediationClass>> = {
  serve: 'mutating',
  'issue-enrollment': 'mutating',
  revoke: 'mutating',
};

const SIDECAR_MEDIATION: Readonly<Record<string, MediationClass>> = {
  run: 'mutating',
  'set-enrollment': 'mutating',
};

/** The fleet-control-plane mounted verbs (`plane`, `sidecar`). */
export const FLEET_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildGrammarSurfaceCommand({
        verb: 'plane',
        description:
          'The fleet control plane: serve the plane HTTP endpoint, booting against the fleet registry (accepted tokens come from enrollment, not a CLI-provisioned token).',
        specs: PLANE_SPECS,
        summaries: {
          serve: 'start the runnable plane HTTP endpoint, listening on --port until stopped',
          'issue-enrollment':
            'mint a fresh enrollment credential and register it in the fleet registry',
          revoke:
            'revoke a telemetry token or an enrollment credential (effective at next plane serve)',
        },
        flagDescriptions: {
          port: 'TCP port to listen on (serve; required)',
          label: 'optional operator label for the credential (e.g. the remote host name)',
          token: 'a telemetry token to revoke (revoke; mutually exclusive with --enrollment)',
          enrollment: 'an enrollment credential to revoke (revoke; mutually exclusive with --token)',
        },
      }),
    meta: { deprecatedAliasOf: null, subActionMediation: PLANE_MEDIATION },
  },
  {
    build: () =>
      buildGrammarSurfaceCommand({
        verb: 'sidecar',
        description:
          'The per-installation sidecar daemon: elects, spools local telemetry, and uplinks to the fleet control plane.',
        specs: SIDECAR_SPECS,
        summaries: {
          run: 'elect + run the sidecar daemon for this installation, staying alive until SIGINT/SIGTERM',
          'set-enrollment':
            'store the operator-issued enrollment credential in host-level custody, for a later self-enroll',
        },
        flagDescriptions: {
          'plane-url': 'the plane\'s base URL (else falls back to STACKCTL_CP_URL)',
          token: 'the enrollment credential to store (set-enrollment; required)',
        },
      }),
    meta: { deprecatedAliasOf: null, subActionMediation: SIDECAR_MEDIATION },
  },
];
