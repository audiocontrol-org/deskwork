/**
 * Phase 8 Step 8.4.3 — paste / drag-drop handlers for the comment
 * input field.
 *
 * The two surface affordances reuse a single internal pipeline:
 *
 *   1. Extract an image file from the event (ClipboardEvent or
 *      DragEvent).
 *   2. POST the bytes to the orphan-screenshot endpoint (the
 *      capture-then-attach pipeline from Step 8.3.3). The orphan
 *      path is the right destination because the comment in flight
 *      doesn't have a commentId yet — when the operator submits, the
 *      controller calls the promote endpoint to move the orphan
 *      into the entry-anchored path AND bind it to the new comment.
 *   3. Notify the caller via the supplied `onScreenshotAttached`
 *      callback so it can show a thumbnail / preview / pending
 *      marker on the comment input UI.
 *
 * The handlers do NOT touch the comment input's DOM directly — they
 * are pure event-to-callback pipes. The caller wires them onto the
 * input element + composer container and reacts to the callback by
 * surfacing the operator-visible state.
 *
 * Filename rules: pasted clipboard image bytes typically have no
 * sensible name attached, so we synthesize one with the orphan
 * convention (`<ISO-timestamp>-<hash>.png`). Drag-drop files DO
 * have names but we ignore them — security boundary against
 * operator-supplied path-traversal characters. The synthesized name
 * matches the orphan filename regex on the server side.
 *
 * Affordance scope: the paste handler attaches to the comment input
 * element (where the operator's typing focus is); the drag-drop
 * handler attaches to the comment composer container (a larger drop
 * target). Both fire the same callback so the caller's state machine
 * stays simple.
 */

import { postOrphanScreenshot } from './screenshot-persist.ts';
import {
  filesystemSafeIsoTimestamp,
  shortHashOfBlob,
} from './screenshot-capture.ts';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export interface AttachmentEvent {
  /** Relative path the orphan-screenshot endpoint persisted to. */
  readonly relativeWrittenPath: string;
  /** The filename (without directory) the endpoint wrote. */
  readonly filename: string;
}

export interface AttachmentError {
  readonly message: string;
}

export interface PasteDropOptions {
  /**
   * Callback invoked when an image was successfully extracted from the
   * event, persisted to the orphan path, and is ready for the caller
   * to display as a pending attachment on the comment input.
   */
  readonly onScreenshotAttached: (ev: AttachmentEvent) => void;
  /**
   * Callback invoked when extraction OR persistence fails. Caller is
   * responsible for surfacing the error to the operator (toast / inline
   * error). Optional — when omitted, errors are silently swallowed
   * after preventing default (typical for the typing-paste-of-text
   * fallthrough case).
   */
  readonly onError?: (err: AttachmentError) => void;
  /**
   * Clock injection point for tests. Defaults to `() => new Date()`.
   */
  readonly now?: () => Date;
}

/**
 * Clipboard-event shape we care about. Same approach as the
 * `DragEventLike` shape — narrow on the runtime-present field rather
 * than `instanceof ClipboardEvent`, which jsdom may not expose
 * symmetrically across versions.
 */
interface ClipboardEventLike extends Event {
  readonly clipboardData: DataTransfer | null;
}

function isClipboardEventLike(ev: Event): ev is ClipboardEventLike {
  return 'clipboardData' in ev;
}

/**
 * Extract image bytes from a ClipboardEvent's `clipboardData`. Returns
 * the Blob when a recognised image MIME-type is present, or null
 * otherwise (the operator pasted plain text — the handler should let
 * the event propagate normally).
 */
export function extractImageFromClipboard(event: Event): Blob | null {
  if (!isClipboardEventLike(event)) return null;
  const data = event.clipboardData;
  if (!data) return null;
  for (let i = 0; i < data.items.length; i += 1) {
    const item = data.items[i];
    if (item.kind !== 'file') continue;
    if (!IMAGE_TYPES.includes(item.type)) continue;
    const file = item.getAsFile();
    if (file !== null) return file;
  }
  // Fallback: `clipboardData.files` may carry the image on some
  // browsers (notably Firefox handles screenshot-paste this way).
  for (let i = 0; i < data.files.length; i += 1) {
    const file = data.files[i];
    if (IMAGE_TYPES.includes(file.type)) return file;
  }
  return null;
}

/**
 * Drag-event shape we care about. jsdom does NOT ship the
 * `DragEvent` global by default, so we narrow on the runtime-present
 * `dataTransfer` field rather than `instanceof DragEvent`. The shape
 * is identical to the DOM spec.
 */
interface DragEventLike extends Event {
  readonly dataTransfer: DataTransfer | null;
}

function isDragEventLike(ev: Event): ev is DragEventLike {
  // `dataTransfer` is a defined accessor on real DragEvent instances
  // (and on the test-shape we construct in jsdom via
  // Object.defineProperty). Guard against the field being missing
  // (a plain Event dispatched on the same target).
  return 'dataTransfer' in ev;
}

/**
 * Extract image bytes from a DragEvent's `dataTransfer.files`. Returns
 * the Blob when a recognised image file was dropped, or null when the
 * drop carried no image (text drag, link drag, etc.).
 */
export function extractImageFromDrop(event: Event): Blob | null {
  if (!isDragEventLike(event)) return null;
  const data = event.dataTransfer;
  if (!data) return null;
  for (let i = 0; i < data.files.length; i += 1) {
    const file = data.files[i];
    if (IMAGE_TYPES.includes(file.type)) return file;
  }
  return null;
}

/**
 * Persist the given blob to the orphan-screenshot endpoint with a
 * synthesized filename. Returns the {writtenPath, relativeWrittenPath,
 * filename} on success; rejects on network / server error so the
 * caller's onError handler fires.
 */
export async function persistAsOrphan(
  blob: Blob,
  now: () => Date = () => new Date(),
): Promise<AttachmentEvent> {
  const timestamp = filesystemSafeIsoTimestamp(now());
  const hash = await shortHashOfBlob(blob);
  const filename = `${timestamp}-${hash}.png`;
  const result = await postOrphanScreenshot(blob, filename);
  return { relativeWrittenPath: result.relativeWrittenPath, filename };
}

/**
 * Attach a `paste` listener to `element` that intercepts image-bearing
 * paste events and persists them to the orphan endpoint. Returns an
 * unsubscribe function that removes the listener.
 *
 * The handler calls `event.preventDefault()` when an image is detected
 * AND extraction succeeds — this prevents the browser's default
 * "paste image as a data: URL in the textarea" behavior, which would
 * leak the bytes inline into the comment text. Plain text pastes are
 * passed through unchanged.
 */
/**
 * Shared "image bytes were extracted from the event — persist them
 * and notify the caller" tail. Extracted so the paste + drop
 * handlers don't trip the clone-detection gate on the
 * preventDefault + try/await/catch shape.
 */
async function persistAndNotify(
  ev: Event,
  blob: Blob,
  options: PasteDropOptions,
): Promise<void> {
  ev.preventDefault();
  try {
    const attached = await persistAsOrphan(blob, options.now);
    options.onScreenshotAttached(attached);
  } catch (err) {
    if (options.onError) {
      options.onError({
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function bindPasteHandler(
  element: HTMLElement,
  options: PasteDropOptions,
): () => void {
  const handler = async (ev: Event): Promise<void> => {
    // No `instanceof ClipboardEvent` — jsdom isn't fully symmetric on
    // the global. `extractImageFromClipboard` narrows on the
    // `clipboardData` accessor and the items / files shape it reads.
    const blob = extractImageFromClipboard(ev);
    if (blob === null) return; // plain text paste — let it through
    await persistAndNotify(ev, blob, options);
  };
  element.addEventListener('paste', handler);
  return () => element.removeEventListener('paste', handler);
}

/**
 * Attach `dragover` + `drop` listeners to `element` so the operator
 * can drag-drop an image file from the OS filesystem onto the comment
 * composer. `dragover` MUST be intercepted to enable the drop (the
 * browser's default behavior rejects drops on most elements).
 *
 * The same caveat about `preventDefault` applies: when an image is
 * dropped AND extracted, we prevent default so the browser doesn't
 * navigate to the dropped file URL (the legacy fallback).
 */
export function bindDragDropHandler(
  element: HTMLElement,
  options: PasteDropOptions,
): () => void {
  const onDragOver = (ev: Event): void => {
    // Required to enable a drop on this element.
    ev.preventDefault();
  };
  const onDrop = async (ev: Event): Promise<void> => {
    // No `instanceof DragEvent` — jsdom doesn't expose the global in
    // every config. `extractImageFromDrop` narrows on the shape it
    // needs (`dataTransfer.files`) — that's the only field this
    // module actually reads.
    const blob = extractImageFromDrop(ev);
    if (blob === null) return;
    await persistAndNotify(ev, blob, options);
  };
  element.addEventListener('dragover', onDragOver);
  element.addEventListener('drop', onDrop);
  return () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('drop', onDrop);
  };
}
