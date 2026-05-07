/**
 * Tests for the studio's sidecar discovery — exercises the five
 * stale-state cases from Phase 10a §5 against a tmp project root and
 * a hand-written `.deskwork/.bridge` descriptor.
 *
 * Each test injects fake `probeBridge`, `probePortInUse`, and
 * `isPidAlive` deps so the cases are deterministic without binding
 * real ports.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverSidecar,
  SidecarDiscoveryError,
  type DiscoveryDeps,
} from '@/sidecar-discovery.ts';

interface Fixture {
  root: string;
  cleanup(): void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'studio-sidecar-discovery-'));
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function writeBridgeDescriptor(
  root: string,
  body: { port: number; pid: number; startedAt?: string; version?: string },
): void {
  const desc = {
    port: body.port,
    pid: body.pid,
    startedAt: body.startedAt ?? '2026-05-07T18:00:00.000Z',
    version: body.version ?? '0.15.0',
  };
  writeFileSync(
    join(root, '.deskwork', '.bridge'),
    JSON.stringify(desc),
    'utf8',
  );
}

function makeDeps(overrides: Partial<DiscoveryDeps>): DiscoveryDeps {
  return {
    probeBridge: overrides.probeBridge ?? (async () => true),
    probePortInUse: overrides.probePortInUse ?? (async () => false),
    isPidAlive: overrides.isPidAlive ?? (() => true),
  };
}

describe('discoverSidecar — Phase 10a §5 stale-state cases', () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture();
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('case (a): descriptor missing → "Sidecar not running"', async () => {
    let caught: unknown = null;
    try {
      await discoverSidecar(fx.root, makeDeps({}));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SidecarDiscoveryError);
    if (caught instanceof SidecarDiscoveryError) {
      expect(caught.kind).toBe('descriptor-missing');
      expect(caught.message).toMatch(/Sidecar not running/);
      expect(caught.message).toMatch(/deskwork-bridge/);
    }
  });

  it('case (b): present + pid alive + port healthy → returns descriptor', async () => {
    writeBridgeDescriptor(fx.root, { port: 47321, pid: 12345 });
    const deps = makeDeps({
      isPidAlive: () => true,
      probeBridge: async () => true,
    });
    const desc = await discoverSidecar(fx.root, deps);
    expect(desc.port).toBe(47321);
    expect(desc.pid).toBe(12345);
  });

  it('case (c): pid dead + port free → "Stale sidecar descriptor; sidecar crashed"', async () => {
    writeBridgeDescriptor(fx.root, { port: 47321, pid: 99999 });
    const deps = makeDeps({
      isPidAlive: () => false,
      probePortInUse: async () => false,
    });
    let caught: unknown = null;
    try {
      await discoverSidecar(fx.root, deps);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SidecarDiscoveryError);
    if (caught instanceof SidecarDiscoveryError) {
      expect(caught.kind).toBe('stale-pid-dead-port-free');
      expect(caught.message).toMatch(/Stale sidecar descriptor/);
      expect(caught.message).toMatch(/sidecar crashed without cleanup/);
    }
  });

  it('case (d): pid dead + port taken → "another process holds port"', async () => {
    writeBridgeDescriptor(fx.root, { port: 47321, pid: 99999 });
    const deps = makeDeps({
      isPidAlive: () => false,
      probePortInUse: async () => true,
    });
    let caught: unknown = null;
    try {
      await discoverSidecar(fx.root, deps);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SidecarDiscoveryError);
    if (caught instanceof SidecarDiscoveryError) {
      expect(caught.kind).toBe('stale-pid-dead-port-taken');
      expect(caught.message).toMatch(/another process holds port 47321/);
    }
  });

  it('case (e): pid alive + port unresponsive → "alive but not responding"', async () => {
    writeBridgeDescriptor(fx.root, { port: 47321, pid: 12345 });
    const deps = makeDeps({
      isPidAlive: () => true,
      probeBridge: async () => false,
    });
    let caught: unknown = null;
    try {
      await discoverSidecar(fx.root, deps);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SidecarDiscoveryError);
    if (caught instanceof SidecarDiscoveryError) {
      expect(caught.kind).toBe('sidecar-unresponsive');
      expect(caught.message).toMatch(/pid 12345 is alive but not responding/);
      expect(caught.message).toMatch(/port 47321/);
    }
  });
});
