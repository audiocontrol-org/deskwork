/**
 * Fleet Dashboard BFF — Server Entrypoint (T015)
 *
 * A lightweight backend-for-frontend (BFF) that:
 * - Holds the configured plane read credential (plane-client.ts, T011)
 * - Forwards browser requests to the plane's /v1/* read API (server-side only)
 * - Streams live instance state deltas from the plane's /v1/instances/stream
 *   via a single fanned-out subscription (stream-relay.ts, T013)
 * - Serves the browser-facing /api/* routes + static placeholder (routes.ts/
 *   http-server.ts, T014/T015/T016) on ONE same-origin `node:http` server
 *
 * Binds to loopback by default (127.0.0.1:8080); see config.ts for options.
 */

import { loadConfig } from './config.js';
import { createPlaneClient } from './plane-client.js';
import { createPlaneStreamConnector } from './plane-stream-connector.js';
import { createStreamRelay } from './stream-relay.js';
import type { StreamRelay } from './stream-relay.js';
import { createDashboardServer } from './http-server.js';

/** How long to wait before retrying a failed `relay.start()`. */
const RELAY_RETRY_INTERVAL_MS = 5000;

/**
 * Start the stream relay WITHOUT blocking server boot on plane
 * reachability — the BFF must bind + listen even when the plane is
 * unreachable at startup (never a crash; the error-handling contract in
 * contracts/dashboard-bff-api.md's "Test obligations" applies to boot, not
 * just to steady-state requests). A failed `start()` retries on a fixed
 * interval: `stream-relay.ts`'s own reconnect (`onDrop`) only fires after an
 * initial successful upstream connection, so this loop is what makes the
 * relay recover automatically for the case where the plane was never
 * reachable even once at boot (FR-016's "recovers on reconnect", extended
 * to the boot-time case).
 */
function startRelayResilient(relay: StreamRelay): void {
  const attempt = (): void => {
    relay.start().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(
        `Fleet Dashboard BFF: stream-relay failed to start (retrying in ` +
          `${RELAY_RETRY_INTERVAL_MS}ms): ${String(err)}`,
      );
      setTimeout(attempt, RELAY_RETRY_INTERVAL_MS);
    });
  };
  attempt();
}

async function main(): Promise<void> {
  try {
    const config = loadConfig(process.env);

    const planeClient = createPlaneClient({ config, fetchFn: fetch });
    const connectUpstream = createPlaneStreamConnector({ config, fetchFn: fetch });
    const relay = createStreamRelay({ planeClient, connectUpstream });
    const server = createDashboardServer({ planeClient, relay });

    startRelayResilient(relay);

    server.listen(config.port, config.host, () => {
      // eslint-disable-next-line no-console
      console.log(`Fleet Dashboard BFF listening on ${config.host}:${config.port}`);
    });

    server.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`Server error: ${String(err)}`);
      process.exit(1);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to start Fleet Dashboard BFF: ${String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught error in main():', err);
  process.exit(1);
});
