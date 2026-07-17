// specs/036-fleet-control-plane — T012 (RED), pairs with T013 impl.
//
// data-model.md § Identity (line ~8-22) pins the identity generation rules:
//   installationId  — UUIDv4 (crypto.randomUUID()), never sorted.
//   invocationId, runId, eventId, commandId — UUIDv7 (uuidv7 package).
// data-model.md § Event → Envelope (line ~43-58) pins the envelope shape.
//
// This test asserts the SHAPE of identity generation (right UUID version)
// and that the envelope type accepts every field data-model.md lists. It
// does NOT test envelope construction/validation logic — that's T014/T015
// (src/fleet/event.ts), out of scope here.
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import {
  mintInstallationId,
  mintUuidV7,
  type EventEnvelope,
} from '../../src/fleet/types.js';

// UUID version/variant regexes (RFC 9562): version nibble at position 15,
// variant bits `10xx` at position 20 of the canonical hyphenated form.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('fleet identity types (T012, data-model § Identity)', () => {
  it('mintInstallationId produces a UUIDv4 (never sorted)', () => {
    const id = mintInstallationId();
    expect(id).toMatch(UUID_V4_RE);
  });

  it('mintInstallationId produces a fresh id on every call (not memoized)', () => {
    const a = mintInstallationId();
    const b = mintInstallationId();
    expect(a).not.toBe(b);
  });

  it('mintUuidV7 produces a UUIDv7 (used for invocationId/runId/eventId/commandId)', () => {
    const id = mintUuidV7();
    expect(id).toMatch(UUID_V7_RE);
  });

  it('mintUuidV7 produces a fresh id on every call', () => {
    const a = mintUuidV7();
    const b = mintUuidV7();
    expect(a).not.toBe(b);
  });

  it('a UUIDv4 installationId never matches the UUIDv7 shape, and vice versa', () => {
    // Guards against the identity/ordering confusion data-model.md warns
    // against: eventId (v7) must not be mistaken for installationId (v4).
    const v4 = mintInstallationId();
    const v7 = mintUuidV7();
    expect(v4).not.toMatch(UUID_V7_RE);
    expect(v7).not.toMatch(UUID_V4_RE);
  });

  it('EventEnvelope accepts every field data-model.md § Event → Envelope lists', () => {
    // Compile-time shape check: this object literal only type-checks if
    // EventEnvelope has exactly these fields with these types. runId is
    // exercised as both a UUIDv7 and null (data-model.md: "null for
    // non-run invocations").
    const withRun: EventEnvelope = {
      eventId: mintUuidV7(),
      installationId: mintInstallationId(),
      invocationId: mintUuidV7(),
      runId: mintUuidV7(),
      installationSequence: 1,
      invocationSequence: 1,
      schemaVersion: 1,
      type: 'run.started',
      wallClock: new Date().toISOString(),
      monotonicOffsetMs: 0,
      classification: 'durable',
    };
    const withoutRun: EventEnvelope = {
      ...withRun,
      runId: null,
      classification: 'live-only',
    };

    expect(withRun.runId).toMatch(UUID_V7_RE);
    expect(withoutRun.runId).toBeNull();
    expect(withRun.eventId).toMatch(UUID_V7_RE);
    expect(withRun.installationId).toMatch(UUID_V4_RE);
  });

  it('classification is restricted to the three data-model values', () => {
    const values: EventEnvelope['classification'][] = ['live-only', 'aggregated', 'durable'];
    expect(values).toHaveLength(3);
  });
});
