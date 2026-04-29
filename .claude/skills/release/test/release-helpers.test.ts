import { describe, it, expect } from 'vitest';
import { validateVersion } from '../lib/release-helpers.js';

describe('validateVersion', () => {
  it('accepts strictly-greater MAJOR.MINOR.PATCH', () => {
    expect(validateVersion('0.9.0', 'v0.8.7')).toEqual({ ok: true });
  });

  it('strips leading v from lastTag', () => {
    expect(validateVersion('0.9.0', 'v0.8.7')).toEqual({ ok: true });
    expect(validateVersion('0.9.0', '0.8.7')).toEqual({ ok: true });
  });

  it('rejects equal version (must be strictly greater)', () => {
    const r = validateVersion('0.9.0', 'v0.9.0');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/strictly greater/i);
  });

  it('rejects version less than lastTag', () => {
    const r = validateVersion('0.8.6', 'v0.8.7');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/strictly greater/i);
  });

  it('rejects malformed version (missing patch)', () => {
    const r = validateVersion('0.9', 'v0.8.7');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/format/i);
  });

  it('rejects extra suffix on version (no semver pre-release support)', () => {
    const r = validateVersion('1.0.0-beta', 'v0.9.0');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/format/i);
  });

  it('compares numeric tuples, not lexicographic', () => {
    // 0.10.0 > 0.9.0 numerically; lexicographic compare would be wrong.
    expect(validateVersion('0.10.0', 'v0.9.0')).toEqual({ ok: true });
  });
});

import { createRig } from './fixtures.js';

describe('createRig (fixture self-test)', () => {
  it('creates a working local + remote with main + feature branch', () => {
    const rig = createRig();
    try {
      // Confirm branch is feature/test
      expect(rig.sh('git rev-parse --abbrev-ref HEAD').trim()).toBe('feature/test');
      // Confirm origin/main exists
      expect(rig.sh('git rev-parse origin/main').trim()).toMatch(/^[0-9a-f]{40}$/);
      // Confirm tracking is set up
      expect(rig.sh('git rev-parse --abbrev-ref feature/test@{u}').trim()).toBe('origin/feature/test');
    } finally {
      rig.cleanup();
    }
  });
});
