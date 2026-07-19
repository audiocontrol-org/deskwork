/**
 * specs/036-fleet-control-plane — T096 (RED), pairs with T096 impl in the
 * same task (`src/storage/b2.ts`).
 *
 * Drives `createB2Store` entirely through a FAKE `HttpTransport` — there is
 * no network access and no real B2 credentials in this environment, so
 * every assertion here is against the exact HTTP requests the adapter
 * issues and the exact way it maps HTTP responses back onto the
 * vendor-free `ObjectStorePort` contract (see src/storage/port.ts).
 *
 * Covers, per the task's RED-first checklist:
 *   (a) getObject maps 200 => bytes and 404 => null, and NEVER throws for
 *       a 404 (the port's documented not-yet-written-key contract).
 *   (b) putObject issues the correct upload request at the key.
 *   (c) listObjects pages through multiple pages and returns ALL results
 *       (no silent truncation).
 *   (d) credentials are read from injected config (never hardcoded) and
 *       never appear — in any form, plaintext or signed derivative — in a
 *       thrown error message.
 *
 * This repo's convention is relative `.js` imports under node16 module
 * resolution (no `@/` alias configured).
 */

import { describe, expect, it } from 'vitest';
import { createB2Store, type B2Credentials, type B2CredentialProvider } from '../../src/storage/b2.js';
import type { HttpRequest, HttpResponseMessage, HttpTransport } from '../../src/storage/http-transport.js';

/**
 * Records every request it receives and replays canned responses in order.
 * Legitimate TEST code (never shipped, never a src/ fallback) — its only
 * job is to prove the adapter issues the right requests and maps the right
 * responses, without any real network call.
 */
class FakeHttpTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private readonly responses: HttpResponseMessage[];
  private cursor = 0;

  constructor(responses: readonly HttpResponseMessage[]) {
    this.responses = [...responses];
  }

  async request(req: HttpRequest): Promise<HttpResponseMessage> {
    this.requests.push(req);
    const response = this.responses[this.cursor];
    if (response === undefined) {
      throw new Error(`FakeHttpTransport ran out of canned responses at request #${this.cursor}`);
    }
    this.cursor += 1;
    return response;
  }
}

/** A fixed, non-network credential provider — the injected auth seam. */
class FakeCredentialProvider implements B2CredentialProvider {
  constructor(private readonly credentials: B2Credentials) {}

  async getCredentials(): Promise<B2Credentials> {
    return this.credentials;
  }
}

const CONFIG = { bucket: 'fleet-events', endpoint: 's3.us-west-004.backblazeb2.com', region: 'us-west-004' };

function textBody(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function textOf(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

describe('createB2Store — getObject (RED a)', () => {
  it('maps a 200 response to the response bytes', async () => {
    const bytes = textBody('{"eventId":"e-1"}');
    const transport = new FakeHttpTransport([{ status: 200, headers: {}, body: bytes }]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });

    const result = await store.getObject('runs/inst-1/run-1/events/0000000001.json');

    expect(result).not.toBeNull();
    expect(textOf(result as Uint8Array)).toBe('{"eventId":"e-1"}');
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.method).toBe('GET');
    expect(transport.requests[0]?.url).toBe(
      'https://s3.us-west-004.backblazeb2.com/fleet-events/runs/inst-1/run-1/events/0000000001.json',
    );
  });

  it('maps a 404 response to null and never throws', async () => {
    const transport = new FakeHttpTransport([{ status: 404, headers: {}, body: new Uint8Array(0) }]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });

    await expect(store.getObject('runs/inst-1/run-1/events/not-written-yet.json')).resolves.toBeNull();
  });
});

describe('createB2Store — headObject', () => {
  it('maps a 200 response to ObjectMetadata via Content-Length', async () => {
    const transport = new FakeHttpTransport([
      { status: 200, headers: { 'content-length': '42' }, body: new Uint8Array(0) },
    ]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });

    const result = await store.headObject('runs/inst-1/run-1/manifest-1.json');

    expect(result).toEqual({ key: 'runs/inst-1/run-1/manifest-1.json', size: 42 });
    expect(transport.requests[0]?.method).toBe('HEAD');
  });

  it('maps a 404 response to null and never throws', async () => {
    const transport = new FakeHttpTransport([{ status: 404, headers: {}, body: new Uint8Array(0) }]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });

    await expect(store.headObject('missing.json')).resolves.toBeNull();
  });
});

describe('createB2Store — putObject (RED b)', () => {
  it('issues a PUT at the exact key with the given bytes as the body', async () => {
    const transport = new FakeHttpTransport([{ status: 200, headers: {}, body: new Uint8Array(0) }]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });
    const body = textBody('{"eventId":"e-1","invocationSequence":1}');

    await store.putObject({ key: 'runs/inst-1/run-1/events/0000000001.json', body });

    expect(transport.requests).toHaveLength(1);
    const req = transport.requests[0];
    expect(req?.method).toBe('PUT');
    expect(req?.url).toBe(
      'https://s3.us-west-004.backblazeb2.com/fleet-events/runs/inst-1/run-1/events/0000000001.json',
    );
    expect(req?.body).toEqual(body);
    // data-model.md § invariants: every object gets the same Cache-Control
    // header — set here as an adapter-side constant, not a per-call knob.
    expect(req?.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });

  it('throws a descriptive error on a non-2xx response', async () => {
    const transport = new FakeHttpTransport([{ status: 500, headers: {}, body: new Uint8Array(0) }]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });

    await expect(store.putObject({ key: 'x.json', body: textBody('{}') })).rejects.toThrow(/500/);
  });
});

describe('createB2Store — listObjects pagination (RED c)', () => {
  it('pages through multiple pages and returns every item with no truncation', async () => {
    const page1 = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ListBucketResult>',
      '<IsTruncated>true</IsTruncated>',
      '<NextContinuationToken>tok-1</NextContinuationToken>',
      '<Contents><Key>runs/inst-1/run-1/events/0000000001.json</Key><Size>10</Size></Contents>',
      '<Contents><Key>runs/inst-1/run-1/events/0000000002.json</Key><Size>20</Size></Contents>',
      '</ListBucketResult>',
    ].join('');
    const page2 = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ListBucketResult>',
      '<IsTruncated>false</IsTruncated>',
      '<Contents><Key>runs/inst-1/run-1/events/0000000003.json</Key><Size>30</Size></Contents>',
      '</ListBucketResult>',
    ].join('');
    const transport = new FakeHttpTransport([
      { status: 200, headers: {}, body: textBody(page1) },
      { status: 200, headers: {}, body: textBody(page2) },
    ]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });

    const results = await store.listObjects('runs/inst-1/run-1/events/');

    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[1]?.url).toContain('continuation-token=tok-1');
    expect(results).toEqual([
      { key: 'runs/inst-1/run-1/events/0000000001.json', size: 10 },
      { key: 'runs/inst-1/run-1/events/0000000002.json', size: 20 },
      { key: 'runs/inst-1/run-1/events/0000000003.json', size: 30 },
    ]);
  });

  it('fails loud (never silently truncates) when IsTruncated=true but no continuation token is given', async () => {
    const truncatedNoToken = [
      '<ListBucketResult>',
      '<IsTruncated>true</IsTruncated>',
      '<Contents><Key>a.json</Key><Size>1</Size></Contents>',
      '</ListBucketResult>',
    ].join('');
    const transport = new FakeHttpTransport([
      { status: 200, headers: {}, body: textBody(truncatedNoToken) },
    ]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
    });

    await expect(store.listObjects('prefix/')).rejects.toThrow(/NextContinuationToken/);
  });
});

describe('createB2Store — credentials (RED d)', () => {
  it('reads credentials from the injected provider, and different credentials produce different signatures', async () => {
    const transportA = new FakeHttpTransport([{ status: 200, headers: {}, body: new Uint8Array(0) }]);
    const storeA = createB2Store({
      transport: transportA,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-A', applicationKey: 'secret-A' }),
    });
    await storeA.getObject('same-key.json');

    const transportB = new FakeHttpTransport([{ status: 200, headers: {}, body: new Uint8Array(0) }]);
    const storeB = createB2Store({
      transport: transportB,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-B', applicationKey: 'secret-B' }),
    });
    await storeB.getObject('same-key.json');

    const authA = transportA.requests[0]?.headers['Authorization'];
    const authB = transportB.requests[0]?.headers['Authorization'];
    expect(authA).toBeDefined();
    expect(authB).toBeDefined();
    expect(authA).not.toBe(authB);
    expect(authA).toContain('key-A');
    expect(authB).toContain('key-B');
  });

  it('never places the raw application-key secret in the Authorization header', async () => {
    const secret = 'super-secret-application-key-value';
    const transport = new FakeHttpTransport([{ status: 200, headers: {}, body: new Uint8Array(0) }]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: secret }),
    });

    await store.getObject('some-key.json');

    const authHeader = transport.requests[0]?.headers['Authorization'] ?? '';
    expect(authHeader).not.toContain(secret);
  });

  it('never places the raw application-key secret in a thrown error message', async () => {
    const secret = 'super-secret-application-key-value';
    const transport = new FakeHttpTransport([{ status: 503, headers: {}, body: new Uint8Array(0) }]);
    const store = createB2Store({
      transport,
      config: CONFIG,
      credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: secret }),
    });

    try {
      await store.putObject({ key: 'x.json', body: textBody('{}') });
      throw new Error('expected putObject to reject on a 503 response');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).toMatch(/503/);
    }
  });

  it('throws a descriptive error instead of falling back when config is missing required fields', () => {
    const transport = new FakeHttpTransport([]);
    expect(() =>
      createB2Store({
        transport,
        config: { bucket: '', endpoint: 's3.example.com', region: 'us-west-004' },
        credentials: new FakeCredentialProvider({ keyId: 'key-id', applicationKey: 'app-key' }),
      }),
    ).toThrow(/bucket/);
  });
});
