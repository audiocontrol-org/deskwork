// tests/fleet/enroll-handler.test.ts
import { describe, expect, it, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { loadFleetRegistry } from '../../src/plane/fleet-registry.js';
import { createEnrollHandler } from '../../src/plane/http/enroll.js';

let dir: string | undefined;
let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
  if (dir) rmSync(dir, { recursive: true, force: true });
  server = undefined; dir = undefined;
});

async function start(): Promise<string> {
  dir = mkdtempSync(join(tmpdir(), 'scf-enroll-'));
  const reg = loadFleetRegistry(dir);
  reg.addCredential('cred-1', 'hostB');
  const handler = createEnrollHandler(reg);
  server = createServer((req, res) => {
    void handler({ req, res, params: {}, url: new URL(req.url ?? '/', 'http://x') });
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  return `http://127.0.0.1:${(addr satisfies AddressInfo).port}`;
}

describe('POST /v1/enroll', () => {
  it('mints a token for a valid credential + identity', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: 'Bearer cred-1', 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'inst-1', host: 'hostB', path: '/p' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
  });

  it('rejects an unknown credential with 401', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: 'Bearer nope', 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'i', host: 'h', path: '/p' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reason: 'unknown-credential' });
  });

  it('rejects a malformed body with 400', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/enroll`, {
      method: 'POST',
      headers: { authorization: 'Bearer cred-1', 'content-type': 'application/json' },
      body: JSON.stringify({ installationId: 'i' }),
    });
    expect(res.status).toBe(400);
  });
});
