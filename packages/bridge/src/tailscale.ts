/**
 * Tailscale auto-detection for the bridge sidecar.
 *
 * Mirrors the studio's `tailscale.ts`. Kept local to the bridge package
 * so the bridge has no dependency on the studio. The detection logic is
 * a 30-line network-interface scan plus an optional `tailscale status`
 * subprocess for the magic-DNS hostname; copying it is cheaper than
 * inventing a shared @deskwork/core utility for this phase.
 */

import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

export interface TailscaleInfo {
  readonly ipv4: readonly string[];
  readonly magicDnsName: string | null;
}

function isTailscaleIPv4(addr: string): boolean {
  const parts = addr.split('.');
  if (parts.length !== 4) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (a !== 100) return false;
  if (!Number.isFinite(b)) return false;
  return b >= 64 && b <= 127;
}

export function detectTailscaleIPv4Addresses(): readonly string[] {
  const interfaces = networkInterfaces();
  const found: string[] = [];
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4') continue;
      if (a.internal) continue;
      if (isTailscaleIPv4(a.address)) {
        found.push(a.address);
      }
    }
  }
  return found.sort();
}

export function detectTailscaleMagicDnsName(): string | null {
  const result = spawnSync('tailscale', ['status', '--json'], {
    encoding: 'utf-8',
    timeout: 1500,
  });
  if (result.error || result.status !== 0 || !result.stdout) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const self = (parsed as { Self?: unknown }).Self;
  if (!self || typeof self !== 'object') return null;
  const dnsName = (self as { DNSName?: unknown }).DNSName;
  if (typeof dnsName !== 'string' || dnsName.length === 0) return null;
  return dnsName.endsWith('.') ? dnsName.slice(0, -1) : dnsName;
}

export function detectTailscale(): TailscaleInfo | null {
  const ipv4 = detectTailscaleIPv4Addresses();
  if (ipv4.length === 0) return null;
  return { ipv4, magicDnsName: detectTailscaleMagicDnsName() };
}
