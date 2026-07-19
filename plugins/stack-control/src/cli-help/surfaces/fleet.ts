// Mounted-verb declarations for the fleet-control-plane family (036 T120-T125;
// FR-003 non-drift). Two multi-subaction verbs:
//
//   - `plane` (src/subcommands/plane.ts) — `provision-token` (place the
//     accepted-bearer token into machine-local token custody) and `serve`
//     (start the runnable plane HTTP endpoint).
//   - `sidecar` (src/subcommands/sidecar.ts) — `run` (elect + run the
//     sidecar daemon for this installation).
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
//   - `plane provision-token` writes token custody (a credential) to disk.
//   - `plane serve` opens a network service and writes the durable command
//     store under the machine-local durable dir.
//   - `sidecar run` spawns/binds a local socket and writes the sidecar's spool.
// Neither verb is claimed as a `CAPABILITY_REGISTRY` `cliArgv0` backend
// identity, so `check-front-door`'s C2c treats both as first-class stackctl
// verbs (mediation N/A) — declaring `mutating` here is still required so
// `command-surface.ts`'s `requireSubActionMediation` guard does not throw.

import { SUBACTION_SPECS as PLANE_SPECS } from '../../subcommands/plane.js';
import { SUBACTION_SPECS as SIDECAR_SPECS } from '../../subcommands/sidecar.js';
import type { MediationClass, MountedVerb } from '../command-surface.js';
import { buildGrammarSurfaceCommand } from '../surface-builder.js';

const PLANE_MEDIATION: Readonly<Record<string, MediationClass>> = {
  'provision-token': 'mutating',
  serve: 'mutating',
};

const SIDECAR_MEDIATION: Readonly<Record<string, MediationClass>> = {
  run: 'mutating',
};

/** The fleet-control-plane mounted verbs (`plane`, `sidecar`). */
export const FLEET_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildGrammarSurfaceCommand({
        verb: 'plane',
        description:
          'The fleet control plane: provision the accepted bearer token into machine-local custody, or serve the plane HTTP endpoint.',
        specs: PLANE_SPECS,
        summaries: {
          'provision-token': 'place a bearer token into this installation\'s machine-local token custody (PT-015)',
          serve: 'start the runnable plane HTTP endpoint, listening on --port until stopped',
        },
        flagDescriptions: {
          token: 'the bearer token value (provision-token: the token to store; serve: the accepted bearer)',
          port: 'TCP port to listen on (serve; required)',
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
        },
        flagDescriptions: {
          'plane-url': 'the plane\'s base URL (else falls back to STACKCTL_CP_URL)',
        },
      }),
    meta: { deprecatedAliasOf: null, subActionMediation: SIDECAR_MEDIATION },
  },
];
