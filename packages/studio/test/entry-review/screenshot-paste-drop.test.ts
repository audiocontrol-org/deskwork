/**
 * @vitest-environment jsdom
 *
 * Phase 8 Step 8.4.3 — paste / drag-drop handler tests.
 *
 * Verifies the two surface affordances:
 *   - bindPasteHandler — intercepts ClipboardEvent with image bytes,
 *     persists to the orphan endpoint, fires onScreenshotAttached.
 *     Plain-text pastes pass through (no preventDefault, no callback).
 *   - bindDragDropHandler — intercepts DragEvent with image File,
 *     persists, fires onScreenshotAttached. Non-image drags pass
 *     through.
 *
 * `fetch` is mocked globally so the orphan-screenshot POST is
 * observable; the helper modules are exercised end-to-end (extract +
 * persist + callback wire-up).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bindPasteHandler,
  bindDragDropHandler,
  extractImageFromClipboard,
  extractImageFromDrop,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/screenshot-paste-drop.ts';

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockOrphanSuccess(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    mockResponse(200, {
      writtenPath:
        '/proj/.deskwork/screenshots-orphan/2026-06-01T00-00-00-000Z-deadbeef.png',
      relativeWrittenPath:
        '.deskwork/screenshots-orphan/2026-06-01T00-00-00-000Z-deadbeef.png',
    }),
  );
}

function pngBlob(): Blob {
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
    type: 'image/png',
  });
}

/**
 * jsdom does NOT expose `ClipboardEvent` as a global, so we build a
 * synthetic Event of type 'paste' with a fake `clipboardData`
 * accessor. The handler narrows on the field shape, not on
 * `instanceof ClipboardEvent`, so this is sufficient.
 */
function makeClipboardEvent(file: File | null): Event {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  const items: DataTransferItem[] = [];
  const files: File[] = [];
  if (file !== null) {
    files.push(file);
    items.push({
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
      getAsString: () => undefined,
      webkitGetAsEntry: () => null,
    } as unknown as DataTransferItem);
  }
  const data = {
    items: { length: items.length, ...items } as unknown as DataTransferItemList,
    files: { length: files.length, ...files } as unknown as FileList,
    types: file !== null ? ['Files'] : [],
    getData: () => '',
    setData: () => undefined,
    clearData: () => undefined,
    dropEffect: 'copy' as const,
    effectAllowed: 'all' as const,
  } as unknown as DataTransfer;
  Object.defineProperty(ev, 'clipboardData', { value: data });
  return ev;
}

/**
 * jsdom does NOT expose `DragEvent` as a global, so we build a
 * synthetic event of type 'drop' with a fake `dataTransfer` accessor
 * — the handler narrows on the shape (`dataTransfer.files`), not on
 * `instanceof DragEvent`, so this is sufficient.
 */
function makeDragEvent(file: File | null, type: string = 'drop'): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const files: File[] = file !== null ? [file] : [];
  const data = {
    files: { length: files.length, ...files } as unknown as FileList,
    items: { length: 0 } as unknown as DataTransferItemList,
    types: file !== null ? ['Files'] : [],
    getData: () => '',
    setData: () => undefined,
    clearData: () => undefined,
    dropEffect: 'copy' as const,
    effectAllowed: 'all' as const,
  } as unknown as DataTransfer;
  Object.defineProperty(ev, 'dataTransfer', { value: data });
  return ev;
}

describe('extractImageFromClipboard', () => {
  it('returns the file when clipboardData has an image item', () => {
    const file = new File([pngBlob()], 'unused.png', { type: 'image/png' });
    const ev = makeClipboardEvent(file);
    expect(extractImageFromClipboard(ev)).not.toBeNull();
  });

  it('returns null when clipboardData carries no image (plain text paste)', () => {
    const ev = makeClipboardEvent(null);
    expect(extractImageFromClipboard(ev)).toBeNull();
  });

  it('returns null when the event has no clipboardData shape', () => {
    // Plain Event (no `clipboardData` accessor) — handler's
    // type-guard narrows it out before touching the field.
    const ev = new Event('paste');
    expect(extractImageFromClipboard(ev)).toBeNull();
  });
});

describe('extractImageFromDrop', () => {
  it('returns the file when dataTransfer carries an image', () => {
    const file = new File([pngBlob()], 'pic.png', { type: 'image/png' });
    const ev = makeDragEvent(file);
    expect(extractImageFromDrop(ev)).not.toBeNull();
  });

  it('returns null when no image was dropped', () => {
    const ev = makeDragEvent(null);
    expect(extractImageFromDrop(ev)).toBeNull();
  });

  it('returns null when the drop carried a non-image file', () => {
    const file = new File(['text'], 'doc.txt', { type: 'text/plain' });
    const ev = makeDragEvent(file);
    expect(extractImageFromDrop(ev)).toBeNull();
  });
});

describe('bindPasteHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the pasted image and fires onScreenshotAttached', async () => {
    const fetchSpy = mockOrphanSuccess();
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    const onScreenshotAttached = vi.fn();
    const onError = vi.fn();
    bindPasteHandler(target, {
      onScreenshotAttached,
      onError,
      now: () => new Date('2026-06-01T00:00:00.000Z'),
    });
    const file = new File([pngBlob()], 'paste.png', { type: 'image/png' });
    const ev = makeClipboardEvent(file);
    target.dispatchEvent(ev);
    // Let the async persist promise resolve.
    // Allow microtasks to flush — the paste handler chains
    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
    // single tick isn't enough; 5 ticks lets all the awaits resolve
    // before the assertion runs.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onScreenshotAttached).toHaveBeenCalledTimes(1);
    const call = onScreenshotAttached.mock.calls[0][0];
    expect(call.relativeWrittenPath).toMatch(/screenshots-orphan/);
    expect(call.filename).toMatch(/\.png$/);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not call onScreenshotAttached for a plain-text paste', async () => {
    const fetchSpy = mockOrphanSuccess();
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    const onScreenshotAttached = vi.fn();
    bindPasteHandler(target, { onScreenshotAttached });
    const ev = makeClipboardEvent(null); // no file
    target.dispatchEvent(ev);
    // Allow microtasks to flush — the paste handler chains
    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
    // single tick isn't enough; 5 ticks lets all the awaits resolve
    // before the assertion runs.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onScreenshotAttached).not.toHaveBeenCalled();
  });

  it('preventDefaults the event when an image is intercepted', async () => {
    mockOrphanSuccess();
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    bindPasteHandler(target, { onScreenshotAttached: vi.fn() });
    const file = new File([pngBlob()], 'p.png', { type: 'image/png' });
    const ev = makeClipboardEvent(file);
    const pdSpy = vi.spyOn(ev, 'preventDefault');
    target.dispatchEvent(ev);
    expect(pdSpy).toHaveBeenCalled();
  });

  it('calls onError on a persist failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(500, { error: 'disk full' }),
    );
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    const onError = vi.fn();
    bindPasteHandler(target, {
      onScreenshotAttached: vi.fn(),
      onError,
    });
    const file = new File([pngBlob()], 'p.png', { type: 'image/png' });
    target.dispatchEvent(makeClipboardEvent(file));
    // Allow microtasks to flush — the paste handler chains
    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
    // single tick isn't enough; 5 ticks lets all the awaits resolve
    // before the assertion runs.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/disk full|500/);
  });

  it('returns an unsubscribe function that removes the listener', async () => {
    const fetchSpy = mockOrphanSuccess();
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    const onScreenshotAttached = vi.fn();
    const unsubscribe = bindPasteHandler(target, { onScreenshotAttached });
    unsubscribe();
    const file = new File([pngBlob()], 'p.png', { type: 'image/png' });
    target.dispatchEvent(makeClipboardEvent(file));
    // Allow microtasks to flush — the paste handler chains
    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
    // single tick isn't enough; 5 ticks lets all the awaits resolve
    // before the assertion runs.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onScreenshotAttached).not.toHaveBeenCalled();
  });
});

describe('bindDragDropHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the dropped image and fires onScreenshotAttached', async () => {
    const fetchSpy = mockOrphanSuccess();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onScreenshotAttached = vi.fn();
    bindDragDropHandler(target, { onScreenshotAttached });
    const file = new File([pngBlob()], 'drop.png', { type: 'image/png' });
    target.dispatchEvent(makeDragEvent(file));
    // Allow microtasks to flush — the paste handler chains
    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
    // single tick isn't enough; 5 ticks lets all the awaits resolve
    // before the assertion runs.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onScreenshotAttached).toHaveBeenCalledTimes(1);
  });

  it('preventDefault on dragover so the drop is enabled', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    bindDragDropHandler(target, { onScreenshotAttached: vi.fn() });
    const ev = new Event('dragover', { bubbles: true, cancelable: true });
    const pdSpy = vi.spyOn(ev, 'preventDefault');
    target.dispatchEvent(ev);
    expect(pdSpy).toHaveBeenCalled();
  });

  it('does not fire the callback for a non-image drop', async () => {
    const fetchSpy = mockOrphanSuccess();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onScreenshotAttached = vi.fn();
    bindDragDropHandler(target, { onScreenshotAttached });
    const file = new File(['hi'], 'doc.txt', { type: 'text/plain' });
    target.dispatchEvent(makeDragEvent(file));
    // Allow microtasks to flush — the paste handler chains
    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
    // single tick isn't enough; 5 ticks lets all the awaits resolve
    // before the assertion runs.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onScreenshotAttached).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function that removes both listeners', async () => {
    const fetchSpy = mockOrphanSuccess();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const unsubscribe = bindDragDropHandler(target, {
      onScreenshotAttached: vi.fn(),
    });
    unsubscribe();
    const file = new File([pngBlob()], 'd.png', { type: 'image/png' });
    target.dispatchEvent(makeDragEvent(file));
    // Allow microtasks to flush — the paste handler chains
    // crypto.subtle.digest -> fetch -> res.json() -> callback. A
    // single tick isn't enough; 5 ticks lets all the awaits resolve
    // before the assertion runs.
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    // After unsubscribe, dragover preventDefault no longer fires.
    const ev = new Event('dragover', { bubbles: true, cancelable: true });
    const pdSpy = vi.spyOn(ev, 'preventDefault');
    target.dispatchEvent(ev);
    expect(pdSpy).not.toHaveBeenCalled();
  });
});
