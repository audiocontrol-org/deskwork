// tests/fleet/sidecar-enroll-client.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { enrollInstance } from '../../src/sidecar/enroll-client.js';

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
  server = undefined;
});

async function start(): Promise<string> {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const auth = req.headers.authorization;
      if (auth === 'Bearer good-cred') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ token: 't-1' }));
        return;
      }
      if (auth === 'Bearer no-token-cred') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({}));
        return;
      }
      if (auth === 'Bearer not-json-cred') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('not json');
        return;
      }
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ reason: 'unknown-credential' }));
      void body;
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  return `http://127.0.0.1:${(addr satisfies AddressInfo).port}`;
}

describe('enrollInstance', () => {
  it('returns ok:true with the token on a successful enroll', async () => {
    const planeUrl = await start();
    const result = await enrollInstance({
      planeUrl,
      credential: 'good-cred',
      identity: { installationId: 'i', host: 'h', path: '/p' },
    });
    expect(result).toEqual({ ok: true, token: 't-1' });
  });

  it('returns ok:false with the status on a rejected credential', async () => {
    const planeUrl = await start();
    const result = await enrollInstance({
      planeUrl,
      credential: 'bad-cred',
      identity: { installationId: 'i', host: 'h', path: '/p' },
    });
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('returns ok:false status:200 when the 200 body has no token field', async () => {
    const planeUrl = await start();
    const result = await enrollInstance({
      planeUrl,
      credential: 'no-token-cred',
      identity: { installationId: 'i', host: 'h', path: '/p' },
    });
    expect(result).toEqual({ ok: false, status: 200 });
  });

  it('returns ok:false status:200 (never throws) when the 200 body is not valid JSON', async () => {
    const planeUrl = await start();
    const result = await enrollInstance({
      planeUrl,
      credential: 'not-json-cred',
      identity: { installationId: 'i', host: 'h', path: '/p' },
    });
    expect(result).toEqual({ ok: false, status: 200 });
  });

  it('returns ok:false status:0 (never throws) when the plane refuses the connection', async () => {
    // Port 1 is a privileged, unassigned port with no listener — the connect
    // attempt fails near-instantly (ECONNREFUSED), well under the 15s enroll
    // timeout, so this test does not wait on the timeout to observe the fix.
    const result = await enrollInstance({
      planeUrl: 'http://127.0.0.1:1',
      credential: 'good-cred',
      identity: { installationId: 'i', host: 'h', path: '/p' },
    });
    expect(result).toEqual({ ok: false, status: 0 });
  });
});
