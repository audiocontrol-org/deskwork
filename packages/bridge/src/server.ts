#!/usr/bin/env node
/**
 * @deskwork/bridge — long-lived sidecar process.
 *
 * Boots a Hono app that serves:
 *   - GET  /api/chat/state                  — bridge state
 *   - POST /api/chat/send                   — operator → agent
 *   - GET  /api/chat/stream                 — SSE: agent events + state
 *   - GET  /api/chat/history                — chat-log replay
 *   - ALL  /mcp                             — MCP streamable-HTTP endpoint
 *   - ALL  /dev/*                           — reverse-proxied to the studio
 *   - ALL  /static/*                        — reverse-proxied to the studio
 *
 * Phase 10c: the sidecar IS the front door. The studio binds a
 * separate loopback-only port and writes a `.studio` descriptor; the
 * sidecar's `/dev/*` and `/static/*` proxies discover that port at
 * request time. When the studio is restarting, those proxies return
 * a 502 with a friendly "Studio restarting…" page; `/mcp` and
 * `/api/chat/*` are unaffected because they live in this process.
 *
 * Usage:
 *   deskwork-bridge [--project-root <path>] [--port <n>] [--host <addr>]
 *
 * Defaults:
 *   --project-root  process.cwd()
 *   --port          47321  (canonical phone-facing port)
 *   --host          loopback + auto-detected Tailscale (unless --no-tailscale)
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readConfig } from '@deskwork/core/config';
import { BridgeQueue } from './queue.ts';
import { ChatLog } from './persistence.ts';
import { createChatRouter } from './routes.ts';
import { createMcpHandler } from './mcp-server.ts';
import {
  listenWithAutoIncrement,
  type ServeImpl,
} from './listen.ts';
import { detectTailscale, type TailscaleInfo } from './tailscale.ts';
import {
  descriptorPath,
  readDescriptor,
  removeDescriptor,
  writeDescriptor,
  type BridgeDescriptor,
} from './descriptor.ts';
import { getBridgeVersion } from './version.ts';
import { createProxyHandler } from './proxy.ts';
import { parseCliArgs, DEFAULT_PORT, LOOPBACK } from './cli.ts';

export { parseCliArgs } from './cli.ts';

export interface SidecarApp {
  readonly app: Hono;
  readonly queue: BridgeQueue;
  readonly log: ChatLog;
}

/**
 * Build the sidecar's Hono app. Exposed for tests that want to drive the
 * fetch handler in-process without binding a port.
 *
 * The `/dev/*` and `/static/*` proxies discover the studio at request
 * time via the `.studio` descriptor under `projectRoot`. Tests that
 * exercise the proxy must pre-populate that descriptor pointing at a
 * studio (or fake studio) on a loopback port.
 */
export function createSidecarApp(projectRoot: string): SidecarApp {
  const queue = new BridgeQueue();
  const log = new ChatLog({ projectRoot });
  const app = new Hono();
  app.route('/api/chat', createChatRouter({ queue, log }));
  const mcp = createMcpHandler({ queue, log });
  app.all('/mcp', (c) => mcp.handler(c));
  // Reverse-proxy the studio's surfaces. Both routes share the same
  // handler instance — the underlying `proxy()` helper is request-scoped
  // and reads the studio descriptor on each call.
  const proxyHandler = createProxyHandler({ projectRoot });
  app.all('/dev/*', proxyHandler);
  app.all('/static/*', proxyHandler);
  return { app, queue, log };
}

/**
 * Pre-flight check: refuse to boot when an existing descriptor points at
 * a live, healthy sidecar. Surfaces a clear error per Phase 10a §5
 * (cases b vs c).
 *
 *   - No descriptor                                  → proceed.
 *   - Descriptor present + pid alive + port responds → REFUSE (b).
 *   - Descriptor present + pid dead OR port silent   → STALE; proceed,
 *     and the new boot will overwrite the descriptor on success.
 */
async function preflightDescriptor(projectRoot: string): Promise<void> {
  const existing = await readDescriptor(projectRoot);
  if (existing === null) return;
  const path = descriptorPath(projectRoot);

  const pidAlive = isPidAlive(existing.pid);
  const portHealthy = pidAlive
    ? await isBridgePortHealthy(existing.port)
    : false;

  if (pidAlive && portHealthy) {
    process.stderr.write(
      `deskwork-bridge: another sidecar is already running for this project.\n` +
        `  descriptor: ${path}\n` +
        `  port: ${existing.port}\n` +
        `  pid:  ${existing.pid}\n` +
        `  Stop the existing sidecar before starting a new one.\n`,
    );
    process.exit(1);
  }

  // Stale descriptor — surface what's stale and continue (the boot will
  // overwrite the descriptor on successful bind).
  if (!pidAlive) {
    process.stderr.write(
      `deskwork-bridge: stale descriptor at ${path} (pid ${existing.pid} is not alive); ` +
        `recovering.\n`,
    );
  } else {
    process.stderr.write(
      `deskwork-bridge: stale descriptor at ${path} (pid ${existing.pid} alive but port ${existing.port} ` +
        `is not responding); recovering.\n`,
    );
  }
}

function isPidAlive(pid: number): boolean {
  try {
    // process.kill with signal 0 is a no-op probe — succeeds when the
    // pid exists, throws ESRCH when it doesn't. Permission errors (EPERM)
    // mean the process exists but isn't ours; still alive.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (
      err !== null &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === 'EPERM'
    ) {
      return true;
    }
    return false;
  }
}

async function isBridgePortHealthy(port: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/state`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    if (body === null || typeof body !== 'object') return false;
    return (
      'mcpConnected' in body &&
      'listenModeOn' in body &&
      'awaitingMessage' in body
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface BannerInput {
  readonly urls: readonly string[];
  readonly projectRoot: string;
  readonly tailscale: TailscaleInfo | null;
  readonly port: number;
  readonly override: string | null;
  readonly autoIncrementedFrom: number | null;
  readonly version: string;
}

function printBanner(b: BannerInput): void {
  process.stdout.write(`deskwork-bridge v${b.version} listening on:\n`);
  for (const url of b.urls) {
    process.stdout.write(`  ${url}\n`);
  }
  if (b.tailscale && b.tailscale.magicDnsName) {
    process.stdout.write(
      `  http://${b.tailscale.magicDnsName}:${b.port}/    (Tailscale magic-DNS)\n`,
    );
  }
  // Mirror the studio banner shape so adopters / dogfood operators see
  // the canonical Bridge: line in the same place. The qualifier scopes to
  // the /mcp endpoint specifically — request-time guard in mcp-server.ts
  // rejects non-loopback hits — not the bind topology, which may include
  // Tailscale interfaces or an explicit --host override (see exposure
  // warning below).
  process.stdout.write(
    `  Bridge MCP: http://localhost:${b.port}/mcp (MCP endpoint enforces loopback)\n`,
  );
  process.stdout.write(`  project: ${b.projectRoot}\n`);
  if (b.autoIncrementedFrom !== null) {
    process.stdout.write(
      `  note: port ${b.autoIncrementedFrom} was in use; using ${b.port} instead\n`,
    );
  }
  const exposed = b.override !== null && b.override !== LOOPBACK;
  if (exposed) {
    process.stdout.write(
      `  warning: bound to ${b.override}. Bridge has no authentication —\n` +
        '    only run this on a trusted network (Tailscale, VPN, etc.).\n',
    );
  }
}

async function main(): Promise<void> {
  const { projectRoot, port, portExplicit, hostOverride, noTailscale } =
    parseCliArgs(process.argv.slice(2));

  // Validate the project root by loading config — readConfig surfaces a
  // clear error when `.deskwork/config.json` is missing or malformed.
  try {
    readConfig(projectRoot);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Could not load config: ${reason}\n`);
    process.exit(1);
  }

  await preflightDescriptor(projectRoot);

  const { app } = createSidecarApp(projectRoot);

  let tailscale: TailscaleInfo | null = null;
  let bindAddresses: string[];
  if (hostOverride !== null) {
    bindAddresses = [hostOverride];
  } else if (noTailscale) {
    bindAddresses = [LOOPBACK];
  } else {
    tailscale = detectTailscale();
    bindAddresses = tailscale === null ? [LOOPBACK] : [LOOPBACK, ...tailscale.ipv4];
  }

  const serveImpl: ServeImpl = serve;

  let result;
  try {
    result = await listenWithAutoIncrement(
      {
        fetch: app.fetch,
        port,
        addresses: bindAddresses,
        explicitPort: portExplicit,
      },
      serveImpl,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`deskwork-bridge: ${reason}\n`);
    process.exit(1);
  }

  // Write the discovery descriptor AFTER successful bind. Order matters
  // (per design 10a §5): a descriptor that exists must always reflect a
  // live or recently-live sidecar.
  const descriptor: BridgeDescriptor = {
    port: result.port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    version: getBridgeVersion(),
  };
  try {
    await writeDescriptor(projectRoot, descriptor);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `deskwork-bridge: failed to write descriptor at ${descriptorPath(projectRoot)}: ${reason}\n`,
    );
    process.exit(1);
  }

  registerCleanupHandlers(projectRoot);

  const reachableUrls: string[] = [];
  for (const addr of bindAddresses) {
    reachableUrls.push(
      `http://${addr === LOOPBACK ? 'localhost' : addr}:${result.port}/`,
    );
  }
  printBanner({
    urls: reachableUrls,
    projectRoot,
    tailscale,
    port: result.port,
    override: hostOverride,
    autoIncrementedFrom: result.autoIncremented ? port : null,
    version: descriptor.version,
  });
}

let cleanupRegistered = false;

function registerCleanupHandlers(projectRoot: string): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  let removing = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (removing) return;
    removing = true;
    void removeDescriptor(projectRoot).finally(() => {
      // Re-raise the default behavior: exit with the conventional
      // signal-based code (128 + signal number is the shell convention).
      const code = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 0;
      process.exit(code);
    });
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

// Re-exported so existing callers that import constants from server.ts
// continue to work after the cli.ts split.
export { DEFAULT_PORT, LOOPBACK };

// Only run when invoked directly, not when imported from tests.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
