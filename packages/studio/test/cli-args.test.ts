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

  // AUDIT-20260602-01: the no-auth studio binds to the tailnet by default now.
  // An adopter who used --no-tailscale specifically to keep it OFF the tailnet
  // is silently exposed. The deprecation notice must WARN about the exposure
  // (not just describe the env var), and name how to restore loopback-only.
  it('--no-tailscale notice warns about tailnet exposure + names the restore path', () => {
    const lines: string[] = [];
    parseCliArgs(['--no-tailscale'], { env: {}, stderr: (s) => lines.push(s) });
    const notice = lines.join('');
    expect(notice).toMatch(/tailnet|exposed|reachable/i);
    expect(notice).toMatch(/DESKWORK_STUDIO_NO_TAILSCALE=1/);
  });

  // AUDIT-20260602-04: env truthiness must not be case/format-narrow, since
  // this is the only loopback-only path on a no-auth server. TRUE/True/yes/on
  // and surrounding whitespace should all work.
  it.each(['TRUE', 'True', 'true', 'yes', 'on', ' 1 ', '1'])(
    'DESKWORK_STUDIO_NO_TAILSCALE=%j enables loopback-only',
    (val) => {
      const args = parseCliArgs([], { env: { DESKWORK_STUDIO_NO_TAILSCALE: val }, stderr: () => {} });
      expect(args.noTailscale).toBe(true);
    },
  );

  it('DESKWORK_STUDIO_NO_TAILSCALE set to an unrecognized value warns and does NOT silently enable', () => {
    const lines: string[] = [];
    const args = parseCliArgs([], { env: { DESKWORK_STUDIO_NO_TAILSCALE: 'maybe' }, stderr: (s) => lines.push(s) });
    expect(args.noTailscale).toBe(false);
    expect(lines.join('')).toMatch(/DESKWORK_STUDIO_NO_TAILSCALE/);
  });

  // AUDIT-20260602-06: the --no-tailscale deprecation notice fires
  // unconditionally on the flag, but its text claims "the studio WILL be
  // reachable on the tailnet" — which is factually wrong when the env-var
  // escape hatch is ALSO set (loopback-only IS in effect). On a no-auth
  // surface a false exposure warning erodes its own signal value. Suppress
  // the deprecation notice's exposure-claim text when noTailscale === true.
  it('--no-tailscale + DESKWORK_STUDIO_NO_TAILSCALE=1 does NOT emit the false exposure-warning text', () => {
    const lines: string[] = [];
    const args = parseCliArgs(['--no-tailscale'], {
      env: { DESKWORK_STUDIO_NO_TAILSCALE: '1' },
      stderr: (s) => lines.push(s),
    });
    expect(args.noTailscale).toBe(true);
    const notice = lines.join('');
    // The factually-wrong exposure claim MUST NOT appear when loopback-only is active.
    expect(notice).not.toMatch(/will be reachable/i);
    expect(notice).not.toMatch(/no longer works/i);
  });

  it('--no-tailscale WITHOUT the env-var escape still emits the exposure-warning text', () => {
    // Negative case: when loopback-only is NOT in effect, the warning is correct and must fire.
    const lines: string[] = [];
    parseCliArgs(['--no-tailscale'], { env: {}, stderr: (s) => lines.push(s) });
    const notice = lines.join('');
    expect(notice).toMatch(/reachable|tailnet/i);
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
