/**
 * Phase 8 Step 8.3.3 — shared route plumbing for the two screenshot
 * upload routes (entry-anchored + orphan).
 *
 * The two routes have near-identical request parsing (multipart body
 * with a `file` field), and identical error-shape mapping from the
 * persistence layer's exceptions to HTTP status codes. This module
 * lifts the shared bits so the route handlers in `api.ts` stay short
 * and stop tripping the clone-detection gate.
 *
 * Two exports:
 *
 *   - extractScreenshotUploadFile(c) — reads the multipart body,
 *     extracts the `file` field, validates it. Returns a tagged union
 *     so the caller can return the right error code.
 *
 *   - mapScreenshotErrorToResponse(err) — translates the persistence
 *     layer's documented error-message prefixes into `{ status, body }`
 *     tuples. Used by both routes to map the same set of exceptions.
 */

import type { Context } from 'hono';

export type ExtractedFile =
  | { readonly kind: 'ok'; readonly filename: string; readonly bytes: Uint8Array }
  | { readonly kind: 'err'; readonly status: 400; readonly message: string };

export async function extractScreenshotUploadFile(
  c: Context,
): Promise<ExtractedFile> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return { kind: 'err', status: 400, message: 'invalid multipart body' };
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return { kind: 'err', status: 400, message: 'file is required (multipart)' };
  }
  const filename = file.name;
  if (typeof filename !== 'string' || filename.length === 0) {
    return { kind: 'err', status: 400, message: 'uploaded file has no name' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { kind: 'ok', filename, bytes };
}

export interface ErrorMapping {
  readonly status: 400 | 404 | 409 | 500;
  readonly message: string;
}

export interface ErrorMappingOptions {
  /**
   * When provided, a `sidecar not found` error message becomes
   * `unknown entry: <entryId>` at status 404. Omitted for the orphan
   * route where there is no entry to look up.
   */
  readonly entryId?: string;
}

/**
 * Map an exception thrown by `persistEntryScreenshot` /
 * `persistOrphanScreenshot` to an HTTP status + message pair. The
 * persistence layer's documented contract names the message prefixes
 * this function keys on; if either side renames a prefix, the test
 * suite trips immediately.
 */
export function mapScreenshotErrorToResponse(
  err: unknown,
  options: ErrorMappingOptions = {},
): ErrorMapping {
  const msg = err instanceof Error ? err.message : String(err);
  if (options.entryId !== undefined && msg.startsWith('sidecar not found')) {
    return { status: 404, message: `unknown entry: ${options.entryId}` };
  }
  if (msg.startsWith('screenshot already exists at ')) {
    return { status: 409, message: msg };
  }
  if (
    msg.startsWith('screenshot filename') ||
    msg === 'screenshot filename is required'
  ) {
    return { status: 400, message: msg };
  }
  return { status: 500, message: `screenshot write failed: ${msg}` };
}
