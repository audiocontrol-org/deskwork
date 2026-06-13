/**
 * Phase 8 Step 8.3.1 — DOM-to-PNG screenshot capture helper for the
 * entry-keyed press-check surface.
 *
 * Per Phase 1's decision-doc (
 *   `docs/studio-design/ACCEPTED/2026-05-26-graphical-review-prior-art/brief.md`
 *   § "Screenshot capture"
 * ), the capture mechanism is `html-to-image` (the 2025/2026 consensus
 * successor to `html2canvas`). This module wraps `htmlToImage.toBlob`
 * with two responsibilities:
 *
 *   1. Capture a DOM element to a PNG `Blob`.
 *   2. Suggest a filename that matches the per-PRD persistence shape:
 *        - `<commentId>-<ISO-timestamp>.png` when binding to an existing
 *          comment (entry-anchored path).
 *        - `<ISO-timestamp>-<hash>.png` when capturing without a comment
 *          context (orphan / capture-then-attach path; Task 8.4 finalises).
 *
 * The helper does NOT persist the bytes — Step 8.3.3 (the server-side
 * write endpoint) owns that. This module is the read-the-DOM half;
 * `persistScreenshot` in `screenshot-persist.ts` is the write-to-disk
 * half. The two are split so each can be exercised in isolation under
 * jsdom (capture) and node (persist).
 *
 * Filename safety:
 *   - ISO timestamp segments are sanitised: `:` → `-`, `.` → `-` so the
 *     result is filesystem-safe on every OS the studio supports.
 *   - The hash (orphan path) is the first 8 hex chars of a SHA-256 of
 *     the captured bytes. We use the WebCrypto API (`crypto.subtle`)
 *     because it ships in every modern browser AND in node 20+'s
 *     global `crypto`, so the helper works the same in studio + tests.
 *
 * Error handling per project rules:
 *   - `toBlob` returns `Blob | null` when the canvas serialisation
 *     fails (e.g. tainted canvas from a cross-origin image). We throw
 *     a descriptive error in that case rather than synthesising a
 *     placeholder — fallbacks are bug factories.
 */

import { toBlob as htmlToImageToBlob } from 'html-to-image';

/**
 * UUID-shape regex matching the entry-review schema. Used to validate
 * the optional `commentId` so a caller passing a non-UUID can't smuggle
 * path-traversal characters into the suggested filename.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CaptureOptions {
  /**
   * Optional comment id. When present AND it matches the UUID shape,
   * the suggested filename uses the entry-anchored form
   * `<commentId>-<ISO-timestamp>.png`. When absent or malformed, the
   * orphan form `<ISO-timestamp>-<hash>.png` is used.
   */
  readonly commentId?: string;
  /**
   * Injection point for tests. Defaults to `() => new Date()`. The
   * helper formats the timestamp internally so callers don't have to
   * worry about ISO-vs-filesystem-safe shaping.
   */
  readonly now?: () => Date;
  /**
   * Forwarded `pixelRatio` to `html-to-image`. Tests can leave this
   * unset; the library's default (`window.devicePixelRatio` in
   * browsers, `1` in jsdom) is fine for the v1 surface.
   */
  readonly pixelRatio?: number;
}

export interface CaptureResult {
  readonly blob: Blob;
  readonly suggestedFilename: string;
}

/**
 * Capture a DOM element to a PNG `Blob` and return it paired with a
 * suggested filename. See module docstring for the filename rules.
 *
 * Throws when `html-to-image` returns `null` (canvas serialisation
 * failure) — callers should surface the error to the operator rather
 * than persist a partial / blank capture.
 */
export async function captureElementToPng(
  element: HTMLElement,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const blob = await htmlToImageToBlob(
    element,
    options.pixelRatio !== undefined ? { pixelRatio: options.pixelRatio } : {},
  );
  if (blob === null) {
    throw new Error(
      'screenshot-capture: html-to-image returned null — canvas serialisation failed (likely a tainted canvas from a cross-origin asset)',
    );
  }
  const now = (options.now ?? (() => new Date()))();
  const timestamp = filesystemSafeIsoTimestamp(now);
  const commentId = options.commentId;
  let suggestedFilename: string;
  if (commentId !== undefined && UUID_RE.test(commentId)) {
    suggestedFilename = `${commentId}-${timestamp}.png`;
  } else {
    const hash = await shortHashOfBlob(blob);
    suggestedFilename = `${timestamp}-${hash}.png`;
  }
  return { blob, suggestedFilename };
}

/**
 * Convert an ISO timestamp (e.g. `2026-05-31T15:32:04.500Z`) into a
 * filesystem-safe form (`2026-05-31T15-32-04-500Z`). Replaces `:` and
 * `.` with `-` so the result lands the same on POSIX + Windows-
 * style filename rules.
 */
export function filesystemSafeIsoTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Compute a short SHA-256 prefix (first 8 hex chars, 32 bits) over the
 * blob bytes. Used by the orphan-path filename. Exposed for the test
 * suite — the controller doesn't call this directly.
 */
export async function shortHashOfBlob(blob: Blob): Promise<string> {
  // Wrap in a same-realm Uint8Array view: under jsdom on Node 20 the blob's
  // ArrayBuffer comes from another realm and fails webcrypto's brand check.
  const buf = new Uint8Array(await blob.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 4; i += 1) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}
