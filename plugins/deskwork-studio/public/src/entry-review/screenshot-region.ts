/**
 * Phase 8 Step 8.3.2 — selection-rectangle UI for region capture on the
 * entry-keyed press-check surface.
 *
 * Capture paths (per workplan):
 *   - Full-frame: caller invokes `captureElementToPng` directly on the
 *     entry preview's root element.
 *   - Region: caller invokes `selectRegion()` first to overlay a draw
 *     surface over the viewport, lets the operator drag a rectangle,
 *     then captures the element + crops the resulting canvas to the
 *     region bounds via `cropCanvasToRegion`.
 *
 * Two responsibilities, one module:
 *
 *   1. `selectRegion()` — opens the overlay, returns a Promise that
 *      resolves with a `RegionBounds` (page-coordinate rectangle) on
 *      mouseup, OR resolves with `null` if the operator cancels (Esc
 *      key, click outside the entry preview, or a degenerate rectangle
 *      under the minimum-size threshold).
 *   2. `cropCanvasToRegion()` — pure pixel-math helper that takes a
 *      source canvas (from html-to-image's `toCanvas`), the source
 *      element's page-coordinate bounding rect, the desired region's
 *      page-coordinate rect, and the device pixel ratio used during
 *      capture; returns a fresh canvas containing just the region.
 *
 * Splitting the two halves lets the controller drive the overlay in
 * the browser AND the crop math be exercised in jsdom (jsdom's
 * canvas-2d context is a no-op shim, but the source coordinate
 * arithmetic and the output dimensions can still be asserted).
 *
 * Affordance placement note: per `.claude/rules/affordance-placement.md`,
 * the trigger button that opens the overlay lives ON the entry-preview
 * component, not in a generic toolbar. This module is the overlay
 * controller; button wire-up is the caller's concern.
 */

const OVERLAY_CLASS = 'er-screenshot-region-overlay';
const RECT_CLASS = 'er-screenshot-region-rect';
const MIN_REGION_PX = 4;
const OVERLAY_Z_INDEX = '9000';

export interface RegionBounds {
  /** Page-x of the rect's top-left corner (`pageX` semantics: scroll-inclusive). */
  readonly pageX: number;
  /** Page-y of the rect's top-left corner. */
  readonly pageY: number;
  readonly width: number;
  readonly height: number;
}

export interface SelectRegionOptions {
  /**
   * Document the overlay attaches to. Defaults to the global `document`
   * when not supplied. The dependency-injection seam lets tests pass a
   * jsdom document without depending on the global.
   */
  readonly doc?: Document;
  /**
   * Inversion-of-control for cancel events. Tests can resolve the
   * promise synchronously by firing the events the controller listens
   * for; production callers don't pass this.
   */
  readonly onMounted?: (overlay: HTMLElement) => void;
  /**
   * Minimum width AND height of the region rect, in CSS pixels. Drags
   * smaller than this resolve as `null` (treated as a click-and-no-drag
   * cancel). Default 4 px so the operator can't accidentally save a
   * 0-pixel screenshot.
   */
  readonly minPx?: number;
}

/**
 * Mount a full-viewport overlay, listen for a mousedown→move→up drag,
 * resolve with the page-coordinate rectangle. Resolves with `null`
 * when:
 *   - The operator presses Escape.
 *   - The mouseup happens with rect dimensions < `minPx` (degenerate
 *     drag / accidental click).
 *
 * The overlay is removed from the DOM before the promise resolves so
 * the caller can immediately call into `captureElementToPng` without
 * the overlay showing up in the screenshot.
 */
export function selectRegion(
  options: SelectRegionOptions = {},
): Promise<RegionBounds | null> {
  const doc = options.doc ?? document;
  const minPx = options.minPx ?? MIN_REGION_PX;
  return new Promise<RegionBounds | null>((resolve) => {
    const overlay = doc.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Drag to select capture region; Esc to cancel');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = OVERLAY_Z_INDEX;
    overlay.style.cursor = 'crosshair';
    overlay.style.background = 'rgba(0, 0, 0, 0.18)';

    const rect = doc.createElement('div');
    rect.className = RECT_CLASS;
    rect.style.position = 'absolute';
    rect.style.border = '1px dashed currentColor';
    rect.style.background = 'rgba(255, 255, 255, 0.18)';
    rect.style.pointerEvents = 'none';
    rect.style.display = 'none';
    overlay.appendChild(rect);

    let startPageX = 0;
    let startPageY = 0;
    let dragging = false;

    function teardown(): void {
      overlay.removeEventListener('mousedown', onMouseDown);
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);
      doc.removeEventListener('keydown', onKeyDown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function paintRect(currentPageX: number, currentPageY: number): void {
      const x = Math.min(startPageX, currentPageX);
      const y = Math.min(startPageY, currentPageY);
      const w = Math.abs(currentPageX - startPageX);
      const h = Math.abs(currentPageY - startPageY);
      // The overlay is `position: fixed; inset: 0`, so its own
      // top-left is at (scrollX, scrollY) in page coords. Translate
      // page coords into overlay-local coords for the rect.
      const view = doc.defaultView;
      const scrollX = view ? view.scrollX : 0;
      const scrollY = view ? view.scrollY : 0;
      rect.style.left = `${x - scrollX}px`;
      rect.style.top = `${y - scrollY}px`;
      rect.style.width = `${w}px`;
      rect.style.height = `${h}px`;
      rect.style.display = 'block';
    }

    function onMouseDown(ev: MouseEvent): void {
      if (ev.button !== 0) return;
      dragging = true;
      startPageX = ev.pageX;
      startPageY = ev.pageY;
      paintRect(ev.pageX, ev.pageY);
      ev.preventDefault();
    }

    function onMouseMove(ev: MouseEvent): void {
      if (!dragging) return;
      paintRect(ev.pageX, ev.pageY);
    }

    function onMouseUp(ev: MouseEvent): void {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startPageX, ev.pageX);
      const y = Math.min(startPageY, ev.pageY);
      const w = Math.abs(ev.pageX - startPageX);
      const h = Math.abs(ev.pageY - startPageY);
      teardown();
      if (w < minPx || h < minPx) {
        resolve(null);
        return;
      }
      resolve({ pageX: x, pageY: y, width: w, height: h });
    }

    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        teardown();
        resolve(null);
      }
    }

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    doc.addEventListener('keydown', onKeyDown);

    doc.body.appendChild(overlay);
    if (options.onMounted) options.onMounted(overlay);
  });
}

export interface CropInput {
  /**
   * Page-coordinate bounding rect of the element that was captured
   * (typically `entryPreview.getBoundingClientRect()` plus the current
   * scroll offset). Used to translate `region` from page coords into
   * source-canvas coords.
   */
  readonly sourcePageRect: { readonly pageX: number; readonly pageY: number; readonly width: number; readonly height: number };
  /** Page-coordinate region to crop. */
  readonly region: RegionBounds;
  /**
   * Device-pixel-ratio used during capture. `html-to-image` defaults to
   * `window.devicePixelRatio` in browsers and `1` in jsdom; the caller
   * should pass the same number it used in the capture call.
   */
  readonly pixelRatio: number;
}

export interface CropPixelGeometry {
  /** Source-canvas-x of the crop's top-left corner. */
  readonly sx: number;
  /** Source-canvas-y of the crop's top-left corner. */
  readonly sy: number;
  /** Source-canvas width of the crop. */
  readonly sWidth: number;
  /** Source-canvas height of the crop. */
  readonly sHeight: number;
}

/**
 * Translate a page-coordinate `region` rectangle into source-canvas
 * pixel coordinates, given the captured element's page rect AND the
 * device-pixel-ratio used during capture. Pure math — no DOM, no
 * canvas. Exposed for the test suite + reused by `cropCanvasToRegion`.
 */
export function computeCropGeometry(input: CropInput): CropPixelGeometry {
  const { sourcePageRect, region, pixelRatio } = input;
  // Region in source-element CSS coords:
  const localX = region.pageX - sourcePageRect.pageX;
  const localY = region.pageY - sourcePageRect.pageY;
  // Clamp to the source element's bounds. A region that extends
  // outside the captured element is silently clipped to what was
  // actually captured — the operator selected a partly-off-element
  // rectangle, and what they get is the intersection.
  const clampedLocalX = Math.max(0, localX);
  const clampedLocalY = Math.max(0, localY);
  const localRight = Math.min(sourcePageRect.width, localX + region.width);
  const localBottom = Math.min(sourcePageRect.height, localY + region.height);
  const clampedWidth = Math.max(0, localRight - clampedLocalX);
  const clampedHeight = Math.max(0, localBottom - clampedLocalY);
  return {
    sx: clampedLocalX * pixelRatio,
    sy: clampedLocalY * pixelRatio,
    sWidth: clampedWidth * pixelRatio,
    sHeight: clampedHeight * pixelRatio,
  };
}

/**
 * Crop `source` to the region described by `input`, returning a fresh
 * canvas containing just the cropped pixels. The fresh canvas's
 * dimensions match the cropped source pixels (i.e. crop output is the
 * same physical pixel size as the source slice, no resampling).
 *
 * Caller is responsible for converting the returned canvas to a Blob
 * via `canvas.toBlob()` — kept separate so the test suite can assert
 * the geometry without needing jsdom's canvas-2d context to actually
 * paint.
 *
 * Throws when the resulting crop would have zero pixels (region
 * entirely off-element) — surfacing the failure rather than returning
 * an empty canvas, per project rules.
 */
export function cropCanvasToRegion(
  source: HTMLCanvasElement,
  input: CropInput,
): HTMLCanvasElement {
  const geom = computeCropGeometry(input);
  if (geom.sWidth <= 0 || geom.sHeight <= 0) {
    throw new Error(
      `screenshot-region: cropped region is empty (sWidth=${geom.sWidth}, sHeight=${geom.sHeight}); region likely lies entirely outside the captured element`,
    );
  }
  const doc = source.ownerDocument;
  const out = doc.createElement('canvas');
  out.width = Math.round(geom.sWidth);
  out.height = Math.round(geom.sHeight);
  const ctx = out.getContext('2d');
  if (ctx === null) {
    throw new Error(
      'screenshot-region: 2d context unavailable on output canvas',
    );
  }
  ctx.drawImage(
    source,
    geom.sx,
    geom.sy,
    geom.sWidth,
    geom.sHeight,
    0,
    0,
    geom.sWidth,
    geom.sHeight,
  );
  return out;
}
