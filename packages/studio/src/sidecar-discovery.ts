/**
 * Studio-side discovery of the long-lived bridge sidecar.
 *
 * Walks the five stale-state cases from Phase 10a §5:
 *
 *   (a) descriptor missing
 *       → "Sidecar not running. Run `deskwork-bridge` first." Exit 1.
 *   (b) descriptor present + pid alive + port responds
 *       → proceed; return the descriptor.
 *   (c) descriptor present + pid dead + port free
 *       → "Stale sidecar descriptor; sidecar crashed without cleanup.
 *          Run `deskwork-bridge` to restart." Exit 1.
 *   (d) descriptor present + pid dead + port held by a different process
 *       → "Stale sidecar descriptor; another process holds port <N>." Exit 1.
 *   (e) descriptor present + pid alive + port doesn't respond
 *       → "Sidecar pid <P> is alive but not responding on port <N>." Exit 1.
 *
 * Returns the descriptor on case (b). All other cases throw a
 * `SidecarDiscoveryError` carrying a typed `kind` so tests can assert
 * the case discriminator without scraping log strings.
 *
 * No auto-recovery. Per the design: cases (c), (d), (e) all surface
 * errors and exit. The operator decides what to do. Auto-killing or
 * auto-restarting in any scenario re-couples lifecycles in ways that
 * hide failure causes.
 */

import { createConnection } from 'node:net';
import {
  readDescriptor,
  descriptorPath,
  type BridgeDescriptor,
} from '@deskwork/bridge';

export type DiscoveryFailureKind =
  | 'descriptor-missing'
  | 'stale-pid-dead-port-free'
  | 'stale-pid-dead-port-taken'
  | 'sidecar-unresponsive';

export class SidecarDiscoveryError extends Error {
  readonly kind: DiscoveryFailureKind;
  constructor(kind: DiscoveryFailureKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'SidecarDiscoveryError';
  }
}

export interface DiscoveryDeps {
  /**
   * Health-check the bridge sidecar's port. Returns true when the
   * sidecar's `/api/chat/state` endpoint responds with the documented
   * shape inside the timeout. Default impl below; injected for tests.
   */
  readonly probeBridge: (port: number) => Promise<boolean>;
  /**
   * Probe whether `port` is bindable (true) or held by some process
   * (false). Default impl uses a TCP connect attempt to detect
   * "something is listening" / "nothing is listening".
   */
  readonly probePortInUse: (port: number) => Promise<boolean>;
  /**
   * True when the given pid points at a live process. Default uses
   * `process.kill(pid, 0)` per the Node convention.
   */
  readonly isPidAlive: (pid: number) => boolean;
}

const DEFAULT_PROBE_TIMEOUT_MS = 1000;

async function defaultProbeBridge(port: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_PROBE_TIMEOUT_MS);
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

function defaultIsPidAlive(pid: number): boolean {
  try {
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

function defaultProbePortInUse(port: number): Promise<boolean> {
  return new Promise<boolean>((resolvePromise) => {
    const sock = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const settle = (inUse: boolean): void => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolvePromise(inUse);
    };
    sock.once('connect', () => settle(true));
    sock.once('error', (err: NodeJS.ErrnoException) => {
      // ECONNREFUSED → nothing is listening on that port (port "free")
      // Anything else → assume the port is held by something.
      if (err.code === 'ECONNREFUSED') {
        settle(false);
      } else {
        settle(true);
      }
    });
    setTimeout(() => settle(false), DEFAULT_PROBE_TIMEOUT_MS);
  });
}

export const defaultDiscoveryDeps: DiscoveryDeps = {
  probeBridge: defaultProbeBridge,
  probePortInUse: defaultProbePortInUse,
  isPidAlive: defaultIsPidAlive,
};

/**
 * Resolve the sidecar descriptor for a project root, walking the five
 * stale-state cases. Returns the descriptor on success (case b);
 * throws `SidecarDiscoveryError` for cases (a), (c), (d), (e).
 */
export async function discoverSidecar(
  projectRoot: string,
  deps: DiscoveryDeps = defaultDiscoveryDeps,
): Promise<BridgeDescriptor> {
  const desc = await readDescriptor(projectRoot);
  if (desc === null) {
    throw new SidecarDiscoveryError(
      'descriptor-missing',
      'Sidecar not running. Run `deskwork-bridge` first.',
    );
  }

  const path = descriptorPath(projectRoot);
  const pidAlive = deps.isPidAlive(desc.pid);

  if (!pidAlive) {
    const portInUse = await deps.probePortInUse(desc.port);
    if (!portInUse) {
      throw new SidecarDiscoveryError(
        'stale-pid-dead-port-free',
        `Stale sidecar descriptor at ${path}; sidecar crashed without cleanup. ` +
          'Run `deskwork-bridge` to restart.',
      );
    }
    throw new SidecarDiscoveryError(
      'stale-pid-dead-port-taken',
      `Stale sidecar descriptor at ${path}; another process holds port ${desc.port}. ` +
        'Investigate before restarting.',
    );
  }

  // pid alive — verify the sidecar is actually responding.
  const healthy = await deps.probeBridge(desc.port);
  if (!healthy) {
    throw new SidecarDiscoveryError(
      'sidecar-unresponsive',
      `Sidecar pid ${desc.pid} is alive but not responding on port ${desc.port}. ` +
        'Check sidecar logs; do not loop.',
    );
  }
  return desc;
}
