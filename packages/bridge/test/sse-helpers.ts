/**
 * SSE test helpers for bridge route tests. Open a stream via Hono's
 * `app.fetch`, read decoded chunks until a predicate matches (or a
 * short timeout fires), and clean up the body so vitest doesn't
 * complain about an unclosed stream.
 */

import type { Hono } from 'hono';

export interface OpenedSSE {
  readonly response: Response;
  readonly controller: AbortController;
  close(): Promise<void>;
}

export async function openSSE(
  app: Hono,
  url: string,
  headers?: Record<string, string>,
): Promise<OpenedSSE> {
  const controller = new AbortController();
  const init: RequestInit = headers === undefined
    ? { signal: controller.signal }
    : { signal: controller.signal, headers };
  // Hono's `fetch` returns `Response | Promise<Response>` — sync for a
  // bare app without async middleware, async otherwise. Awaiting the
  // union normalizes both shapes.
  const response = await app.fetch(new Request(url, init));
  return {
    response,
    controller,
    close: async () => {
      controller.abort();
      try {
        await response.body?.cancel();
      } catch {
        // Aborting an in-flight stream may produce a rejection on cancel.
      }
    },
  };
}

export async function readSSEUntil(
  res: Response,
  predicate: (decoded: string) => boolean,
  timeoutMs = 500,
): Promise<string> {
  const reader = res.body?.getReader();
  if (reader === undefined) throw new Error('expected SSE body');
  const decoder = new TextDecoder();
  let buf = '';
  // Single-loop with cancel-on-timer: the outstanding `read()` returns
  // `done: true` when `reader.cancel()` fires, so the loop exits cleanly
  // without a Promise.race that could drop a chunk that arrived just
  // after the timer won.
  const timer = setTimeout(() => {
    void reader.cancel();
  }, timeoutMs);
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) return buf;
      buf += decoder.decode(r.value, { stream: true });
      if (predicate(buf)) return buf;
    }
  } finally {
    clearTimeout(timer);
  }
}
