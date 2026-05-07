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

export function openSSE(app: Hono, url: string, headers?: Record<string, string>): Promise<OpenedSSE> {
  const controller = new AbortController();
  const init: RequestInit = headers === undefined
    ? { signal: controller.signal }
    : { signal: controller.signal, headers };
  return app.fetch(new Request(url, init)).then((response) => ({
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
  }));
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
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await Promise.race([
      reader.read().then((x) =>
        x.done
          ? ({ done: true } as const)
          : ({ done: false, chunk: decoder.decode(x.value) } as const),
      ),
      new Promise<{ done: true }>((resolve) =>
        setTimeout(() => resolve({ done: true } as const), 50),
      ),
    ]);
    if (r.done) {
      if (predicate(buf)) return buf;
      continue;
    }
    buf += r.chunk;
    if (predicate(buf)) {
      void reader.cancel();
      return buf;
    }
  }
  void reader.cancel();
  return buf;
}
