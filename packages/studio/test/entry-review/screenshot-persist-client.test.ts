/**
 * @vitest-environment jsdom
 *
 * Phase 8 Step 8.3.3 — client-side persist helper tests.
 *
 * Verifies `postEntryScreenshot` / `postOrphanScreenshot` drive the
 * expected URLs and multipart shape, and that response-shape errors
 * surface as thrown errors (no silent fallback).
 *
 * `fetch` is mocked globally; the helper's only side effect is the
 * fetch call so the mock captures everything we need to assert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  postEntryScreenshot,
  postOrphanScreenshot,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/screenshot-persist.ts';

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
const FILENAME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-2026-05-31T15-32-04-500Z.png';

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('postEntryScreenshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs multipart to the entry-screenshot endpoint with the supplied filename', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockResponse(200, {
          writtenPath: '/proj/docs/foo/scrapbook/screenshots/file.png',
          relativeWrittenPath: 'docs/foo/scrapbook/screenshots/file.png',
        }),
      );
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const result = await postEntryScreenshot(ENTRY_UUID, blob, FILENAME);
    expect(result.writtenPath).toBe(
      '/proj/docs/foo/scrapbook/screenshots/file.png',
    );
    expect(result.relativeWrittenPath).toBe(
      'docs/foo/scrapbook/screenshots/file.png',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0];
    expect(firstCall[0]).toBe(
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/screenshot`,
    );
    const init = firstCall[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    if (file instanceof File) {
      expect(file.name).toBe(FILENAME);
    }
  });

  it('throws on a non-2xx response with the server-supplied error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(404, { error: 'unknown entry: deadbeef' }),
    );
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(postEntryScreenshot(ENTRY_UUID, blob, FILENAME)).rejects.toThrow(
      /404.*unknown entry/,
    );
  });

  it('throws when the success response is missing writtenPath', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(200, { relativeWrittenPath: 'foo' }),
    );
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(postEntryScreenshot(ENTRY_UUID, blob, FILENAME)).rejects.toThrow(
      /missing writtenPath/,
    );
  });

  it('throws when the server returns non-JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 500 }),
    );
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(postEntryScreenshot(ENTRY_UUID, blob, FILENAME)).rejects.toThrow(
      /non-JSON/,
    );
  });
});

describe('postOrphanScreenshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs multipart to the orphan endpoint with the supplied filename', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockResponse(200, {
          writtenPath: '/proj/.deskwork/screenshots-orphan/orphan.png',
          relativeWrittenPath: '.deskwork/screenshots-orphan/orphan.png',
        }),
      );
    const blob = new Blob([new Uint8Array([9])], { type: 'image/png' });
    const orphanName = '2026-05-31T15-32-04-500Z-deadbeef.png';
    const result = await postOrphanScreenshot(blob, orphanName);
    expect(result.relativeWrittenPath).toBe(
      '.deskwork/screenshots-orphan/orphan.png',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      '/api/dev/editorial-review/screenshots/orphan',
    );
  });

  it('throws on a 409 collision response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(409, { error: 'screenshot already exists at /x.png' }),
    );
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await expect(
      postOrphanScreenshot(blob, '2026-05-31T15-32-04-500Z-cafe.png'),
    ).rejects.toThrow(/409.*already exists/);
  });
});
