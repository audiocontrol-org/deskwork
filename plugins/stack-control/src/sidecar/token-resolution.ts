// src/sidecar/token-resolution.ts
//
// specs/036-fleet-control-plane Task 10 (auto-enroll) — extracted from
// daemon.ts to keep that module under the file-size cap. Resolves the
// EFFECTIVE telemetry bearer token for one installation: a machine-local
// token-custody read is the common, already-provisioned path; when it is
// ABSENT and a plane URL is configured, fall back to the HOST-level
// enrollment credential (`sidecar set-enrollment`) and self-enroll via the
// injected `enroll` seam, persisting the issued token into the SAME custody
// every other path reads.
//
// A DECLINED credential, a FAILED enroll exchange, or no plane URL at all all
// resolve to `undefined` — the caller (daemon.ts) leaves the uplink idle; the
// local socket + WAL keep running regardless. This module never throws on a
// failed/absent enroll outcome — `enroll` itself is contracted to return
// `{ok:false, status}` rather than reject (see enroll-client.ts).
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias configured).

import { locateHostState, type MachineStateLocation } from '../machine-state/locate.js';
import { openTokenCustody } from '../machine-state/token.js';
import { openEnrollmentCustody } from '../machine-state/enrollment-custody.js';
import type { EnrollArgs, EnrollResult } from './enroll-client.js';

/** Inputs to {@link resolveTelemetryToken}. */
export interface ResolveTelemetryTokenArgs {
  /** The located machine-local store for this installation (durable dir keys
   * the token custody). */
  readonly location: MachineStateLocation;
  /** The control plane URL, if configured. Absent/empty ⇒ auto-enroll never
   * attempted; only an already-provisioned custody token can resolve. */
  readonly planeUrl: string | undefined;
  readonly installationId: string;
  /** This installation's instance identity (host:path, D8) — threaded into
   * the enroll exchange so the plane can key the issued token accordingly. */
  readonly instanceHost: string;
  readonly instancePath: string;
  /** The self-enrollment seam (production: `enrollInstance`, ./enroll-
   * client.js — POST /v1/enroll). Tests inject a fake so no network is hit. */
  readonly enroll: (args: EnrollArgs) => Promise<EnrollResult>;
}

/**
 * Resolve the effective telemetry bearer token: custody read, else
 * auto-enroll from a host enrollment credential. Returns `undefined` when
 * neither path yields a token — the caller keeps the uplink idle.
 */
export async function resolveTelemetryToken(
  args: ResolveTelemetryTokenArgs,
): Promise<string | undefined> {
  const { location, planeUrl, installationId, instanceHost, instancePath, enroll } = args;

  let token = openTokenCustody(location.durableDir).read();
  if (token === undefined && planeUrl !== undefined && planeUrl.length > 0) {
    const credential = openEnrollmentCustody(locateHostState().durableDir).read();
    if (credential !== undefined) {
      const result = await enroll({
        planeUrl,
        credential,
        identity: { installationId, host: instanceHost, path: instancePath },
      });
      if (result.ok) {
        openTokenCustody(location.durableDir).write(result.token);
        token = result.token;
      }
    }
  }
  return token;
}
