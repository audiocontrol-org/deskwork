/**
 * @vitest-environment jsdom
 *
 * Phase 8 Step 8.4.1 — client-side attach-to-comment workflow tests.
 *
 * Two flows under test:
 *   - `attachScreenshotToComment` — PATCHes an existing comment's
 *     attachments[] with the full intended list (prior + new path).
 *   - `createCommentWithAttachment` — POSTs a new comment annotation
 *     pre-attached to the screenshot.
 *
 * `fetch` is mocked globally; assertions cover URL shape, method,
 * payload composition, and error surfacing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  attachScreenshotToComment,
  createCommentWithAttachment,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/screenshot-attach.ts';

const ENTRY_UUID = '11111111-1111-4111-8111-111111111111';
const COMMENT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCREENSHOT_PATH =
  'docs/foo/scrapbook/screenshots/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-2026-05-31T15-32-04-500Z.png';

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getCallInit(fetchSpy: ReturnType<typeof vi.spyOn>): RequestInit {
  const calls = fetchSpy.mock.calls;
  if (calls.length === 0) throw new Error('fetch never called');
  const init = calls[0][1];
  if (!init) throw new Error('fetch called without init arg');
  return init as RequestInit;
}

function bodyAsJson(init: RequestInit): Record<string, unknown> {
  const body = init.body;
  if (typeof body !== 'string') throw new Error('expected JSON-string body');
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('expected JSON object body');
  }
  return parsed as Record<string, unknown>;
}

describe('attachScreenshotToComment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PATCHes the comment endpoint with the prior attachments + new path concatenated', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockResponse(200, { annotation: { id: 'edit-id', type: 'edit-comment' } }),
      );
    const result = await attachScreenshotToComment(
      ENTRY_UUID,
      COMMENT_UUID,
      ['scrapbook/screenshots/existing.png'],
      SCREENSHOT_PATH,
    );
    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0];
    expect(firstCall[0]).toBe(
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/comments/${COMMENT_UUID}`,
    );
    const init = getCallInit(fetchSpy);
    expect(init.method).toBe('PATCH');
    const body = bodyAsJson(init);
    expect(body.attachments).toEqual([
      'scrapbook/screenshots/existing.png',
      SCREENSHOT_PATH,
    ]);
  });

  it('sends just the new path when the comment has no prior attachments', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockResponse(200, { annotation: { id: 'x', type: 'edit-comment' } }),
      );
    await attachScreenshotToComment(ENTRY_UUID, COMMENT_UUID, [], SCREENSHOT_PATH);
    const init = getCallInit(fetchSpy);
    const body = bodyAsJson(init);
    expect(body.attachments).toEqual([SCREENSHOT_PATH]);
  });

  it('throws with the server-supplied error reason on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(404, { error: 'unknown commentId' }),
    );
    await expect(
      attachScreenshotToComment(ENTRY_UUID, COMMENT_UUID, [], SCREENSHOT_PATH),
    ).rejects.toThrow(/404.*unknown commentId/);
  });

  it('throws on a non-JSON error response (status only)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 500 }),
    );
    await expect(
      attachScreenshotToComment(ENTRY_UUID, COMMENT_UUID, [], SCREENSHOT_PATH),
    ).rejects.toThrow(/500/);
  });
});

describe('createCommentWithAttachment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs a new comment annotation with the screenshot pre-attached', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockResponse(200, {
          annotation: { id: 'new-ann-id', type: 'comment' },
        }),
      );
    const { annotationId } = await createCommentWithAttachment(
      ENTRY_UUID,
      {
        text: 'see screenshot — alignment is off on the right',
        version: 3,
        range: { start: 0, end: 10 },
        category: 'structural',
      },
      SCREENSHOT_PATH,
    );
    expect(annotationId).toBe('new-ann-id');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0];
    expect(firstCall[0]).toBe(
      `/api/dev/editorial-review/entry/${ENTRY_UUID}/annotate`,
    );
    const init = getCallInit(fetchSpy);
    expect(init.method).toBe('POST');
    const body = bodyAsJson(init);
    expect(body.type).toBe('comment');
    expect(body.workflowId).toBe(ENTRY_UUID);
    expect(body.version).toBe(3);
    expect(body.text).toBe('see screenshot — alignment is off on the right');
    expect(body.range).toEqual({ start: 0, end: 10 });
    expect(body.category).toBe('structural');
    expect(body.attachments).toEqual([SCREENSHOT_PATH]);
  });

  it('omits optional fields (category / anchor / replyTo) when not provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockResponse(200, { annotation: { id: 'ann-id', type: 'comment' } }),
      );
    await createCommentWithAttachment(
      ENTRY_UUID,
      { text: 'plain', version: 1, range: { start: 0, end: 1 } },
      SCREENSHOT_PATH,
    );
    const init = getCallInit(fetchSpy);
    const body = bodyAsJson(init);
    expect(body.category).toBeUndefined();
    expect(body.anchor).toBeUndefined();
    expect(body.replyTo).toBeUndefined();
    expect(body.attachments).toEqual([SCREENSHOT_PATH]);
  });

  it('threads the replyTo field when supplied (new threaded reply with attachment)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        mockResponse(200, { annotation: { id: 'ann-id', type: 'comment' } }),
      );
    await createCommentWithAttachment(
      ENTRY_UUID,
      {
        text: 'reply with screenshot',
        version: 1,
        range: { start: 0, end: 1 },
        replyTo: COMMENT_UUID,
      },
      SCREENSHOT_PATH,
    );
    const init = getCallInit(fetchSpy);
    const body = bodyAsJson(init);
    expect(body.replyTo).toBe(COMMENT_UUID);
  });

  it('throws when the success response is missing annotation.id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(200, { annotation: { type: 'comment' } }),
    );
    await expect(
      createCommentWithAttachment(
        ENTRY_UUID,
        { text: 'x', version: 1, range: { start: 0, end: 1 } },
        SCREENSHOT_PATH,
      ),
    ).rejects.toThrow(/missing annotation\.id/);
  });

  it('throws with the server-supplied error reason on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(404, { error: 'unknown entry' }),
    );
    await expect(
      createCommentWithAttachment(
        ENTRY_UUID,
        { text: 'x', version: 1, range: { start: 0, end: 1 } },
        SCREENSHOT_PATH,
      ),
    ).rejects.toThrow(/404.*unknown entry/);
  });
});
