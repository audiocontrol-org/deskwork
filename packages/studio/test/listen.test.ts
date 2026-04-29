/**
 * Tests for `listenWithAutoIncrement` — the EADDRINUSE handler from
 * Issue #43. Uses a stub `serve` that simulates EADDRINUSE on
 * caller-controlled ports without binding actual sockets, so the
 * tests are deterministic and don't depend on system port availability.
 */

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  AUTO_INCREMENT_RANGE,
  listenWithAutoIncrement,
  type ServeImpl,
} from '../src/listen.ts';

/**
 * Node error subclass that carries a `code` field — mirrors the shape
 * of errors emitted by `net.Server` on listen failure. Using a real
 * subclass keeps the test free of `as` casts while still producing
 * an object the production code's `isAddressInUse` heuristic accepts.
 */
class CodedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'Error';
  }
}

/**
 * Stub HTTP server: a real `EventEmitter` for `error`/`listening`
 * dispatch plus a no-op `close()`. Composition rather than `as`-casting
 * an `EventEmitter` to a wider type — keeps the test free of casts.
 */
class StubServer extends EventEmitter {
  closed = false;
  close(cb?: (err?: Error) => void): this {
    this.closed = true;
    if (cb) queueMicrotask(() => cb());
    return this;
  }
}

function newStubServer(): StubServer {
  return new StubServer();
}

interface StubControl {
  /** Ports the stub should treat as already-in-use (fires EADDRINUSE). */
  readonly busyPorts: ReadonlySet<number>;
  /** Successful listen invocations (port + hostname pairs). */
  readonly listened: Array<{ port: number; hostname: string }>;
  /** Servers handed back, in order. */
  readonly servers: StubServer[];
}

function newStub(busyPorts: Iterable<number>): {
  serve: ServeImpl;
  control: StubControl;
} {
  const set = new Set<number>(busyPorts);
  const listened: Array<{ port: number; hostname: string }> = [];
  const servers: StubServer[] = [];
  const control: StubControl = {
    busyPorts: set,
    listened,
    servers,
  };
  const serve: ServeImpl = (options, listening) => {
    const server = newStubServer();
    servers.push(server);
    queueMicrotask(() => {
      if (set.has(options.port)) {
        server.emit(
          'error',
          new CodedError(
            'EADDRINUSE',
            `listen EADDRINUSE: address already in use ${options.hostname}:${options.port}`,
          ),
        );
      } else {
        listened.push({ port: options.port, hostname: options.hostname });
        listening({ address: options.hostname, port: options.port });
      }
    });
    return server;
  };
  return { serve, control };
}

const fetchFn: (req: Request) => Response = () => new Response('ok');

describe('listenWithAutoIncrement', () => {
  it('binds on the requested port when nothing is in use', async () => {
    const { serve, control } = newStub([]);
    const result = await listenWithAutoIncrement(
      {
        fetch: fetchFn,
        port: 47321,
        addresses: ['127.0.0.1'],
        explicitPort: false,
      },
      serve,
    );
    expect(result.port).toBe(47321);
    expect(result.autoIncremented).toBe(false);
    expect(result.servers).toHaveLength(1);
    expect(control.listened).toEqual([
      { port: 47321, hostname: '127.0.0.1' },
    ]);
  });

  it('auto-increments past busy ports when the operator did not pass --port', async () => {
    const { serve } = newStub([47321, 47322]);
    const result = await listenWithAutoIncrement(
      {
        fetch: fetchFn,
        port: 47321,
        addresses: ['127.0.0.1'],
        explicitPort: false,
      },
      serve,
    );
    expect(result.port).toBe(47323);
    expect(result.autoIncremented).toBe(true);
  });

  it('binds every address on the same chosen port (multi-address path)', async () => {
    const { serve, control } = newStub([]);
    const result = await listenWithAutoIncrement(
      {
        fetch: fetchFn,
        port: 47321,
        addresses: ['127.0.0.1', '100.64.0.5'],
        explicitPort: false,
      },
      serve,
    );
    expect(result.port).toBe(47321);
    expect(result.servers).toHaveLength(2);
    expect(control.listened.map((l) => l.hostname)).toEqual([
      '127.0.0.1',
      '100.64.0.5',
    ]);
    // Both bound on the same port.
    expect(new Set(control.listened.map((l) => l.port))).toEqual(
      new Set([47321]),
    );
  });

  it('rolls back partial binds when one address conflicts on the chosen port', async () => {
    // First port: address A succeeds, address B fails. Listener must
    // close A before retrying both on the next port.
    const closedServers: StubServer[] = [];
    const serve: ServeImpl = (options, listening) => {
      const server = newStubServer();
      const originalClose = server.close.bind(server);
      server.close = (cb?: (err?: Error) => void): StubServer => {
        closedServers.push(server);
        return originalClose(cb);
      };
      queueMicrotask(() => {
        const conflict = options.port === 47321 && options.hostname === 'B';
        if (conflict) {
          server.emit('error', new CodedError('EADDRINUSE', 'EADDRINUSE'));
        } else {
          listening({ address: options.hostname, port: options.port });
        }
      });
      return server;
    };
    const result = await listenWithAutoIncrement(
      {
        fetch: fetchFn,
        port: 47321,
        addresses: ['A', 'B'],
        explicitPort: false,
      },
      serve,
    );
    expect(result.port).toBe(47322);
    expect(result.autoIncremented).toBe(true);
    // The address-A server bound on 47321 must have been closed when
    // address-B failed; otherwise the retry would leak resources.
    expect(closedServers.length).toBeGreaterThanOrEqual(1);
  });

  it('explicitPort=true fails immediately on EADDRINUSE (no auto-increment)', async () => {
    const { serve } = newStub([47321]);
    await expect(
      listenWithAutoIncrement(
        {
          fetch: fetchFn,
          port: 47321,
          addresses: ['127.0.0.1'],
          explicitPort: true,
        },
        serve,
      ),
    ).rejects.toThrow(/--port.*explicit|--port <other>/i);
  });

  it('exhausting the auto-increment range produces a clear error', async () => {
    const busy = new Set<number>();
    for (let p = 47321; p < 47321 + AUTO_INCREMENT_RANGE; p++) {
      busy.add(p);
    }
    const { serve } = newStub(busy);
    await expect(
      listenWithAutoIncrement(
        {
          fetch: fetchFn,
          port: 47321,
          addresses: ['127.0.0.1'],
          explicitPort: false,
        },
        serve,
      ),
    ).rejects.toThrow(/no free port|--port <other>/i);
  });

  it('non-EADDRINUSE errors surface immediately without retry', async () => {
    const serve: ServeImpl = (options, _listening) => {
      const server = newStubServer();
      queueMicrotask(() => {
        server.emit(
          'error',
          new CodedError(
            'EACCES',
            `listen EACCES: permission denied ${options.hostname}:${options.port}`,
          ),
        );
      });
      return server;
    };
    await expect(
      listenWithAutoIncrement(
        {
          fetch: fetchFn,
          port: 47321,
          addresses: ['127.0.0.1'],
          explicitPort: false,
        },
        serve,
      ),
    ).rejects.toThrow(/EACCES/);
  });
});
