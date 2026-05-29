import { describe, it, expect } from 'vitest';
import { shimBody } from '../shortcuts/shim-body.js';

describe('shimBody', () => {
  it('returns the canonical body for a known command', () => {
    expect(shimBody('implement')).toBe('/dw-lifecycle:implement $ARGUMENTS\n');
  });

  it('returns the canonical body for a hyphenated known command', () => {
    expect(shimBody('session-start')).toBe(
      '/dw-lifecycle:session-start $ARGUMENTS\n',
    );
  });

  it('throws on an empty command string', () => {
    expect(() => shimBody('')).toThrow(/not a known dw-lifecycle command/);
  });

  it('throws on an unknown command, listing the expected set', () => {
    let thrown: unknown;
    try {
      shimBody('bogus');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('"bogus"');
    expect(message).toMatch(/Expected one of:/);
    expect(message).toContain('implement');
    expect(message).toContain('session-start');
  });
});
