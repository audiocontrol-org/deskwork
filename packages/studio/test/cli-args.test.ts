/**
 * Tests for the studio's CLI argument parser. Covers the default port
 * (47321 — chosen to dodge Astro's default 4321), the --host override,
 * and the --no-tailscale opt-out flag. The "default networking policy
 * is loopback + Tailscale" semantics is asserted by leaving
 * `hostOverride` null on a flagless invocation; main() decides what to
 * actually bind based on Tailscale detection at runtime.
 */

import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../src/server.ts';

describe('parseCliArgs', () => {
  it('default port is 47321 (avoids Astro 4321 collision), no host override, tailscale enabled', () => {
    const args = parseCliArgs([]);
    expect(args.port).toBe(47321);
    expect(args.hostOverride).toBeNull();
    expect(args.noTailscale).toBe(false);
    // projectRoot defaults to process.cwd(); just assert it's absolute
    expect(args.projectRoot.startsWith('/')).toBe(true);
  });

  it('--host explicit override sets hostOverride', () => {
    const args = parseCliArgs(['--host', '0.0.0.0']);
    expect(args.hostOverride).toBe('0.0.0.0');
  });

  it('--host=ADDR equals form', () => {
    const args = parseCliArgs(['--host=192.168.1.5']);
    expect(args.hostOverride).toBe('192.168.1.5');
  });

  it('-H short flag', () => {
    const args = parseCliArgs(['-H', '10.0.0.1']);
    expect(args.hostOverride).toBe('10.0.0.1');
  });

  it('--no-tailscale opts out of auto-detection', () => {
    const args = parseCliArgs(['--no-tailscale']);
    expect(args.noTailscale).toBe(true);
    expect(args.hostOverride).toBeNull();
  });

  it('--port and --host can combine', () => {
    const args = parseCliArgs(['--port', '8080', '--host', '0.0.0.0']);
    expect(args.port).toBe(8080);
    expect(args.hostOverride).toBe('0.0.0.0');
  });

  it('--project-root resolves to absolute', () => {
    const args = parseCliArgs(['--project-root', '/tmp/some-project']);
    expect(args.projectRoot).toBe('/tmp/some-project');
  });
});
