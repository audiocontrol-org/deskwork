/**
 * specs/036-fleet-control-plane — T103 (RED), Phase 2 (Foundational) / PT-012.
 *
 * SSE framing incremental decoder: `createSseDecoder()` from
 * src/sidecar/uplink/sse-client.ts. This test pins the contract for
 * frame decoding (contracts/sidecar-plane-protocol.md § C4, research.md
 * § SSE client).
 *
 * The decoder is a pure, incremental machine: push raw chunk bytes,
 * get back COMPLETE events, or get back an empty array if the frame is
 * still incomplete. Comment frames (`:` prefix) are surfaced via a
 * separate callback, never as SseEvent. This separation enforces the
 * C4 rule: keepalive comments must re-arm the read-idle watchdog
 * *without* being treated as data events.
 *
 * API surface the test assumes (red at implementation time if any symbol
 * is missing or has a different signature):
 *
 *   interface SseEvent {
 *     readonly id?: string;
 *     readonly event?: string;
 *     readonly data: string;
 *     readonly retry?: number;
 *   }
 *
 *   interface SseDecoder {
 *     push(chunk: Uint8Array): SseEvent[];
 *     onComment(cb: (text: string) => void): void;
 *   }
 *
 *   export function createSseDecoder(): SseDecoder;
 *
 * Ref: eventsource-parser for correct frame semantics; the test targets
 * our wrapper, not the library directly.
 */

import { describe, expect, it } from 'vitest';
import type { SseDecoder, SseEvent } from '../../src/sidecar/uplink/sse-client.js';
import { createSseDecoder } from '../../src/sidecar/uplink/sse-client.js';

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('SseDecoder (T103 — SSE frame decoding, chunk-boundary resilience)', () => {
  it('single well-formed data: frame decodes to one event', () => {
    const decoder = createSseDecoder();
    const events = decoder.push(encode('data: hello\n\n'));

    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('hello');
    expect(events[0]?.id).toBeUndefined();
    expect(events[0]?.event).toBeUndefined();
    expect(events[0]?.retry).toBeUndefined();
  });

  it('captures id:, event:, retry: fields on the event', () => {
    const decoder = createSseDecoder();
    const events = decoder.push(
      encode('id: evt-42\nevent: notification\nretry: 5000\ndata: test message\n\n'),
    );

    expect(events).toHaveLength(1);
    const evt = events[0];
    expect(evt?.id).toBe('evt-42');
    expect(evt?.event).toBe('notification');
    expect(evt?.retry).toBe(5000);
    expect(evt?.data).toBe('test message');
  });

  it('frame split across two push() calls yields nothing until complete', () => {
    const decoder = createSseDecoder();

    // First push: partial frame, no terminating blank line
    const first = decoder.push(encode('id: 123\ndata: par'));
    expect(first).toHaveLength(0);

    // Second push: continuation + blank line completes the frame
    const second = decoder.push(encode('tial\n\n'));
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe('123');
    expect(second[0]?.data).toBe('partial');
  });

  it('frame split mid-line (even in the middle of a field name) still decodes correctly', () => {
    const decoder = createSseDecoder();

    // Split in the middle of the 'event:' line
    const first = decoder.push(encode('data: hello\nev'));
    expect(first).toHaveLength(0);

    const second = decoder.push(encode('ent: custom\n\n'));
    expect(second).toHaveLength(1);
    expect(second[0]?.data).toBe('hello');
    expect(second[0]?.event).toBe('custom');
  });

  it('comment frame (: prefix) is surfaced via callback, not as event', () => {
    const decoder = createSseDecoder();
    const comments: string[] = [];
    decoder.onComment((text) => {
      comments.push(text);
    });

    const events = decoder.push(encode(':keepalive\n\n'));

    expect(events).toHaveLength(0);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBe('keepalive');
  });

  it('comment frame does not corrupt a surrounding data frame', () => {
    const decoder = createSseDecoder();
    const comments: string[] = [];
    decoder.onComment((text) => {
      comments.push(text);
    });

    const chunk = encode(':comment 1\ndata: first\n\n:comment 2\ndata: second\n\n');
    const events = decoder.push(chunk);

    // Events for the data frames
    expect(events).toHaveLength(2);
    expect(events[0]?.data).toBe('first');
    expect(events[1]?.data).toBe('second');

    // Comments captured separately
    expect(comments).toHaveLength(2);
    expect(comments[0]).toBe('comment 1');
    expect(comments[1]).toBe('comment 2');
  });

  it('multiple complete frames in one chunk decode to multiple events in order', () => {
    const decoder = createSseDecoder();
    const chunk = encode(
      'id: 1\ndata: first\n\nid: 2\nevent: custom\ndata: second\n\ndata: third\n\n',
    );
    const events = decoder.push(chunk);

    expect(events).toHaveLength(3);
    expect(events[0]?.id).toBe('1');
    expect(events[0]?.data).toBe('first');
    expect(events[1]?.id).toBe('2');
    expect(events[1]?.event).toBe('custom');
    expect(events[1]?.data).toBe('second');
    expect(events[2]?.id).toBeUndefined();
    expect(events[2]?.data).toBe('third');
  });

  it('retry: field parsed as number', () => {
    const decoder = createSseDecoder();
    const events = decoder.push(encode('retry: 10000\ndata: backoff\n\n'));

    expect(events).toHaveLength(1);
    expect(events[0]?.retry).toBe(10000);
    expect(typeof events[0]?.retry).toBe('number');
  });

  it('data field with multiline content (continuation without field name)', () => {
    const decoder = createSseDecoder();
    // SSE spec: a line starting with no field name (just text after the colon's space)
    // extends the previous data field
    const events = decoder.push(encode('data: line 1\ndata: line 2\n\n'));

    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('line 1\nline 2');
  });

  it('empty data field yields empty string, not undefined', () => {
    const decoder = createSseDecoder();
    const events = decoder.push(encode('data: \n\n'));

    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('');
  });

  it('chunk boundary split across field values still assembles correctly', () => {
    const decoder = createSseDecoder();

    const first = decoder.push(encode('id: abc'));
    expect(first).toHaveLength(0);

    const second = decoder.push(encode('def\ndata: hello\n\n'));
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe('abcdef');
    expect(second[0]?.data).toBe('hello');
  });

  it('comment callback fires even when registered after decoder creation', () => {
    const decoder = createSseDecoder();

    const firstChunk = decoder.push(encode(':early comment\n\n'));
    // No callback registered yet, so the comment is dropped (no handler)
    expect(firstChunk).toHaveLength(0);

    const comments: string[] = [];
    decoder.onComment((text) => {
      comments.push(text);
    });

    // Register the same callback a second time to verify it doesn't double-fire
    decoder.onComment((text) => {
      comments.push(text);
    });

    const secondChunk = decoder.push(encode(':later comment\n\n'));
    expect(secondChunk).toHaveLength(0);
    // Only the comment from the second chunk, since callback was registered after the first.
    // Comment text is stripped of its leading ':' (and optional space) — consistent with the
    // rest of this suite (`:keepalive\n\n` => 'keepalive'). Length 1 pins the no-double-fire
    // contract; the value pins the strip contract.
    expect(comments).toEqual(['later comment']);
  });

  it('frame without blank-line terminator waits for next chunk', () => {
    const decoder = createSseDecoder();

    // No blank line yet
    const first = decoder.push(encode('data: incomplete'));
    expect(first).toHaveLength(0);

    // Still no blank line
    const second = decoder.push(encode(' more text'));
    expect(second).toHaveLength(0);

    // Now the blank line arrives
    const third = decoder.push(encode('\n\n'));
    expect(third).toHaveLength(1);
    expect(third[0]?.data).toBe('incomplete more text');
  });

  it('only: field with no value is ignored', () => {
    const decoder = createSseDecoder();
    const events = decoder.push(encode('unknown: value\ndata: test\n\n'));

    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('test');
  });

  it('multiple comment frames in sequence fire callback each time', () => {
    const decoder = createSseDecoder();
    const comments: string[] = [];
    decoder.onComment((text) => {
      comments.push(text);
    });

    const events = decoder.push(encode(':one\n\n:two\n\n:three\n\n'));
    expect(events).toHaveLength(0);
    expect(comments).toEqual(['one', 'two', 'three']);
  });

  it('very large data field is reassembled correctly', () => {
    const decoder = createSseDecoder();
    const largeData = 'x'.repeat(10000);

    // Send in small pieces to stress the buffering
    const first = decoder.push(encode(`data: ${largeData.slice(0, 3000)}`));
    expect(first).toHaveLength(0);

    const second = decoder.push(encode(largeData.slice(3000, 7000)));
    expect(second).toHaveLength(0);

    const third = decoder.push(encode(`${largeData.slice(7000)}\n\n`));
    expect(third).toHaveLength(1);
    expect(third[0]?.data).toBe(largeData);
  });

  it('retry: with non-numeric value is ignored or treated as NaN (implementation choice)', () => {
    const decoder = createSseDecoder();
    const events = decoder.push(encode('retry: not-a-number\ndata: test\n\n'));

    expect(events).toHaveLength(1);
    expect(events[0]?.data).toBe('test');
    // retry field may be undefined or NaN depending on implementation;
    // the key is that the frame is not rejected
  });

  it('field names are case-sensitive (per SSE spec)', () => {
    const decoder = createSseDecoder();
    const events = decoder.push(encode('ID: uppercase\ndata: test\n\n'));

    expect(events).toHaveLength(1);
    // "ID:" is not recognized as "id:", so the id field remains undefined
    expect(events[0]?.id).toBeUndefined();
    expect(events[0]?.data).toBe('test');
  });

  it('chunk boundary in the middle of blank-line terminator', () => {
    const decoder = createSseDecoder();

    const first = decoder.push(encode('data: hello\n'));
    expect(first).toHaveLength(0);

    const second = decoder.push(encode('\n'));
    expect(second).toHaveLength(1);
    expect(second[0]?.data).toBe('hello');
  });

  it('events maintain immutability per the interface contract', () => {
    const decoder = createSseDecoder();
    const events: SseEvent[] = decoder.push(encode('id: 42\ndata: immutable\n\n'));

    expect(events).toHaveLength(1);
    const evt = events[0];
    if (evt === undefined) {
      throw new Error('expected exactly one decoded event');
    }

    // Verify that the object is frozen or that fields are readonly
    // (implementation may use readonly properties or Object.freeze)
    expect(() => {
      // @ts-expect-error Attempting to modify a readonly property
      evt.id = 'modified';
    }).toThrow();
  });
});
