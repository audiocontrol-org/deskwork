/**
 * Bridge listener with EADDRINUSE handling.
 *
 * Mirrors the studio's `listen.ts` shape (issue #43, phase 22). Keeps the
 * code local to the bridge package so the bridge has no dependency on
 * the studio. Differs only in `AUTO_INCREMENT_RANGE` — the bridge walks
 * `[47321, 47321+100]` per Phase 10a §6, the studio's auto-increment is
 * tighter.
 *
 * Two-tier behavior:
 *   - Default port (operator did NOT pass `--port`): try the requested
 *     port and, if it's in use, walk forward through the range before
 *     giving up.
 *   - Explicit port (operator passed `--port`): respect the request.
 *     Fail fast on EADDRINUSE with a clear pointer at `--port <other>`.
 *
 * The function takes a `serveImpl` injectable so tests can substitute a
 * stub that simulates EADDRINUSE without actually binding sockets.
 */

export interface ListeningServer {
  on(event: 'error', listener: (err: unknown) => void): unknown;
  close(callback?: (err?: Error) => void): unknown;
}

/**
 * Number of additional ports to try after the requested port when the
 * operator hasn't asked for an explicit port. Per Phase 10a §6 the
 * bridge walks `[47321, 47321+100]` (101 attempts inclusive — see the
 * loop below).
 */
export const AUTO_INCREMENT_RANGE = 101;

export interface ListenOptions {
  readonly fetch: (req: Request) => Response | Promise<Response>;
  readonly port: number;
  readonly addresses: ReadonlyArray<string>;
  readonly explicitPort: boolean;
}

export interface ListenResult {
  readonly port: number;
  readonly servers: ReadonlyArray<ListeningServer>;
  readonly autoIncremented: boolean;
}

export interface ServeOptions {
  fetch: ListenOptions['fetch'];
  port: number;
  hostname: string;
}

export type ServeImpl = (
  options: ServeOptions,
  listening: (info: unknown) => void,
) => ListeningServer;

function listenOnAddress(
  serveImpl: ServeImpl,
  fetchFn: ListenOptions['fetch'],
  port: number,
  address: string,
): Promise<ListeningServer> {
  return new Promise<ListeningServer>((resolvePromise, rejectPromise) => {
    let resolved = false;
    let server: ListeningServer;
    try {
      server = serveImpl(
        { fetch: fetchFn, port, hostname: address },
        () => {
          if (resolved) return;
          resolved = true;
          resolvePromise(server);
        },
      );
    } catch (err) {
      rejectPromise(err);
      return;
    }
    server.on('error', (err: unknown) => {
      if (resolved) return;
      resolved = true;
      try {
        server.close();
      } catch {
        // already on the error path
      }
      rejectPromise(err);
    });
  });
}

function closeAll(servers: ReadonlyArray<ListeningServer>): Promise<void> {
  return Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((res) => {
          try {
            s.close(() => res());
          } catch {
            res();
          }
        }),
    ),
  ).then(() => undefined);
}

function isAddressInUse(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code === 'EADDRINUSE';
}

async function attemptPort(
  serveImpl: ServeImpl,
  fetchFn: ListenOptions['fetch'],
  port: number,
  addresses: ReadonlyArray<string>,
): Promise<ReadonlyArray<ListeningServer>> {
  const bound: ListeningServer[] = [];
  for (const addr of addresses) {
    try {
      const s = await listenOnAddress(serveImpl, fetchFn, port, addr);
      bound.push(s);
    } catch (err) {
      await closeAll(bound);
      throw err;
    }
  }
  return bound;
}

export async function listenWithAutoIncrement(
  options: ListenOptions,
  serveImpl: ServeImpl,
): Promise<ListenResult> {
  const startPort = options.port;
  const maxPort = options.explicitPort
    ? startPort
    : startPort + AUTO_INCREMENT_RANGE - 1;
  let lastError: unknown = null;

  for (let p = startPort; p <= maxPort; p++) {
    try {
      const servers = await attemptPort(
        serveImpl,
        options.fetch,
        p,
        options.addresses,
      );
      return {
        port: p,
        servers,
        autoIncremented: p !== startPort,
      };
    } catch (err) {
      lastError = err;
      if (!isAddressInUse(err)) {
        throw err;
      }
    }
  }

  if (options.explicitPort) {
    const detail =
      lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(
      `port ${startPort} is in use${detail}. ` +
        'The operator passed --port explicitly, so deskwork-bridge refuses ' +
        'to auto-increment. Pass --port <other> or stop the existing process.',
    );
  }
  throw new Error(
    `no free port found in range ${startPort}..${maxPort}. ` +
      'Pass --port <other> to choose a different starting point, or stop ' +
      'an existing deskwork-bridge instance.',
  );
}
