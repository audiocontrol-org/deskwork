/**
 * Phase 8 Step 8.3.3 — client-side helpers for POSTing captured PNG
 * bytes to the studio's screenshot endpoints.
 *
 * Two paths mirror the server routes:
 *
 *   - `postEntryScreenshot(entryId, blob, filename)`
 *       Multipart POST to
 *       `/api/dev/editorial-review/entry/<entryId>/screenshot`. Used
 *       when the operator captures with a comment context (filename
 *       follows the entry-anchored convention).
 *
 *   - `postOrphanScreenshot(blob, filename)`
 *       Multipart POST to `/api/dev/editorial-review/screenshots/orphan`.
 *       Used for the capture-then-attach flow.
 *
 * Both helpers return `{ writtenPath, relativeWrittenPath }` on success
 * and throw a descriptive error on failure. Throwing (vs returning a
 * result-union) keeps callers tight — they `await` the post call and
 * surface the error via `reportError` / toast. Per project rules, no
 * silent fallback.
 *
 * Response parsing is hand-rolled (no `as` casts): we read each field
 * with a typeof guard so a misshaped server response surfaces clearly
 * rather than silently downcasting to `string`.
 */

const ENTRY_BASE = '/api/dev/editorial-review/entry';
const ORPHAN_URL = '/api/dev/editorial-review/screenshots/orphan';

export interface PersistResponse {
  readonly writtenPath: string;
  readonly relativeWrittenPath: string;
}

export async function postEntryScreenshot(
  entryId: string,
  blob: Blob,
  filename: string,
): Promise<PersistResponse> {
  const form = new FormData();
  form.append('file', blob, filename);
  const url = `${ENTRY_BASE}/${encodeURIComponent(entryId)}/screenshot`;
  return doPost(url, form);
}

export async function postOrphanScreenshot(
  blob: Blob,
  filename: string,
): Promise<PersistResponse> {
  const form = new FormData();
  form.append('file', blob, filename);
  return doPost(ORPHAN_URL, form);
}

async function doPost(url: string, form: FormData): Promise<PersistResponse> {
  const res = await fetch(url, { method: 'POST', body: form });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      `screenshot upload: server returned non-JSON response (status ${res.status})`,
    );
  }
  if (!res.ok) {
    const errMsg = extractStringField(body, 'error');
    throw new Error(
      `screenshot upload failed (status ${res.status}): ${errMsg ?? '<no error field in response>'}`,
    );
  }
  return parseSuccessBody(body);
}

function parseSuccessBody(body: unknown): PersistResponse {
  const writtenPath = extractStringField(body, 'writtenPath');
  const relativeWrittenPath = extractStringField(body, 'relativeWrittenPath');
  if (writtenPath === null || relativeWrittenPath === null) {
    throw new Error(
      'screenshot upload: success response missing writtenPath / relativeWrittenPath',
    );
  }
  return { writtenPath, relativeWrittenPath };
}

function extractStringField(body: unknown, field: string): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const v = Reflect.get(body, field);
  return typeof v === 'string' ? v : null;
}
