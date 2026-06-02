/**
 * @vitest-environment jsdom
 *
 * Phase 8 Step 8.3.2 — selection-rectangle UI + crop-geometry tests.
 *
 * Covers:
 *   - `selectRegion`: mounts overlay; resolves with the page-coord
 *     bounds on mouseup; cancels via Escape; cancels on click-and-no-
 *     drag below the minimum size threshold.
 *   - `computeCropGeometry`: page-coord region translated correctly to
 *     source-canvas pixel coords with device-pixel-ratio applied;
 *     regions extending outside the source element are clamped.
 *   - `cropCanvasToRegion`: returns a fresh canvas with the expected
 *     dimensions; throws on zero-pixel crops.
 *
 * The overlay tests don't touch real CSS — they fire MouseEvent
 * objects via dispatchEvent at the overlay element to drive the
 * controller. jsdom's MouseEvent ignores `pageX/pageY` initialisation
 * in its default behaviour (it derives them from clientX + scroll),
 * so the test sets the page-coord properties post-construct via
 * Object.defineProperty on the events that need them. This mirrors
 * the pattern used elsewhere in the entry-review jsdom tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectRegion,
  computeCropGeometry,
  cropCanvasToRegion,
  type RegionBounds,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/screenshot-region.ts';

function makeMouseEvent(
  type: 'mousedown' | 'mousemove' | 'mouseup',
  pageX: number,
  pageY: number,
): MouseEvent {
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: pageX,
    clientY: pageY,
  });
  Object.defineProperty(ev, 'pageX', { value: pageX, configurable: true });
  Object.defineProperty(ev, 'pageY', { value: pageY, configurable: true });
  return ev;
}

describe('selectRegion', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves with the page-coord rect on a successful drag', async () => {
    const pending = selectRegion({
      onMounted: (overlay) => {
        overlay.dispatchEvent(makeMouseEvent('mousedown', 100, 80));
        overlay.dispatchEvent(makeMouseEvent('mousemove', 250, 200));
        overlay.dispatchEvent(makeMouseEvent('mouseup', 250, 200));
      },
    });
    const result = await pending;
    expect(result).not.toBeNull();
    const r = result as RegionBounds;
    expect(r.pageX).toBe(100);
    expect(r.pageY).toBe(80);
    expect(r.width).toBe(150);
    expect(r.height).toBe(120);
  });

  it('uses absolute coords when the drag goes right-to-left / bottom-to-top', async () => {
    const result = await selectRegion({
      onMounted: (overlay) => {
        overlay.dispatchEvent(makeMouseEvent('mousedown', 400, 300));
        overlay.dispatchEvent(makeMouseEvent('mousemove', 200, 150));
        overlay.dispatchEvent(makeMouseEvent('mouseup', 200, 150));
      },
    });
    expect(result).not.toBeNull();
    const r = result as RegionBounds;
    expect(r.pageX).toBe(200);
    expect(r.pageY).toBe(150);
    expect(r.width).toBe(200);
    expect(r.height).toBe(150);
  });

  it('resolves with null when the operator presses Escape', async () => {
    const result = await selectRegion({
      onMounted: () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      },
    });
    expect(result).toBeNull();
  });

  it('resolves with null when the drag is below the minimum size', async () => {
    const result = await selectRegion({
      onMounted: (overlay) => {
        overlay.dispatchEvent(makeMouseEvent('mousedown', 100, 100));
        overlay.dispatchEvent(makeMouseEvent('mouseup', 101, 101));
      },
    });
    expect(result).toBeNull();
  });

  it('removes the overlay from the DOM before the promise resolves', async () => {
    let overlayDuring: HTMLElement | null = null;
    const result = await selectRegion({
      onMounted: (overlay) => {
        overlayDuring = overlay;
        overlay.dispatchEvent(makeMouseEvent('mousedown', 10, 10));
        overlay.dispatchEvent(makeMouseEvent('mouseup', 200, 200));
      },
    });
    expect(result).not.toBeNull();
    // After resolution, the overlay element must have been removed.
    expect(overlayDuring).not.toBeNull();
    if (overlayDuring) expect(overlayDuring.parentNode).toBeNull();
  });

  it('mounts an overlay with role=dialog and the documented z-index', async () => {
    let captured: HTMLElement | null = null;
    await selectRegion({
      onMounted: (overlay) => {
        captured = overlay;
        // Cancel immediately to resolve the promise.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      },
    });
    expect(captured).not.toBeNull();
    if (captured) {
      const el = captured as HTMLElement;
      expect(el.getAttribute('role')).toBe('dialog');
      expect(el.style.position).toBe('fixed');
      expect(el.style.zIndex).toBe('9000');
    }
  });

  it('respects a custom minPx threshold', async () => {
    // minPx: 50 — a 30x30 drag is below threshold, should cancel.
    const result = await selectRegion({
      minPx: 50,
      onMounted: (overlay) => {
        overlay.dispatchEvent(makeMouseEvent('mousedown', 0, 0));
        overlay.dispatchEvent(makeMouseEvent('mouseup', 30, 30));
      },
    });
    expect(result).toBeNull();
  });
});

describe('computeCropGeometry', () => {
  it('translates page-coord region to source-element CSS coords, then to source-canvas pixels via pixelRatio', () => {
    // Source element starts at page (100, 200), 500x400 in CSS px.
    // Capture used pixelRatio=2, so the canvas is 1000x800 pixels.
    // Region is page (150, 250) → 200x150 CSS px.
    // Local: (50, 50) → 200x150 CSS, → (100, 100) → 400x300 source pixels.
    const geom = computeCropGeometry({
      sourcePageRect: { pageX: 100, pageY: 200, width: 500, height: 400 },
      region: { pageX: 150, pageY: 250, width: 200, height: 150 },
      pixelRatio: 2,
    });
    expect(geom.sx).toBe(100);
    expect(geom.sy).toBe(100);
    expect(geom.sWidth).toBe(400);
    expect(geom.sHeight).toBe(300);
  });

  it('clamps regions that extend past the source element', () => {
    // Source: page (0, 0), 100x100. Region: page (50, 50) → 200x200.
    // Clamped local: (50, 50) → 50x50. Pixel: (50, 50) → 50x50 at ratio 1.
    const geom = computeCropGeometry({
      sourcePageRect: { pageX: 0, pageY: 0, width: 100, height: 100 },
      region: { pageX: 50, pageY: 50, width: 200, height: 200 },
      pixelRatio: 1,
    });
    expect(geom.sx).toBe(50);
    expect(geom.sy).toBe(50);
    expect(geom.sWidth).toBe(50);
    expect(geom.sHeight).toBe(50);
  });

  it('returns zero dimensions when the region is entirely outside the source', () => {
    const geom = computeCropGeometry({
      sourcePageRect: { pageX: 0, pageY: 0, width: 100, height: 100 },
      region: { pageX: 500, pageY: 500, width: 200, height: 200 },
      pixelRatio: 1,
    });
    expect(geom.sWidth).toBe(0);
    expect(geom.sHeight).toBe(0);
  });

  it('handles a region top-left being on the source-element top-left with no scroll', () => {
    const geom = computeCropGeometry({
      sourcePageRect: { pageX: 0, pageY: 0, width: 1000, height: 800 },
      region: { pageX: 0, pageY: 0, width: 100, height: 100 },
      pixelRatio: 1,
    });
    expect(geom.sx).toBe(0);
    expect(geom.sy).toBe(0);
    expect(geom.sWidth).toBe(100);
    expect(geom.sHeight).toBe(100);
  });
});

describe('cropCanvasToRegion', () => {
  /**
   * jsdom does not ship a 2d canvas context without the optional
   * `canvas` npm package. We use a thin spy + fake context to assert
   * that the helper drives the documented drawImage call shape, so the
   * test exercises the actual code path without requiring the
   * heavyweight native canvas dependency.
   */
  function installFakeContext(): { drawCalls: unknown[][] } {
    const drawCalls: unknown[][] = [];
    const fakeCtx = {
      drawImage: (...args: unknown[]): void => {
        drawCalls.push(args);
      },
    };
    const proto = HTMLCanvasElement.prototype as unknown as {
      getContext: (kind: string) => unknown;
    };
    const original = proto.getContext;
    proto.getContext = function (kind: string): unknown {
      if (kind === '2d') return fakeCtx;
      return original.call(this, kind);
    };
    return { drawCalls };
  }

  it('returns a fresh canvas with the cropped dimensions and drives drawImage with the right source slice', () => {
    const { drawCalls } = installFakeContext();
    const src = document.createElement('canvas');
    src.width = 200;
    src.height = 200;
    const out = cropCanvasToRegion(src, {
      sourcePageRect: { pageX: 0, pageY: 0, width: 100, height: 100 },
      region: { pageX: 10, pageY: 20, width: 30, height: 40 },
      pixelRatio: 2,
    });
    // Local (10, 20) → 30x40 CSS, ×2 ratio → (20, 40) → 60x80 pixels.
    expect(out.width).toBe(60);
    expect(out.height).toBe(80);
    // Distinct from the source.
    expect(out).not.toBe(src);
    // drawImage(src, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight).
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0]).toEqual([src, 20, 40, 60, 80, 0, 0, 60, 80]);
  });

  it('throws when the crop region is empty', () => {
    const src = document.createElement('canvas');
    src.width = 100;
    src.height = 100;
    expect(() =>
      cropCanvasToRegion(src, {
        sourcePageRect: { pageX: 0, pageY: 0, width: 100, height: 100 },
        region: { pageX: 500, pageY: 500, width: 50, height: 50 },
        pixelRatio: 1,
      }),
    ).toThrow(/cropped region is empty/);
  });
});
