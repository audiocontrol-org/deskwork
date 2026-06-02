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
    expect(args.portExplicit).toBe(false);
    expect(args.hostOverride).toBeNull();
    expect(args.noTailscale).toBe(false);
    // projectRoot defaults to process.cwd(); just assert it's absolute
    expect(args.projectRoot.startsWith('/')).toBe(true);
  });

  it('--port marks portExplicit true (Issue #43)', () => {
    const args = parseCliArgs(['--port', '47322']);
    expect(args.port).toBe(47322);
    expect(args.portExplicit).toBe(true);
  });

  it('--port=N marks portExplicit true (Issue #43)', () => {
    const args = parseCliArgs(['--port=8080']);
    expect(args.port).toBe(8080);
    expect(args.portExplicit).toBe(true);
  });

  it('-p marks portExplicit true (Issue #43)', () => {
    const args = parseCliArgs(['-p', '9999']);
    expect(args.port).toBe(9999);
    expect(args.portExplicit).toBe(true);
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

  it('--no-tailscale is a deprecated no-op — it does NOT suppress Tailscale auto-detection', () => {
    // Agent-discipline rule (decompose-agent-discipline, entry 15): the flag
    // stranded operators who were off-keyboard. It is now a no-op; the studio
    // always auto-detects Tailscale unless the env-var escape hatch is set.
    const args = parseCliArgs(['--no-tailscale'], { env: {}, stderr: () => {} });
    expect(args.noTailscale).toBe(false);
    expect(args.hostOverride).toBeNull();
  });

  it('--no-tailscale still parses (no usage error) and emits a deprecation notice to stderr', () => {
    const lines: string[] = [];
    const args = parseCliArgs(['--no-tailscale'], { env: {}, stderr: (s) => lines.push(s) });
    expect(args.noTailscale).toBe(false);
    expect(lines.join('')).toMatch(/deprecated/i);
  });

  it('DESKWORK_STUDIO_NO_TAILSCALE=1 env var enables loopback-only (the non-interactive escape hatch)', () => {
    const args = parseCliArgs([], { env: { DESKWORK_STUDIO_NO_TAILSCALE: '1' }, stderr: () => {} });
    expect(args.noTailscale).toBe(true);
  });

  it('no env var and no flag → Tailscale stays enabled', () => {
    const args = parseCliArgs([], { env: {}, stderr: () => {} });
    expect(args.noTailscale).toBe(false);
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
