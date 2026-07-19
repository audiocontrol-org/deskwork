// Shared test helper — AUDIT-20260719-12 fix.
//
// WHY THIS EXISTS: `node:http`/`node:net` `Server#address()` already
// returns `AddressInfo | string | null` — no cast is needed to work with
// it. The 037-instance-observability test files were writing
// `server.address() as AddressInfo | string | null` (a redundant no-op
// cast) and, worse, `(address as AddressInfo).port` (an UNSAFE cast that
// bypasses the preceding null/string guard entirely) — both violate this
// project's strict "no `as`" convention (Constitution Principle VI), which
// those same test files' header comments claim to honor. This helper
// narrows via a real runtime guard the type system can verify, so callers
// reach `.port` with zero casts.
//
// Leading-underscore filename keeps vitest from collecting this as a test
// file (mirrors tests/fleet/_server-fixture.ts's convention; vitest.config.ts
// only collects `**/*.test.ts`).
//
// Relative `.js` imports under node16 resolution — no `@/` alias configured
// in this plugin (matches sibling fixtures).

import type { Server } from 'node:http';

/**
 * Returns the bound TCP port for a `node:http` (or `node:net`) `Server`
 * already `listen()`ing on an ephemeral (or explicit) port. Throws if the
 * server is not bound to a TCP address (e.g. a Unix socket path, or not
 * yet listening) — the same failure mode every 037 test's inline guard
 * already threw on, just without the cast that used to sit next to it.
 */
export function boundPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`boundPort: expected a bound TCP AddressInfo, got ${String(address)}`);
  }
  return address.port; // narrowed to AddressInfo by the guard above — no cast
}
