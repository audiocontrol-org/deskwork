import { describe, it, expect, vi } from 'vitest';
import {
  preflightEngine,
  DEFAULT_CLAUDE_ADAPTER_ID,
  ENGINE_METHODS,
  type EngineProbe,
} from '@/engine-adapter';

function probeReturning(available: boolean): EngineProbe {
  return { isAvailable: () => available };
}

describe('preflightEngine — fail-loud presence check (execution paths)', () => {
  for (const method of ENGINE_METHODS) {
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

  it('the remedy names the ACTUAL missing custom adapter and does not misdirect to frontend-design', () => {
    const probe = probeReturning(false);
    let caught: unknown;
    try {
      preflightEngine(probe, { adapterId: 'custom-engine', method: 'referee-screenshot' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = caught instanceof Error ? caught.message : '';
    // remedy interpolates the actual absent adapter id
    expect(message).toContain('custom-engine');
    // does NOT tell the operator to install the wrong (default) plugin
    expect(message).not.toContain(DEFAULT_CLAUDE_ADAPTER_ID);
    // the manual-authoring fallback clause stays
    expect(message.toLowerCase()).toContain('manual');
  });

  it('the default-adapter case still names frontend-design in the remedy', () => {
    const probe = probeReturning(false);
    let caught: unknown;
    try {
      preflightEngine(probe, { method: 'author-wireframe' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = caught instanceof Error ? caught.message : '';
    expect(message).toContain(DEFAULT_CLAUDE_ADAPTER_ID);
    expect(message.toLowerCase()).toContain('manual');
  });
});
