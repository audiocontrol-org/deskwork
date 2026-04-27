/**
 * Tailscale auto-detection for the studio.
 *
 * Default behavior on launch: bind to loopback AND, if Tailscale is
 * running on this machine, the local Tailscale interface(s). That
 * makes the studio reachable from any other tailnet member by magic-
 * DNS hostname (`<machine>.<tailnet>.ts.net`) without the operator
 * having to think about ports, interfaces, or `--host` flags.
 *
 * Detection layered, fast-first:
 *
 * 1. **Network-interface scan** (sub-millisecond, no subprocess).
 *    Tailscale exclusively uses the IPv4 CGNAT range `100.64.0.0/10`
 *    on any platform. We walk `os.networkInterfaces()` and return any
 *    IP that lands in that range. False positives only if the operator
 *    is intentionally running their own CGNAT gateway — extremely rare.
 *
 * 2. **CLI enrichment** (~50ms, optional). When the `tailscale` CLI is
 *    on PATH, `tailscale status --json` provides the magic-DNS name we
 *    can show in the startup banner so the operator knows the URL their
 *    tailnet peers will use. Strictly nice-to-have; the IP-based bind
 *    works without it.
 *
 * Operators can disable auto-detection entirely with `--no-tailscale`
 * (loopback only). They can also pass an explicit `--host` to override
 * everything (Tailscale-aware logic kicks in only when `--host` was
 * NOT explicitly set).
 */

import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

export interface TailscaleInfo {
  /** IPv4 address(es) of this machine on the tailnet. Always populated when Tailscale is detected. */
  readonly ipv4: readonly string[];
  /**
   * Magic-DNS hostname (e.g. `orion-m4.tail8254f4.ts.net`). Populated
   * when the `tailscale` CLI is available; null otherwise. Strictly
   * informational — used only for display in the startup banner.
   */
  readonly magicDnsName: string | null;
}

/**
 * True if `addr` falls inside Tailscale's IPv4 CGNAT range
 * (`100.64.0.0/10`, i.e. `100.64.0.0` through `100.127.255.255`).
 */
function isTailscaleIPv4(addr: string): boolean {
  const parts = addr.split('.');
  if (parts.length !== 4) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (a !== 100) return false;
  if (!Number.isFinite(b)) return false;
  return b >= 64 && b <= 127;
}

/**
 * Scan local network interfaces for Tailscale IPv4 addresses. Returns
 * a (possibly empty) list, sorted for deterministic output. No
 * subprocess, no failure modes other than "no Tailscale interface" →
 * empty array.
 */
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

/**
 * Best-effort lookup of this machine's magic-DNS name via the
 * `tailscale` CLI. Returns null when:
 *   - the CLI isn't on PATH
 *   - the CLI errors (daemon not running, network blip, etc.)
 *   - the JSON shape is unexpected
 *
 * Total cost: bounded by the 1500ms timeout; typically ~50ms when
 * Tailscale is up and idle.
 */
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
  // The CLI returns the FQDN with a trailing dot ("orion-m4.tail8254f4.ts.net.").
  // Strip it for cleaner banner output.
  return dnsName.endsWith('.') ? dnsName.slice(0, -1) : dnsName;
}

/**
 * Combined detection: IPv4 from networkInterfaces (always tried),
 * magic-DNS hostname from CLI (best-effort). Returns null when
 * Tailscale isn't detected on this machine.
 */
export function detectTailscale(): TailscaleInfo | null {
  const ipv4 = detectTailscaleIPv4Addresses();
  if (ipv4.length === 0) return null;
  return { ipv4, magicDnsName: detectTailscaleMagicDnsName() };
}
