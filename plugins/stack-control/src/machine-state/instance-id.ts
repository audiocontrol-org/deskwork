// specs/037-instance-observability — T005 (impl), pairs with T004's RED
// test (tests/instance/instance-id.test.ts).
//
// deriveInstanceId(installationRoot: string): string — mints the instance
// identity `host:path` composite key per data-model.md § Instance Identity
// (D8).
//
// CONTRACT (data-model.md D8): returns `${host}:${realpath}` where
// host = os.hostname() and realpath = fs.realpathSync.native(installationRoot)
// (canonicalized — resolves `..` segments and symlinks to the real dir).
//
// PURE DERIVATION, NOT PERSISTED IDENTITY: unlike `installationId`
// (identity.ts, minted once and persisted machine-locally per FR-031/032),
// this id is recomputed on every call from ambient state (hostname + real
// path) — no file is read or written. It is ADDITIVE alongside
// `installationId`, not a replacement: `installationId` is the durable,
// path-independent identity; `deriveInstanceId` is the git-safe, host+path
// composite key used where the caller needs to name "this checkout on this
// machine" without touching the machine-local durable store.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 module resolution (no `@/` alias configured).

import { realpathSync } from 'node:fs';
import { hostname } from 'node:os';

/**
 * Derive the `host:path` instance identity for `installationRoot`. Pure —
 * reads only ambient OS state (hostname) and resolves the real path via
 * `fs.realpathSync.native` (canonicalizes `..` segments and symlinks); never
 * reads or writes any file inside `installationRoot`. Stable across calls
 * for the same input; distinct hosts or distinct real paths always yield
 * distinct ids.
 */
export function deriveInstanceId(installationRoot: string): string {
  const host = hostname();
  const realpath = realpathSync.native(installationRoot);
  return `${host}:${realpath}`;
}

/**
 * Split the `host:path` identity {@link deriveInstanceId} mints (§ D8) into its
 * two fields. `host` (os.hostname()) never contains a `:`, so the FIRST colon is
 * the separator and everything after it is the real path (which, on Windows,
 * legitimately carries its own `C:` drive colon — hence splitting on the first
 * colon only, never `split(':')`). Reuses the single derivation site so the two
 * never drift — the sidecar's session-liveness heartbeat and the event envelope
 * both name the SAME `host`/`path` (AUDIT-20260719-21).
 */
export function deriveInstanceFields(installationRoot: string): {
  readonly host: string;
  readonly path: string;
} {
  const instanceId = deriveInstanceId(installationRoot);
  const separator = instanceId.indexOf(':');
  if (separator < 0) {
    throw new Error(
      `deriveInstanceFields: deriveInstanceId returned ${JSON.stringify(instanceId)} ` +
        'without a "host:path" separator — cannot split host from path',
    );
  }
  return {
    host: instanceId.slice(0, separator),
    path: instanceId.slice(separator + 1),
  };
}
