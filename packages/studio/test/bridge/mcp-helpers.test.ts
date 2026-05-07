/**
 * Pure helpers from mcp-tools.ts — `isLoopbackAddress`, `isOriginAllowed`,
 * `serializeAwaitResult`, `approximatePayloadSize`, `combineSignals`,
 * `MAX_PAYLOAD_BYTES`. Tested directly, no SDK or Hono coupling.
 */

import { describe, it, expect } from 'vitest';
import { isLoopbackAddress, isOriginAllowed } from '@/bridge/mcp-server.ts';
import {
  serializeAwaitResult,
  approximatePayloadSize,
  combineSignals,
  MAX_PAYLOAD_BYTES,
} from '@/bridge/mcp-tools.ts';

describe('isLoopbackAddress', () => {
  it('accepts loopback variants', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('localhost')).toBe(true);
  });

  it('rejects non-loopback addresses and undefined', () => {
    expect(isLoopbackAddress('192.168.1.1')).toBe(false);
    expect(isLoopbackAddress('10.0.0.1')).toBe(false);
    expect(isLoopbackAddress('100.64.1.2')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress('')).toBe(false);
    expect(isLoopbackAddress('0.0.0.0')).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('allows undefined (server-to-server clients omit Origin)', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('allows the literal "null" origin (file:// and sandboxed iframes)', () => {
    expect(isOriginAllowed('null')).toBe(true);
  });

  it('allows http://localhost on any port', () => {
    expect(isOriginAllowed('http://localhost')).toBe(true);
    expect(isOriginAllowed('http://localhost:47321')).toBe(true);
    expect(isOriginAllowed('http://LOCALHOST:9999')).toBe(true);
  });

  it('allows http://127.0.0.1 on any port', () => {
    expect(isOriginAllowed('http://127.0.0.1')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:9999')).toBe(true);
  });

  it('allows http://[::1] on any port', () => {
    expect(isOriginAllowed('http://[::1]')).toBe(true);
    expect(isOriginAllowed('http://[::1]:9999')).toBe(true);
  });

  it('rejects cross-site origins (DNS-rebinding / CSRF surface)', () => {
    expect(isOriginAllowed('http://attacker.example')).toBe(false);
    expect(isOriginAllowed('http://evil.example:80')).toBe(false);
    expect(isOriginAllowed('https://localhost')).toBe(false);
    expect(isOriginAllowed('http://127.0.0.2')).toBe(false);
    expect(isOriginAllowed('http://localhostx')).toBe(false);
  });

  it('rejects malformed origins', () => {
    expect(isOriginAllowed('not a url')).toBe(false);
    expect(isOriginAllowed('')).toBe(false);
  });
});

describe('serializeAwaitResult / approximatePayloadSize / combineSignals', () => {
  it('serializeAwaitResult — null branch', () => {
    expect(serializeAwaitResult({ received: false, message: null })).toEqual({
      received: false,
      message: null,
    });
  });

  it('serializeAwaitResult — message branch with contextRef', () => {
    const r = serializeAwaitResult({
      received: true,
      message: {
        seq: 7,
        ts: 1000,
        role: 'operator',
        text: 'hi',
        contextRef: 'entry/abc',
      },
    });
    expect(r).toEqual({
      received: true,
      message: {
        seq: 7,
        ts: 1000,
        role: 'operator',
        text: 'hi',
        contextRef: 'entry/abc',
      },
    });
  });

  it('approximatePayloadSize — empty object yields a small positive number', () => {
    const n = approximatePayloadSize({});
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(MAX_PAYLOAD_BYTES);
  });

  it('approximatePayloadSize — 2 MB string exceeds MAX_PAYLOAD_BYTES', () => {
    const big = 'x'.repeat(2 * 1024 * 1024);
    expect(approximatePayloadSize(big)).toBeGreaterThan(MAX_PAYLOAD_BYTES);
  });

  it('combineSignals — abort propagates from either side', () => {
    const a = new AbortController();
    const b = new AbortController();
    const sig = combineSignals(a.signal, b.signal);
    expect(sig.aborted).toBe(false);
    a.abort(new Error('a'));
    expect(sig.aborted).toBe(true);
  });

  it('MAX_PAYLOAD_BYTES is 1MB', () => {
    expect(MAX_PAYLOAD_BYTES).toBe(1_048_576);
  });
});
