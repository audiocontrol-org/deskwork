import { describe, expect, it } from 'vitest';
import { negotiateFleet } from '../../govern/fleet-negotiation.js';
import type { LaneCapabilityProfile } from '../../govern/lane-capabilities.js';

const LANES: readonly LaneCapabilityProfile[] = [
  {
    name: 'claude',
    model: 'opus',
    binary: 'claude',
    availability: 'available',
    outputMode: 'stream-json',
    enforcement: 'enforced',
    liveness: 'monitored',
    envelope: { maxPromptBytes: 65536, source: 'fleet-knowledge' },
    timeoutBasis: { mode: 'derived', timeoutFloorSeconds: 300, timeoutSecsPerKb: 13 },
  },
  {
    name: 'codex',
    model: 'gpt-5.5',
    binary: 'codex',
    availability: 'available',
    outputMode: 'text',
    enforcement: 'enforced',
    liveness: 'monitored',
    envelope: { maxPromptBytes: 24576, source: 'fleet-knowledge' },
    timeoutBasis: { mode: 'derived', timeoutFloorSeconds: 300, timeoutSecsPerKb: 7 },
  },
];

describe('fleet negotiation records', () => {
  it('accepts a viable fleet before payload assembly', () => {
    const result = negotiateFleet(LANES, 2);
    expect(result.disposition).toBe('accepted');
    expect(result.acceptedFleet).toEqual(['claude', 'codex']);
  });

  // TASK-117: negotiation is the LANE-HEALTH axis; it no longer rejects a lane on
  // payload size. A small-envelope lane is still accepted here — an oversized
  // payload is the BOUNDARY axis, caught later by `assertBoundaryFits` as the
  // distinct `boundary-too-large` terminal (see govern-terminal-outcomes.test.ts).
  it('accepts a healthy lane regardless of its envelope size (size is the boundary axis)', () => {
    const result = negotiateFleet(LANES, 2);
    // codex has the smaller envelope (24576); it is NOT rejected for size.
    expect(result.disposition).toBe('accepted');
    expect(result.acceptedFleet).toEqual(['claude', 'codex']);
    expect(result.rejectedLanes).toEqual([]);
  });

  it('rejects lanes that are not enforced and monitored even when their envelopes fit', () => {
    const result = negotiateFleet(
      [
        ...LANES,
        {
          name: 'unsafe',
          model: 'gpt-unsafe',
          binary: 'codex',
          availability: 'available',
          outputMode: 'text',
          enforcement: 'unenforced',
          liveness: 'unmonitored',
          envelope: { maxPromptBytes: 999999, source: 'fleet-knowledge' },
          timeoutBasis: { mode: 'override', timeoutSeconds: 600 },
        },
      ],
      3,
    );
    expect(result.disposition).toBe('negotiation-failed');
    expect(result.acceptedFleet).toEqual(['claude', 'codex']);
    expect(result.rejectedLanes).toContain('unsafe');
  });

  it('fails loud on a non-positive quorum requirement', () => {
    expect(() => negotiateFleet([], 0)).toThrow(/positive integer/);
  });

  it('fails loud when the candidate fleet repeats a lane name', () => {
    expect(() =>
      negotiateFleet(
        [
          LANES[0]!,
          {
            ...LANES[0]!,
          },
        ],
        2,
      ),
    ).toThrow(/lane names must be unique/);
  });

  it('rejects lanes whose binary is unavailable even when the envelope fits', () => {
    const result = negotiateFleet(
      [
        LANES[0]!,
        {
          ...LANES[1]!,
          name: 'missing-codex',
          availability: 'unavailable',
        },
      ],
      2,
    );
    expect(result.disposition).toBe('negotiation-failed');
    expect(result.acceptedFleet).toEqual(['claude']);
    expect(result.rejectedLanes).toContain('missing-codex');
  });
});
