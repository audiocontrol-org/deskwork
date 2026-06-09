// T009 (RED-first, US1, 008) — capture half: typeLabelStamp maps a capture type
// to the backlog labels (the project `agent-found` label + the `type:<value>`
// label, since backlog.md has no native type field). The severity→priority half
// (T021, US4) appends to this file.

import { describe, it, expect } from 'vitest';
import { typeLabelStamp, PROJECT_LABEL, CAPTURE_TYPES } from '../../src/backlog/mappings.js';

describe('typeLabelStamp (capture, T009)', () => {
  it('bug → [agent-found, type:bug]', () => {
    expect(typeLabelStamp('bug')).toEqual([PROJECT_LABEL, 'type:bug']);
  });

  it('gap → [agent-found, type:gap]', () => {
    expect(typeLabelStamp('gap')).toEqual([PROJECT_LABEL, 'type:gap']);
  });

  it('every declared capture type maps to the agent-found project label first', () => {
    for (const t of CAPTURE_TYPES) {
      expect(typeLabelStamp(t)[0]).toBe(PROJECT_LABEL);
    }
  });

  it('an unknown type is rejected (fail-loud, not silently stamped)', () => {
    expect(() => typeLabelStamp('nonsense')).toThrow(/type/i);
  });
});
