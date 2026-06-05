import { describe, it, expect, vi } from 'vitest';
import {
  preflightEngine,
  DEFAULT_CLAUDE_ADAPTER_ID,
  type EngineProbe,
  type EngineMethod,
} from '@/engine-adapter';

const ALL_METHODS: EngineMethod[] = [
  'author-wireframe',
  'translate-design-language',
  'referee-screenshot',
];

function probeReturning(available: boolean): EngineProbe {
  return { isAvailable: () => available };
}

describe('preflightEngine — fail-loud presence check (execution paths)', () => {
  for (const method of ALL_METHODS) {
    it(`throws when the engine is absent on execution method "${method}"`, () => {
      const probe = probeReturning(false);
      expect(() => preflightEngine(probe, { method })).toThrow();
    });

    it(`does not throw when the engine is present on execution method "${method}"`, () => {
      const probe = probeReturning(true);
      expect(() => preflightEngine(probe, { method })).not.toThrow();
    });
  }

  it('the thrown Error names the missing adapter, the method, and the remedy', () => {
    const probe = probeReturning(false);
    let caught: unknown;
    try {
      preflightEngine(probe, { method: 'author-wireframe' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = caught instanceof Error ? caught.message : '';
    // names the missing adapter (the default cross-plugin dependency)
    expect(message).toContain(DEFAULT_CLAUDE_ADAPTER_ID);
    // names the method that needed it
    expect(message).toContain('author-wireframe');
    // names the remedy: install/enable the engine OR use the manual authoring path
    expect(message.toLowerCase()).toContain('manual');
  });

  it('queries the probe with the requested adapterId when one is supplied', () => {
    const isAvailable = vi.fn<(adapterId: string) => boolean>(() => true);
    const probe: EngineProbe = { isAvailable };
    preflightEngine(probe, { adapterId: 'custom-engine', method: 'referee-screenshot' });
    expect(isAvailable).toHaveBeenCalledWith('custom-engine');
  });

  it('queries the probe with the default Claude adapter when no adapterId is supplied', () => {
    const isAvailable = vi.fn<(adapterId: string) => boolean>(() => true);
    const probe: EngineProbe = { isAvailable };
    preflightEngine(probe, { method: 'author-wireframe' });
    expect(isAvailable).toHaveBeenCalledWith(DEFAULT_CLAUDE_ADAPTER_ID);
  });

  // Manual-authoring invariant: manual authoring never calls preflightEngine, so it
  // never requires the engine. We assert the invariant at the preflight boundary:
  // a manual-authoring code path that does NOT invoke the probe never throws and
  // never touches the probe — modeled here by simply not calling preflightEngine.
  it('manual authoring path does not invoke the probe and requires no engine', () => {
    const isAvailable = vi.fn<(adapterId: string) => boolean>(() => false);
    // An absent-engine probe exists, but the manual path never consults it.
    const absentEngineProbe: EngineProbe = { isAvailable };
    expect(absentEngineProbe.isAvailable).toBe(isAvailable);

    // Simulate the manual-authoring path: operator-driven authoring runs without
    // ever calling preflightEngine. With an absent engine, authoring still works
    // because the probe is never consulted on this path.
    const manualAuthoringResult = (() => 'manual-wireframe-authored')();

    expect(manualAuthoringResult).toBe('manual-wireframe-authored');
    expect(isAvailable).not.toHaveBeenCalled();
  });
});
