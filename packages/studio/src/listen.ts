/**
 * Studio listener with EADDRINUSE handling (Issue #43, Phase 22).
 *
 * `@hono/node-server`'s `serve()` invokes `server.listen()` for us and
 * returns the Node `Server`. The default crash-loud behavior on
 * EADDRINUSE is unhelpful — operators running multiple deskwork-studio
 * instances (one per project) hit it routinely.
 *
 * Two-tier behavior:
 *   - Default port (operator did NOT pass `--port`): try the requested
 *     port and, if it's in use, walk forward through a small range
 *     before giving up.
 *   - Explicit port (operator passed `--port`): respect the request.
 *     Fail fast on EADDRINUSE with a clear pointer at `--port <other>`.
 *
 * The function takes a `serveImpl` injectable so tests can substitute
 * a stub that simulates EADDRINUSE without actually binding sockets.
 *
 * Sibling-relative imports per the project convention.
 */

/**
 * Minimal subset of `@hono/node-server`'s `ListeningServer` we actually
 * exercise. Defining this locally avoids leaking the full union of
 * Node http / http2 / https Server types into our public surface,
 * and lets tests substitute lightweight stubs without satisfying the
 * full Http2SecureServer interface.
 */
export interface ListeningServer {
  on(event: 'error', listener: (err: unknown) => void): unknown;
  close(callback?: (err?: Error) => void): unknown;
}

/**
 * Number of additional ports to try after the requested port when the
 * operator hasn't asked for an explicit port. The total range walked
 * is [port, port + AUTO_INCREMENT_RANGE). Default is 30 — enough for
 * dozens of concurrent studios in a multi-project workspace.
 */
export const AUTO_INCREMENT_RANGE = 30;

export interface ListenOptions {
  /** Hono `app.fetch` — passed verbatim to the adapter. */
  readonly fetch: (req: Request) => Response | Promise<Response>;
  /** Initial port to try. */
  readonly port: number;
  /** One or more bind addresses; every address listens on the chosen port. */
  readonly addresses: ReadonlyArray<string>;
  /**
   * True when the operator asked for a specific port via `--port`. When
   * true, EADDRINUSE fails immediately. When false, the listener walks
   * forward through `AUTO_INCREMENT_RANGE` ports.
   */
  readonly explicitPort: boolean;
}

export interface ListenResult {
  /** The port that succeeded — equals `options.port` unless auto-incremented. */
  readonly port: number;
  /** Per-address bound servers, in `addresses` iteration order. */
  readonly servers: ReadonlyArray<ListeningServer>;
  /** True when the chosen port differs from the requested port. */
  readonly autoIncremented: boolean;
}

export interface ServeOptions {
  fetch: ListenOptions['fetch'];
  port: number;
  hostname: string;
}

/**
 * Minimal contract a serve implementation must satisfy. The real
 * implementation is `@hono/node-server`'s `serve`. Tests inject a stub.
 */
export type ServeImpl = (
  options: ServeOptions,
  listening: (info: unknown) => void,
) => ListeningServer;

/**
 * Bind one address on `port`. Resolves with the server when listening
 * succeeds, rejects with the underlying error otherwise. Cleans up on
 * either path so a partially-bound server doesn't leak when later
 * addresses fail.
 */
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
      // Best-effort close — server.listen() failed so the socket isn't
      // bound, but the underlying http.Server may still hold resources.
      try {
        server.close();
      } catch {
        // ignore — we're already on the error path
      }
      rejectPromise(err);
    });
  });
}

/**
 * Close every server in `servers`. Used when one address in a multi-
 * address bind fails and we need to abandon the partially-bound state
 * to retry on a different port.
 */
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

/**
 * Returns true when `err` is a Node EADDRINUSE error. Robust against
 * both the legacy and modern error shapes.
 */
function isAddressInUse(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code === 'EADDRINUSE';
}

/**
 * Bind every address on a single attempt. On success, returns the
 * servers; on failure, closes any partially-bound servers and re-
 * throws the first error encountered.
 */
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
      // Roll back the partial bind so the next attempt can re-try the
      // same port on the same address tree.
      await closeAll(bound);
      throw err;
    }
  }
  return bound;
}

/**
 * Try to bind every `address` on `port`, walking forward up to
 * `AUTO_INCREMENT_RANGE` ports if the operator didn't ask for an
 * explicit port. Returns the chosen port + bound servers; throws a
 * descriptive Error when no port in the range works.
 */
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
        // Non-EADDRINUSE failures (permission, invalid hostname, etc.)
        // are not improved by trying another port — surface immediately.
        throw err;
      }
      // EADDRINUSE — loop to next port unless we're at the cap.
    }
  }
  // Build a clear, operator-facing error message. The two failure
  // shapes have different remedies; we tailor the prose accordingly.
  if (options.explicitPort) {
    const detail =
      lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(
      `port ${startPort} is in use${detail}. ` +
        'The operator passed --port explicitly, so deskwork-studio refuses ' +
        'to auto-increment. Pass --port <other> or stop the existing process.',
    );
  }
  throw new Error(
    `no free port found in range ${startPort}..${maxPort}. ` +
      'Pass --port <other> to choose a different starting point, or stop ' +
      'an existing deskwork-studio instance.',
  );
}
