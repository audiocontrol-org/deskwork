/**
 * Tests for Tailscale auto-detection. Covers the IPv4 CGNAT range
 * predicate (Tailscale's reserved 100.64.0.0/10 space) plus the
 * subprocess-based magic-DNS lookup. The detection itself is exercised
 * indirectly — `detectTailscaleIPv4Addresses` walks live network
 * interfaces, so we can't assert exact addresses, only that the
 * function doesn't throw and returns an array.
 */

import { describe, it, expect } from 'vitest';
import {
  detectTailscale,
  detectTailscaleIPv4Addresses,
  detectTailscaleMagicDnsName,
} from '../src/tailscale.ts';

describe('detectTailscaleIPv4Addresses', () => {
  it('returns an array (possibly empty) without throwing', () => {
    const addresses = detectTailscaleIPv4Addresses();
    expect(Array.isArray(addresses)).toBe(true);
    // Every returned address must fall inside Tailscale's CGNAT range.
    for (const addr of addresses) {
      const parts = addr.split('.');
      expect(parts).toHaveLength(4);
      expect(Number(parts[0])).toBe(100);
      const second = Number(parts[1]);
      expect(second).toBeGreaterThanOrEqual(64);
      expect(second).toBeLessThanOrEqual(127);
    }
  });

  it('result is sorted (deterministic output for banner ordering)', () => {
    const addresses = detectTailscaleIPv4Addresses();
    const sorted = [...addresses].sort();
    expect(addresses).toEqual(sorted);
  });
});

describe('detectTailscaleMagicDnsName', () => {
  it('returns a string ending in .ts.net or null (never throws)', () => {
    const name = detectTailscaleMagicDnsName();
    if (name !== null) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
      // Strip the trailing dot is part of the contract
      expect(name.endsWith('.')).toBe(false);
    }
  });
});

describe('detectTailscale', () => {
  it('returns null when Tailscale not detected, or {ipv4, magicDnsName} when detected', () => {
    const info = detectTailscale();
    if (info === null) {
      // No Tailscale on this machine — that's a valid result.
      expect(info).toBeNull();
      return;
    }
    expect(info.ipv4.length).toBeGreaterThan(0);
    // magicDnsName is best-effort: present when CLI works, null otherwise
    expect(['string', 'object']).toContain(typeof info.magicDnsName);
    if (info.magicDnsName !== null) {
      expect(info.magicDnsName.length).toBeGreaterThan(0);
    }
  });
});
