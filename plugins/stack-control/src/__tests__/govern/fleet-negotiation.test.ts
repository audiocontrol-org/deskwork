import { describe, expect, it } from 'vitest';
import { negotiateFleet } from '../../govern/fleet-negotiation.js';
import type { LaneCapabilityProfile } from '../../govern/lane-capabilities.js';

const LANES: readonly LaneCapabilityProfile[] = [
  {
    name: 'claude',
    model: 'opus',
    binary: 'claude',
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
    outputMode: 'text',
    enforcement: 'enforced',
    liveness: 'monitored',
    envelope: { maxPromptBytes: 24576, source: 'fleet-knowledge' },
    timeoutBasis: { mode: 'derived', timeoutFloorSeconds: 300, timeoutSecsPerKb: 7 },
  },
];

describe('fleet negotiation records', () => {
  it('accepts a viable fleet before payload assembly', () => {
    const result = negotiateFleet(LANES, 16000, 2);
    expect(result.disposition).toBe('accepted');
    expect(result.acceptedFleet).toEqual(['claude', 'codex']);
  });

  it('fails explicitly when too few lanes can carry the payload', () => {
    const result = negotiateFleet(LANES, 40000, 2);
    expect(result.disposition).toBe('negotiation-failed');
    expect(result.acceptedFleet).toEqual(['claude']);
    expect(result.rejectedLanes).toEqual(['codex']);
  });

  it('rejects lanes that are not enforced and monitored even when their envelopes fit', () => {
    const result = negotiateFleet(
      [
        ...LANES,
        {
          name: 'unsafe',
          model: 'gpt-unsafe',
          binary: 'codex',
          outputMode: 'text',
          enforcement: 'unenforced',
          liveness: 'unmonitored',
          envelope: { maxPromptBytes: 999999, source: 'fleet-knowledge' },
          timeoutBasis: { mode: 'override', timeoutSeconds: 600 },
        },
      ],
      16000,
      3,
    );
    expect(result.disposition).toBe('negotiation-failed');
    expect(result.acceptedFleet).toEqual(['claude', 'codex']);
    expect(result.rejectedLanes).toContain('unsafe');
  });

  it('fails loud on a non-positive quorum requirement', () => {
    expect(() => negotiateFleet([], 1024, 0)).toThrow(/positive integer/);
  });

  it('fails loud on an invalid requested prompt size', () => {
    expect(() => negotiateFleet(LANES, -1, 1)).toThrow(/requestedPromptBytes must be a positive integer/);
    expect(() => negotiateFleet(LANES, Number.NaN, 1)).toThrow(/requestedPromptBytes must be a positive integer/);
  });
});
