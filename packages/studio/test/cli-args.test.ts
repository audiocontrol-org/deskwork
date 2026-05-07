/**
 * Tests for the studio's CLI argument parser.
 *
 * Phase 10c contract: the studio is upstream-only and binds loopback.
 * The CLI surface is intentionally narrow:
 *   - `--project-root <path>` (default cwd)
 *   - `--studio-port <n>` (default 47422; auto-increment on EADDRINUSE
 *     unless explicit)
 *
 * Tailscale auto-detect, `--host`, and `--port` are sidecar-side
 * concerns and were dropped from the studio in 10c.
 */

import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../src/server.ts';

describe('parseCliArgs', () => {
  it('default studio-port is 47422 (loopback-only)', () => {
    const args = parseCliArgs([]);
    expect(args.studioPort).toBe(47422);
    expect(args.studioPortExplicit).toBe(false);
    expect(args.projectRoot.startsWith('/')).toBe(true);
  });

  it('--studio-port marks studioPortExplicit true', () => {
    const args = parseCliArgs(['--studio-port', '47500']);
    expect(args.studioPort).toBe(47500);
    expect(args.studioPortExplicit).toBe(true);
  });

  it('--studio-port=N equals form', () => {
    const args = parseCliArgs(['--studio-port=47600']);
    expect(args.studioPort).toBe(47600);
    expect(args.studioPortExplicit).toBe(true);
  });

  it('--project-root resolves to absolute', () => {
    const args = parseCliArgs(['--project-root', '/tmp/some-project']);
    expect(args.projectRoot).toBe('/tmp/some-project');
  });
});
