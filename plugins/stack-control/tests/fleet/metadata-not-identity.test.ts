// specs/036-fleet-control-plane — T137 (RED guard)
//
// FR-036: hostname, platform, runtime versions, repositoryRemote, workspacePath
// MUST be metadata attached to the installation, never identity. Identity is
// installationId (UUIDv4, minted fresh, path-independent). This guard pins
// that separation as code grows.
//
// data-model.md § Identity (line ~22): "Metadata, never identity (FR-036):
// `hostname`, `platform`, runtime versions, `repositoryRemote`, `workspacePath`.
// `repositoryRemote` + `workspacePath` are *grouping* metadata — a client may
// group installations by repository, but grouping metadata must never be
// treated as authoritative identity."
//
// Edge case (spec.md edge cases): "Two machines hold the same checkout at the
// same filesystem path. They must not collide into one identity — identity is
// minted, never derived from a path."
//
// GUARD STRATEGY:
// ===============
// The guard has two parts: what exists now, and what will be tested when
// metadata fields land in the Event snapshot / Fleet instance types.
//
// PART I (testable now):
//   - mintInstallationId is path-independent (takes no arguments, can't
//     consume metadata; produces UUIDv4 independent of any state).
//   - Identity is purely minted, not derived (two calls produce different UUIDs).
//   - EventEnvelope identity fields are UUIDs (not strings derived from metadata).
//
// PART II (extension point — tested when metadata lands):
//   - IF metadata types are added to types.ts (Snapshot, FleetInstance, etc.),
//     verifiable at that time:
//     1. Identity fields are never derived from metadata fields.
//     2. Grouping metadata (repositoryRemote, workspacePath) are marked as
//        separate from identity, stored separately in event/instance structure.
//     3. No lookup path (sidecar→plane, plane→archive) uses metadata as a key.
//   - IF an src/machine-state/identity.ts is added (per plan.md), verifiable:
//     1. Identity-mint functions take no path parameters.
//     2. Re-mint logic (on clone/copy) does not preserve old identity.
//
// This is an HONEST guard: PART I holds now; PART II will hold when the
// metadata surfaces land. The test documents the invariant so future changes
// catch misuse.

import { describe, expect, it } from 'vitest';
import {
  mintInstallationId,
  mintUuidV7,
  type EventEnvelope,
} from '../../src/fleet/types.js';

// UUID version/variant regexes (RFC 9562)
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('fleet identity: metadata never consumed for identity (T137, FR-036)', () => {
  describe('PART I: Verify path-independence at identity-mint layer', () => {
    it('mintInstallationId is path-independent: takes no arguments', () => {
      // Core guard: the function's own signature forbids path consumption.
      // If someone tried to change it to accept a path, TypeScript would catch
      // the signature change.
      const fn = mintInstallationId;
      expect(fn.length).toBe(0); // no parameters
    });

    it('mintInstallationId generates fresh UUIDs, never derived from metadata', () => {
      // Calling multiple times produces different results (not memoized,
      // not computed from state). This guards against a hypothetical
      // "hash(workspacePath) → installationId" pattern — such a function
      // would return the same result when called from the same directory.
      const id1 = mintInstallationId();
      const id2 = mintInstallationId();
      const id3 = mintInstallationId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);

      // All are UUIDv4 (not derived from predictable state)
      expect(id1).toMatch(UUID_V4_RE);
      expect(id2).toMatch(UUID_V4_RE);
      expect(id3).toMatch(UUID_V4_RE);
    });

    it('mintUuidV7 is path-independent: takes no arguments', () => {
      const fn = mintUuidV7;
      expect(fn.length).toBe(0); // no parameters
    });

    it('mintUuidV7 generates fresh UUIDs, never derived from invocation context', () => {
      // Same guard: multiple calls → different IDs, each a valid UUIDv7.
      const id1 = mintUuidV7();
      const id2 = mintUuidV7();
      const id3 = mintUuidV7();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);

      expect(id1).toMatch(UUID_V7_RE);
      expect(id2).toMatch(UUID_V7_RE);
      expect(id3).toMatch(UUID_V7_RE);
    });

    it('identity values are UUIDs, never encoded-metadata strings', () => {
      // EventEnvelope's identity fields must all be UUIDs. If someone tried
      // to make installationId a "hash of workspace path" or a "derivation
      // of hostname", the RegExp checks below would catch it (the string
      // would not match the UUID shape).
      const env: EventEnvelope = {
        eventId: mintUuidV7(),
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: mintUuidV7(),
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 1,
        type: 'test.event',
        wallClock: new Date().toISOString(),
        monotonicOffsetMs: 0,
        classification: 'live-only',
      };

      // All identity fields are UUIDs (not strings derived from metadata).
      expect(env.eventId).toMatch(UUID_V7_RE);
      expect(env.installationId).toMatch(UUID_V4_RE);
      expect(env.invocationId).toMatch(UUID_V7_RE);
      expect(env.runId).toMatch(UUID_V7_RE);
    });

    it('installationId is UUIDv4; eventId is UUIDv7 (never confused)', () => {
      // data-model.md "`eventId` is identity, NEVER an ordering key" — and
      // installationId is never ordered. The version distinction (v4 vs v7)
      // guards against confusion if both were minted from the same source.
      const installId = mintInstallationId();
      const eventId = mintUuidV7();

      // installationId is v4 (random)
      expect(installId).toMatch(UUID_V4_RE);
      expect(installId).not.toMatch(UUID_V7_RE);

      // eventId is v7 (time-ordered internally, but used as identity not sequencing)
      expect(eventId).toMatch(UUID_V7_RE);
      expect(eventId).not.toMatch(UUID_V4_RE);
    });
  });

  // EXTENSION POINT — strengthen this guard when metadata + identity surfaces land.
  // These are NOT tests yet (a passing `expect(true)` placeholder proves nothing and
  // inflates the green count — it is the IOU anti-pattern). They are a checklist for
  // the task that adds the surface, at which point a REAL assertion replaces each line:
  //
  //   - When `src/machine-state/identity.ts` lands (T024/T026/T030): assert its mint/read
  //     exports take NO path/metadata parameter — no `readInstallationId(workspacePath)`,
  //     no `deriveIdentityFrom(metadata)`, no `hashPathToId(path)`; re-mint uses a fresh
  //     UUID, never a derivation.
  //   - When a Snapshot/FleetInstance type carries metadata (hostname, platform, runtime
  //     versions, repositoryRemote, workspacePath): assert identity fields are never
  //     computed from those metadata fields.
  //   - When the plane ingest path lands (`src/plane/http/ingest.ts`): assert dedup/lookup
  //     keys on `installationId`, never on `(repositoryRemote, workspacePath)` grouping
  //     metadata (two hosts sharing a repo must not collide).

  describe('Edge case: clone/copy preserves no identity', () => {
    it('mintInstallationId is re-minting compatible (no state preserved across calls)', () => {
      // Edge case (spec.md): "An installation tree is cloned or copied to
      // another host. Identity must not travel with the tree: the copy
      // re-mints its own installation identity rather than reporting as
      // the original."
      //
      // This is true by construction at the mint layer: mintInstallationId()
      // has no "read existing identity first" logic — every call returns a
      // fresh UUID. When machine-state/identity.ts lands with read/write logic,
      // it will re-mint on absent-from-store, never reading a stale identity.
      //
      // This test verifies that the mint function itself is stateless.
      const original = mintInstallationId();
      const copy1 = mintInstallationId();
      const copy2 = mintInstallationId();

      // No copy reports the same identity as the original.
      expect(copy1).not.toBe(original);
      expect(copy2).not.toBe(original);

      // Each re-mint produces a fresh, unique value.
      expect(copy1).not.toBe(copy2);

      // All are valid UUIDv4.
      expect(original).toMatch(UUID_V4_RE);
      expect(copy1).toMatch(UUID_V4_RE);
      expect(copy2).toMatch(UUID_V4_RE);
    });
  });
});
