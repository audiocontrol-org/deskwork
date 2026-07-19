// specs/037-instance-observability — AUDIT-20260719-01 (RED→GREEN). The
// serve-path runtime-options assembly, factored into a PURE helper so both
// `runServe` (src/subcommands/plane.ts) and its test build the runtime the
// SAME way. Before this factoring, `runServe` constructed the runtime with
// only `acceptedTokens` + `commandStoreDir` and NEVER `acceptedInstances`, so
// the T038 token→`host:path` instance-mismatch check (`refuseInstanceMismatch`)
// was DEAD in production — `stackctl plane serve` accepted telemetry for ANY
// `envelope.host:path` as long as the token + installationId matched. Only
// tests injected `acceptedInstances`, so the protection never ran for real
// adopters.
//
// THE FIX: bind each served token to the served installation's `host:path`
// (D8, `deriveInstanceId(installationRoot)`) ALONGSIDE its installationId
// authorization — never replacing it (D8: `installationId` stays the durable,
// path-independent identity; the `host:path` composite names "this checkout on
// this machine"). The plane serves ONE installation, so every provisioned
// token is bound to the SAME served `host:path`.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 module resolution (no `@/` alias configured).

import { deriveInstanceId } from '../machine-state/instance-id.js';
import type { PlaneRuntimeOptions } from '../plane/runtime.js';

export interface ServeRuntimeParams {
  /** The accepted bearer token(s) provisioned for this served installation.
   * Each is bound to BOTH the installationId and the served `host:path`. The
   * plane serves ONE installation, so all tokens share the same instance id. */
  readonly tokens: readonly string[];
  /** The served installation's durable, path-independent identity (D8). */
  readonly installationId: string;
  /** The served installation's root — the `host:path` instance identity (D8)
   * is derived from it via {@link deriveInstanceId}. */
  readonly installationRoot: string;
  /** Directory backing the durable command + late-event stores. */
  readonly commandStoreDir: string;
}

/**
 * Assemble the {@link PlaneRuntimeOptions} the real `plane serve` path uses.
 * Binds every provisioned token to the served installation's installationId
 * (`acceptedTokens`) AND its `host:path` instance identity (`acceptedInstances`,
 * derived once from `installationRoot`), so the T038 instance-mismatch check is
 * LIVE on the real serve path — an ingest whose envelope claims a DIFFERENT
 * `host:path` than the served installation is refused 403.
 */
export function buildServeRuntimeOptions(params: ServeRuntimeParams): PlaneRuntimeOptions {
  const instanceId = deriveInstanceId(params.installationRoot);
  const acceptedTokens = new Map<string, string>();
  const acceptedInstances = new Map<string, string>();
  for (const token of params.tokens) {
    acceptedTokens.set(token, params.installationId);
    acceptedInstances.set(token, instanceId);
  }
  return {
    acceptedTokens,
    acceptedInstances,
    commandStoreDir: params.commandStoreDir,
  };
}
