// specs/036-fleet-control-plane — T008 (RED, test-first): new session/phase event types.
//
// Task T008 creates a failing test for three new durable event types that do
// not yet exist in the classification catalog. These types must be added
// to src/fleet/classification.ts EVENT_CLASSIFICATIONS map and to the
// EventType union in src/fleet/types.ts.
//
// The test validates that:
// 1. `classifyEvent('session.started')` returns 'durable'
// 2. `classifyEvent('session.ended')` returns 'durable'
// 3. `classifyEvent('phase.entered')` returns 'durable'
// 4. Unknown/unregistered event types still fail loud (throw)
//
// This test MUST fail (RED) until T009 adds the three types to the catalog.
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). Real fixtures, no mocks.

import { describe, expect, it } from 'vitest';
import type { EventClassification } from '../../src/fleet/types.js';
import { classifyEvent } from '../../src/fleet/classification.js';

describe('classifyEvent — new session/phase event types (T008 RED test)', () => {
  it('classifies session.started as durable (immutable session lifecycle record)', () => {
    expect(classifyEvent('session.started')).toBe<EventClassification>('durable');
  });

  it('classifies session.ended as durable (immutable session lifecycle record)', () => {
    expect(classifyEvent('session.ended')).toBe<EventClassification>('durable');
  });

  it('classifies phase.entered as durable (immutable phase progression record)', () => {
    expect(classifyEvent('phase.entered')).toBe<EventClassification>('durable');
  });
});

describe('classifyEvent — preserve fail-loud on unknown types (existing behavior)', () => {
  it('still throws on an unregistered event type (do NOT weaken this gate)', () => {
    expect(() => classifyEvent('nonsense.type')).toThrow(
      /nonsense\.type/,
    );
  });
});
