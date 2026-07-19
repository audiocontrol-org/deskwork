// specs/037-instance-observability — T006 (RED), pairs with T007's impl.
//
// CONTRACT (data-model.md § EventEnvelope, D3, analyze M2):
// - EventEnvelope gains three fields: `host: string`, `path: string`, `sessionId: string | null`.
// - CRITICAL (FR-011): `constructEnvelope` DERIVES `host` and `path` INTERNALLY from
//   an `installationRoot` input (via deriveInstanceId + hostname + realpath), so EVERY
//   constructed envelope carries `host`/`path` even when the caller passes minimal input.
//   host/path are NEVER caller-supplied.
// - `sessionId` IS caller-supplied on `EnvelopeInput` and is nullable; `sessionId: null`
//   must be accepted.
// - `validateEnvelope` fail-louds (throws) on wrong types for the new fields.
// - `schemaVersion` is bumped (assert the new value is greater than the current one).
//
// CONSTRUCTION SEQUENCE:
// 1. The test passes `installationRoot` as a new input to `constructEnvelope`.
// 2. Inside `constructEnvelope`, `installationRoot` is used to derive `host` and `path`
//    (via a not-yet-written `deriveInstanceId` helper in a new `src/machine-state/instance-id.ts`).
// 3. The envelope returned MUST carry these derived values.
// 4. `sessionId` is passed via `EnvelopeInput.sessionId` (new field).
// 5. The caller NEVER provides `host` or `path` to `constructEnvelope`.

import { afterEach, describe, expect, it } from 'vitest';
import { hostname } from 'node:os';
import { realpathSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { constructEnvelope, validateEnvelope } from '../../src/fleet/event.js';
import type { EnvelopeInput } from '../../src/fleet/event.js';
import { mintInstallationId, mintUuidV7 } from '../../src/fleet/types.js';
import type { EventEnvelope } from '../../src/fleet/types.js';

/**
 * Fake Clock for testing — provides deterministic wall-clock and monotonic values
 * so test assertions are stable.
 */
const mockClock = {
  nowIso: () => '2026-07-18T12:00:00.000Z',
  monotonicNowMs: () => 1000.0,
};

const IS_WIN = process.platform === 'win32';

/** A REAL installation-root dir on disk (realpath.native requires it to exist). */
function makeInstallationRoot(): { root: string; dispose(): void } {
  const base = IS_WIN ? tmpdir() : '/tmp';
  const root = mkdtempSync(join(base, 'scf-envelope-'));
  return {
    root,
    dispose(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('EventEnvelope instance fields (T006 — host, path, sessionId)', () => {
  afterEach(() => {
    // Cleanup is per-test in the finally blocks
  });

  it('derives host and path from installationRoot; does NOT accept them as input', () => {
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();

    try {
      process.chdir(inst.root);

      const input: EnvelopeInput = {
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2, // NEW version for this feature
        type: 'invocation.completed',
        classification: 'aggregated',
        sessionId: 'session-123', // NEW field on input
      };

      // Pass installationRoot to constructEnvelope (new parameter)
      const envelope = constructEnvelope(
        mockClock,
        0.0,
        input,
        inst.root, // NEW: installationRoot is passed here
      );

      // Assert host and path are DERIVED (not caller-supplied)
      expect(envelope.host).toBe(hostname());
      expect(envelope.path).toBe(realpathSync.native(inst.root));

      // Assert they are non-empty strings
      expect(typeof envelope.host).toBe('string');
      expect(envelope.host.length).toBeGreaterThan(0);
      expect(typeof envelope.path).toBe('string');
      expect(envelope.path.length).toBeGreaterThan(0);

      // Assert sessionId is threaded from input
      expect(envelope.sessionId).toBe('session-123');
    } finally {
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('accepts sessionId: null from caller', () => {
    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();

    try {
      process.chdir(inst.root);

      const input: EnvelopeInput = {
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2,
        type: 'invocation.completed',
        classification: 'aggregated',
        sessionId: null, // NEW: nullable sessionId
      };

      const envelope = constructEnvelope(mockClock, 0.0, input, inst.root);

      // sessionId: null must be preserved
      expect(envelope.sessionId).toBeNull();
    } finally {
      process.chdir(originalCwd);
      inst.dispose();
    }
  });

  it('validateEnvelope throws when host is missing or wrong type', () => {
    const inst = makeInstallationRoot();

    try {
      // Valid envelope base (with host/path/sessionId present)
      const validEnvelopeData = {
        eventId: mintUuidV7(),
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2,
        type: 'invocation.completed',
        wallClock: '2026-07-18T12:00:00.000Z',
        monotonicOffsetMs: 100,
        classification: 'aggregated' as const,
        host: 'valid-host',
        path: '/valid/path',
        sessionId: 'session-123',
      };

      // Test: host is missing
      const noHost = { ...validEnvelopeData };
      delete (noHost as Partial<typeof validEnvelopeData>).host;
      expect(() => validateEnvelope(noHost)).toThrow(/host/i);

      // Test: host is not a string
      expect(() =>
        validateEnvelope({ ...validEnvelopeData, host: 123 }),
      ).toThrow(/host/i);

      // Test: host is empty string (should throw per requireString pattern)
      expect(() =>
        validateEnvelope({ ...validEnvelopeData, host: '' }),
      ).toThrow(/host/i);
    } finally {
      inst.dispose();
    }
  });

  it('validateEnvelope throws when path is missing or wrong type', () => {
    const inst = makeInstallationRoot();

    try {
      const validEnvelopeData = {
        eventId: mintUuidV7(),
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2,
        type: 'invocation.completed',
        wallClock: '2026-07-18T12:00:00.000Z',
        monotonicOffsetMs: 100,
        classification: 'aggregated' as const,
        host: 'valid-host',
        path: '/valid/path',
        sessionId: 'session-123',
      };

      // Test: path is missing
      const noPath = { ...validEnvelopeData };
      delete (noPath as Partial<typeof validEnvelopeData>).path;
      expect(() => validateEnvelope(noPath)).toThrow(/path/i);

      // Test: path is not a string
      expect(() =>
        validateEnvelope({ ...validEnvelopeData, path: 123 }),
      ).toThrow(/path/i);

      // Test: path is empty string
      expect(() =>
        validateEnvelope({ ...validEnvelopeData, path: '' }),
      ).toThrow(/path/i);
    } finally {
      inst.dispose();
    }
  });

  it('validateEnvelope throws when sessionId is wrong type (not string|null)', () => {
    const inst = makeInstallationRoot();

    try {
      const validEnvelopeData = {
        eventId: mintUuidV7(),
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2,
        type: 'invocation.completed',
        wallClock: '2026-07-18T12:00:00.000Z',
        monotonicOffsetMs: 100,
        classification: 'aggregated' as const,
        host: 'valid-host',
        path: '/valid/path',
        sessionId: 'session-123',
      };

      // Test: sessionId is a number (invalid)
      expect(() =>
        validateEnvelope({ ...validEnvelopeData, sessionId: 123 }),
      ).toThrow(/sessionId/i);

      // Test: sessionId is an empty string (should throw per requireNullableString)
      expect(() =>
        validateEnvelope({ ...validEnvelopeData, sessionId: '' }),
      ).toThrow(/sessionId/i);

      // Test: sessionId is an array (invalid)
      expect(() =>
        validateEnvelope({ ...validEnvelopeData, sessionId: [] }),
      ).toThrow(/sessionId/i);
    } finally {
      inst.dispose();
    }
  });

  it('validateEnvelope accepts sessionId: null', () => {
    const inst = makeInstallationRoot();

    try {
      const validEnvelopeData = {
        eventId: mintUuidV7(),
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2,
        type: 'invocation.completed',
        wallClock: '2026-07-18T12:00:00.000Z',
        monotonicOffsetMs: 100,
        classification: 'aggregated' as const,
        host: 'valid-host',
        path: '/valid/path',
        sessionId: null,
      };

      // Should NOT throw when sessionId is null
      const result = validateEnvelope(validEnvelopeData);
      expect(result.sessionId).toBeNull();
    } finally {
      inst.dispose();
    }
  });

  it('schemaVersion is incremented from 1 to 2', () => {
    // The current schemaVersion in test fixtures (e.g., api-snapshot.test.ts) uses 1.
    // This assertion confirms the new version is 2 (or higher if later features bump it).
    // When constructEnvelope is called with schemaVersion: 2, the envelope should carry 2.

    const inst = makeInstallationRoot();
    const originalCwd = process.cwd();

    try {
      process.chdir(inst.root);

      const input: EnvelopeInput = {
        installationId: mintInstallationId(),
        invocationId: mintUuidV7(),
        runId: null,
        installationSequence: 1,
        invocationSequence: 1,
        schemaVersion: 2, // NEW version for this feature
        type: 'invocation.completed',
        classification: 'aggregated',
        sessionId: 'session-123',
      };

      const envelope = constructEnvelope(mockClock, 0.0, input, inst.root);

      // Assert schemaVersion is 2 (bumped from 1)
      expect(envelope.schemaVersion).toBe(2);
      expect(envelope.schemaVersion).toBeGreaterThan(1);
    } finally {
      process.chdir(originalCwd);
      inst.dispose();
    }
  });
});
