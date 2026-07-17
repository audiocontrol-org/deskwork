/**
 * specs/036-fleet-control-plane — T105 (RED), Phase 2 (Foundational).
 *
 * contracts/sidecar-plane-protocol.md § C4 pins two wire rules:
 *
 * 1. On reconnect, the client sends the last seen event id as the
 *    `Last-Event-ID` REQUEST HEADER, NOT as a query-string parameter on
 *    the URL. `SseConnectRequest` has no separate cursor field — headers
 *    are the only place a caller can put it — precisely to enforce this
 *    constraint.
 *
 * 2. The last-event-id buffer PERSISTS across events that omit `id:`.
 *    An event without an `id:` field does NOT clear the remembered id;
 *    the buffer only updates when a new `id:` arrives.
 *
 * This test pins the cursor advancement API and verifies it against an
 * injected fake transport:
 *
 * - `EventIdBuffer` tracks the Last-Event-ID per SSE client rules
 *   (persists across events that omit `id:`).
 * - `buildReconnectHeaders` injects `Last-Event-ID` into headers when
 *   the buffer is non-empty; never modifies the URL.
 * - A fake `SseTransport` captures the `headers` of each `connect()`
 *   request so assertions can verify the wire contract.
 *
 * No `any`, no `as`, no `@ts-ignore`. Strict TS.
 */

import { describe, expect, it } from 'vitest';
import type { SseConnectRequest, SseConnection, SseTransport } from '../../src/sidecar/uplink/transport.js';
import { buildReconnectHeaders, createEventIdBuffer } from '../../src/sidecar/uplink/reconnect.js';

// EventIdBuffer, createEventIdBuffer, and buildReconnectHeaders are pinned
// (and now implemented) in src/sidecar/uplink/reconnect.ts (T113); this test
// imports the real module rather than redeclaring the API shape locally.

describe('SSE Last-Event-ID handling (T105 — C4 wire contract)', () => {
  describe('EventIdBuffer', () => {
    it('persists across events that omit id', () => {
      const buffer = createEventIdBuffer();

      buffer.observe({ id: '5' });
      expect(buffer.current()).toBe('5');

      // Event with no id field — buffer should persist
      buffer.observe({});
      expect(buffer.current()).toBe('5');

      // Event with undefined id — also persists
      buffer.observe({ id: undefined });
      expect(buffer.current()).toBe('5');
    });

    it('updates to a new id when present', () => {
      const buffer = createEventIdBuffer();

      buffer.observe({ id: '1' });
      expect(buffer.current()).toBe('1');

      buffer.observe({ id: '2' });
      expect(buffer.current()).toBe('2');
    });

    it('starts undefined', () => {
      const buffer = createEventIdBuffer();
      expect(buffer.current()).toBeUndefined();
    });

    it('handles empty string id', () => {
      const buffer = createEventIdBuffer();

      buffer.observe({ id: '' });
      expect(buffer.current()).toBe('');

      buffer.observe({});
      expect(buffer.current()).toBe('');
    });
  });

  describe('buildReconnectHeaders', () => {
    it('includes Last-Event-ID when buffer is non-empty', () => {
      const headers = buildReconnectHeaders({}, '5');
      expect(headers['Last-Event-ID']).toBe('5');
    });

    it('omits Last-Event-ID when buffer is undefined', () => {
      const headers = buildReconnectHeaders({}, undefined);
      expect(headers['Last-Event-ID']).toBeUndefined();
      expect('Last-Event-ID' in headers).toBe(false);
    });

    it('preserves base headers', () => {
      const base = { authorization: 'bearer token123', 'user-agent': 'sidecar/1.0' };
      const headers = buildReconnectHeaders(base, '5');

      expect(headers['authorization']).toBe('bearer token123');
      expect(headers['user-agent']).toBe('sidecar/1.0');
      expect(headers['Last-Event-ID']).toBe('5');
    });

    it('base headers are copied, not mutated', () => {
      const base = Object.freeze({ authorization: 'bearer token' });
      const headers = buildReconnectHeaders(base, '5');

      // base should be untouched
      expect(base).toEqual({ authorization: 'bearer token' });
      // result should be a new object with the header added
      expect(headers).toEqual({ authorization: 'bearer token', 'Last-Event-ID': '5' });
    });
  });

  describe('Reconnect with SSE transport (Last-Event-ID as header, never query param)', () => {
    it('injects Last-Event-ID as request header, not query string', async () => {
      const capturedRequests: SseConnectRequest[] = [];

      class CapturingTransport implements SseTransport {
        async connect(request: SseConnectRequest): Promise<SseConnection> {
          capturedRequests.push(request);
          return {
            status: 200,
            headers: new Map([['content-type', 'text/event-stream']]),
            chunks: (async function* () {})(),
            close: () => {},
          };
        }
      }

      const transport = new CapturingTransport();
      const buffer = createEventIdBuffer();

      // Observe an event with an id
      buffer.observe({ id: 'evt-42' });

      // Build reconnect headers and connect
      const headers = buildReconnectHeaders({ 'user-agent': 'sidecar/1.0' }, buffer.current());
      const baseUrl = 'https://plane.example/stream';
      await transport.connect({ url: baseUrl, headers });

      // Verify the transport received the request
      expect(capturedRequests).toHaveLength(1);
      const req = capturedRequests[0]!;

      // URL must be untouched — no query string, no cursor leak
      expect(req.url).toBe(baseUrl);
      expect(req.url).not.toContain('?');
      expect(req.url).not.toContain('evt-42');

      // Last-Event-ID MUST be in headers
      expect(req.headers['Last-Event-ID']).toBe('evt-42');

      // Base headers must be preserved
      expect(req.headers['user-agent']).toBe('sidecar/1.0');
    });

    it('omits Last-Event-ID header when buffer is empty', async () => {
      const capturedRequests: SseConnectRequest[] = [];

      class CapturingTransport implements SseTransport {
        async connect(request: SseConnectRequest): Promise<SseConnection> {
          capturedRequests.push(request);
          return {
            status: 200,
            headers: new Map([['content-type', 'text/event-stream']]),
            chunks: (async function* () {})(),
            close: () => {},
          };
        }
      }

      const transport = new CapturingTransport();
      const buffer = createEventIdBuffer();

      // Buffer is empty; current() is undefined
      const headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });

      expect(capturedRequests).toHaveLength(1);
      const req = capturedRequests[0]!;

      // Last-Event-ID must not be in headers
      expect(req.headers['Last-Event-ID']).toBeUndefined();
      expect('Last-Event-ID' in req.headers).toBe(false);
    });

    it('persists buffer across reconnects', async () => {
      const capturedRequests: SseConnectRequest[] = [];

      class CapturingTransport implements SseTransport {
        async connect(request: SseConnectRequest): Promise<SseConnection> {
          capturedRequests.push(request);
          return {
            status: 200,
            headers: new Map([['content-type', 'text/event-stream']]),
            chunks: (async function* () {})(),
            close: () => {},
          };
        }
      }

      const transport = new CapturingTransport();
      const buffer = createEventIdBuffer();

      // First event has an id
      buffer.observe({ id: '1' });

      // First reconnect sends id '1'
      let headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });
      expect(capturedRequests[0]!.headers['Last-Event-ID']).toBe('1');

      // Next event has no id — buffer persists
      buffer.observe({});
      expect(buffer.current()).toBe('1');

      // Second reconnect still sends id '1'
      headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });
      expect(capturedRequests[1]!.headers['Last-Event-ID']).toBe('1');

      // New event with id '2' updates buffer
      buffer.observe({ id: '2' });
      expect(buffer.current()).toBe('2');

      // Third reconnect sends id '2'
      headers = buildReconnectHeaders({}, buffer.current());
      await transport.connect({ url: 'https://plane.example/stream', headers });
      expect(capturedRequests[2]!.headers['Last-Event-ID']).toBe('2');
    });
  });
});
