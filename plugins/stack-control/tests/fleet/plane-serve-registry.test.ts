// specs/037-instance-observability (plan: docs/superpowers/plans/
// 2026-07-20-fleet-multihost-enrollment.md) — Task 5.
//
// Proves `plane serve`'s runtime construction is wired to the FLEET REGISTRY
// (Task 1) rather than the deleted single-`--token` path: `buildServeRuntime`
// loads (creating if absent) the registry rooted at the installation's
// machine-local durable dir, and — because a fresh registry has no
// enrollment credentials yet — seeds a loopback credential into THIS HOST's
// enrollment custody (`enrollment-custody.ts`, `locateHostState().durableDir`)
// so a sidecar on this host can self-enroll immediately after first boot.
//
// Real filesystem, real temp dirs (.claude/rules/testing.md) — no mocked fs.
// The machine-local store is redirected for the whole file via
// `useMachineStateStore()` (T009) so this test never touches a real
// developer's `$HOME`. Relative `.js` imports under node16 module resolution
// (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServeRuntime } from '../../src/subcommands/plane.js';
import { openEnrollmentCustody } from '../../src/machine-state/enrollment-custody.js';
import { locateHostState } from '../../src/machine-state/locate.js';
import { useMachineStateStore } from './_machine-state-harness.js';

const IS_WIN = process.platform === 'win32';

describe('plane serve on the fleet registry (Task 5)', () => {
  useMachineStateStore();

  it('seeds a loopback enrollment credential into host custody on first serve', () => {
    const base = IS_WIN ? tmpdir() : '/tmp';
    const root = mkdtempSync(join(base, 'scf-serve-'));
    try {
      const built = buildServeRuntime(root);
      expect(built.runtime).toBeDefined();

      const seeded = openEnrollmentCustody(locateHostState().durableDir).read();
      expect(seeded).toBeDefined();
      // mintCredential() = randomBytes(32).toString('base64url') — 32 bytes
      // base64url-encoded is always 43 chars, no padding.
      expect(seeded).toMatch(/^[A-Za-z0-9_-]{43}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does NOT mint a second loopback credential on a second buildServeRuntime call (idempotent boot)', () => {
    const base = IS_WIN ? tmpdir() : '/tmp';
    const root = mkdtempSync(join(base, 'scf-serve-'));
    try {
      buildServeRuntime(root);
      const first = openEnrollmentCustody(locateHostState().durableDir).read();

      buildServeRuntime(root);
      const second = openEnrollmentCustody(locateHostState().durableDir).read();

      expect(second).toBe(first);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
