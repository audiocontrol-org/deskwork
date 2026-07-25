/**
 * Fleet Dashboard BFF — Server Entrypoint
 *
 * A lightweight backend-for-frontend (BFF) that:
 * - Holds the configured plane read credential
 * - Forwards browser requests to the plane's /v1/* read API (server-side only)
 * - Streams live instance state deltas from the plane's /v1/instances/stream
 *
 * Binds to loopback by default (127.0.0.1:8080); see config.ts for options.
 */

import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const HOST = '127.0.0.1'; // Loopback default

async function main(): Promise<void> {
  try {
    // TODO: T004 — load config (FLEET_PLANE_URL, FLEET_PLANE_READ_TOKEN, bind opts)
    // TODO: T013 — initialize plane-client
    // TODO: T015 — wire routes (mounted on the http server)

    const server = createServer((req, res) => {
      // Placeholder: minimal server that responds to requests
      // TODO: Route to actual BFF handlers once wired
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'dashboard_not_ready',
          message: 'Fleet Dashboard BFF initializing — see plan.md Phase 2 (T003–T015)',
        })
      );
    });

    server.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`Fleet Dashboard BFF starting on ${HOST}:${PORT}`);
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
