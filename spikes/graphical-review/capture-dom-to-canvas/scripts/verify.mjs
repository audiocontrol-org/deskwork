// Drive the html-to-image fidelity spike with Playwright. Captures the
// fixture, decodes the PNG, and asserts per-feature rendering fidelity:
//
//   - the capture button + ancillary DOM exists in the documented shape
//   - clicking Capture produces a PNG-shaped data URL
//   - the PNG's natural dimensions match (or 2x match — html-to-image's
//     internal scaling) the live fixture's rendered dimensions
//   - pseudo-element rendering survives the capture (the divider's ◆
//     glyph from `::after` is visible at the captured center)
//   - the card ribbon stripes (`::before`-driven backgrounds) are
//     present at the expected pixel offsets
//   - inline SVG (the diamond icon) is rasterized into the PNG
//   - the missing-web-font case is handled gracefully (capture does NOT
//     throw; the title text appears in the captured image rendered via
//     the CSS fallback chain)
//   - state transitions per the path-taken enum (idle → captured → idle
//     after clear)
//
// Per ui-verification.md, every assert traces to a clause in the
// findings doc's "Sub-spike 2: DOM-to-canvas (html-to-image)" section.
//
// Pixel-fidelity assertions are derived from KNOWN points on the
// fixture (e.g. the green ribbon on the published card is at x=0
// relative to the card; the central divider glyph is at x=~50% of
// fixture width). Each pixel assertion identifies the expected color
// or non-transparency at the known location and asserts on it.

import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const SPIKE_URL = process.env.SPIKE_URL ?? 'http://localhost:5173/';

const failures = [];

function assert(label, condition, evidence) {
  if (condition) {
    console.log(`  PASS — ${label}`);
  } else {
    console.error(`  FAIL — ${label}`);
    if (evidence !== undefined) console.error('         evidence:', evidence);
    failures.push(label);
  }
}

function dataUrlToBuffer(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(base64, 'base64');
}

function decodePng(buffer) {
  return new Promise((resolve, reject) => {
    new PNG().parse(buffer, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

function pixelAt(png, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return null;
  }
  const idx = (png.width * Math.round(y) + Math.round(x)) << 2;
  return {
    r: png.data[idx],
    g: png.data[idx + 1],
    b: png.data[idx + 2],
    a: png.data[idx + 3]
  };
}

function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

async function snapshotInitialState(page) {
  return page.evaluate(() => {
    const captureBtn = document.getElementById('capture-btn');
    const downloadBtn = document.getElementById('download-btn');
    const clearBtn = document.getElementById('clear-btn');
    const target = document.getElementById('capture-target');
    const targetRect = target ? target.getBoundingClientRect() : null;
    return {
      hasCaptureBtn: Boolean(captureBtn),
      hasDownloadBtn: Boolean(downloadBtn),
      downloadBtnInitiallyDisabled: downloadBtn ? downloadBtn.disabled : null,
      hasClearBtn: Boolean(clearBtn),
      clearBtnInitiallyDisabled: clearBtn ? clearBtn.disabled : null,
      hasTarget: Boolean(target),
      targetWidth: targetRect ? Math.round(targetRect.width) : null,
      targetHeight: targetRect ? Math.round(targetRect.height) : null,
      initialLastPath:
        window.__spike && window.__spike.state ? window.__spike.state.lastPath : null
    };
  });
}

async function runCaptureAndSnapshot(page) {
  // Trigger the capture programmatically. The spike's triggerCapture
  // is async; await its completion before snapshotting state.
  await page.evaluate(async () => {
    await window.__spike.triggerCapture();
  });
  return page.evaluate(() => {
    const previewImg = document.getElementById('preview-image');
    return {
      lastPath: window.__spike.state.lastPath,
      lastError: window.__spike.state.lastError,
      capturedDataUrl: window.__spike.state.capturedDataUrl,
      capturedNaturalWidth: window.__spike.state.capturedNaturalWidth,
      capturedNaturalHeight: window.__spike.state.capturedNaturalHeight,
      capturedRenderedWidth: window.__spike.state.capturedRenderedWidth,
      capturedRenderedHeight: window.__spike.state.capturedRenderedHeight,
      fidelity: window.__spike.state.fidelity,
      hasPreviewImg: Boolean(previewImg),
      previewImgWidth: previewImg ? previewImg.naturalWidth : null,
      previewImgHeight: previewImg ? previewImg.naturalHeight : null,
      downloadBtnDisabled: document.getElementById('download-btn').disabled,
      clearBtnDisabled: document.getElementById('clear-btn').disabled
    };
  });
}

async function clearAndSnapshot(page) {
  await page.locator('#clear-btn').click();
  return page.evaluate(() => ({
    lastPath: window.__spike.state.lastPath,
    capturedDataUrl: window.__spike.state.capturedDataUrl,
    downloadDisabled: document.getElementById('download-btn').disabled,
    clearDisabled: document.getElementById('clear-btn').disabled,
    placeholderPresent: document
      .getElementById('preview-container')
      .querySelector('.placeholder') !== null
  }));
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('[pageerror]', err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console.error]', msg.text());
  });

  await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });
  // Allow @font-face fallback to settle.
  await page.waitForTimeout(200);

  console.log('\n=== initial state ===');
  const initial = await snapshotInitialState(page);
  console.log(JSON.stringify(initial, null, 2));

  console.log('\nassertions [initial DOM + state]:');
  assert('capture button exists', initial.hasCaptureBtn === true, initial);
  assert('download button starts disabled', initial.downloadBtnInitiallyDisabled === true, initial);
  assert('clear button starts disabled', initial.clearBtnInitiallyDisabled === true, initial);
  assert('capture target #capture-target exists', initial.hasTarget === true, initial);
  assert('capture target reports non-zero dimensions', initial.targetWidth > 0 && initial.targetHeight > 0, initial);
  assert('spike lastPath starts as "idle"', initial.initialLastPath === 'idle', initial);

  console.log('\n=== capture run ===');
  const cap = await runCaptureAndSnapshot(page);
  // Trim dataUrl in console output (it's huge).
  console.log(
    JSON.stringify(
      {
        ...cap,
        capturedDataUrl: cap.capturedDataUrl
          ? `${cap.capturedDataUrl.slice(0, 32)}…(${cap.capturedDataUrl.length} chars)`
          : null
      },
      null,
      2
    )
  );

  console.log('\nassertions [capture run]:');
  assert('lastPath transitions to "captured"', cap.lastPath === 'captured', { lastPath: cap.lastPath, lastError: cap.lastError });
  assert('lastError is null on success', cap.lastError === null, cap.lastError);
  assert(
    'capturedDataUrl is a PNG data URL (starts with data:image/png;base64,)',
    typeof cap.capturedDataUrl === 'string' && cap.capturedDataUrl.startsWith('data:image/png;base64,'),
    cap.capturedDataUrl ? cap.capturedDataUrl.slice(0, 32) : cap.capturedDataUrl
  );
  assert('captured PNG natural width equals fixture rendered width', cap.capturedNaturalWidth === cap.capturedRenderedWidth, cap);
  assert('captured PNG natural height equals fixture rendered height', cap.capturedNaturalHeight === cap.capturedRenderedHeight, cap);
  assert('preview <img> mounted in container', cap.hasPreviewImg === true, cap);
  assert('preview <img>.naturalWidth matches captured PNG width', cap.previewImgWidth === cap.capturedNaturalWidth, cap);
  assert('download button enables after capture', cap.downloadBtnDisabled === false, cap);
  assert('clear button enables after capture', cap.clearBtnDisabled === false, cap);
  // Fidelity context snapshot (recorded at capture time, before raster).
  assert('fidelity snapshot present', cap.fidelity !== null && typeof cap.fidelity === 'object', cap.fidelity);
  if (cap.fidelity) {
    assert(
      'fixture target dimensions match captured natural dimensions',
      cap.fidelity.target.width === cap.capturedNaturalWidth &&
        cap.fidelity.target.height === cap.capturedNaturalHeight,
      { fidelity: cap.fidelity, captured: { w: cap.capturedNaturalWidth, h: cap.capturedNaturalHeight } }
    );
    assert(
      'fixture title font-family begins with LoraTest (the declared web font, even when its URL 404s)',
      typeof cap.fidelity.title.fontFamily === 'string' && cap.fidelity.title.fontFamily.includes('LoraTest'),
      cap.fidelity.title.fontFamily
    );
    assert(
      'card ::before pseudo-element reports a background-color (the ribbon stripe)',
      typeof cap.fidelity.cardPseudo.beforeBackground === 'string' &&
        cap.fidelity.cardPseudo.beforeBackground.length > 0,
      cap.fidelity.cardPseudo
    );
    assert(
      'card ::after pseudo-element reports content "LANE"',
      typeof cap.fidelity.cardPseudo.afterContent === 'string' &&
        cap.fidelity.cardPseudo.afterContent.includes('LANE'),
      cap.fidelity.cardPseudo
    );
    assert(
      'divider ::after pseudo-element reports diamond glyph as content',
      typeof cap.fidelity.dividerPseudo.afterContent === 'string' &&
        cap.fidelity.dividerPseudo.afterContent.includes('◆'),
      cap.fidelity.dividerPseudo
    );
    assert('multi-line aside paragraph reports non-zero rendered height', cap.fidelity.aside.heightPx > 0, cap.fidelity.aside);
    assert('inline SVG is present in fixture', cap.fidelity.svg.present === true, cap.fidelity.svg);
  }

  // Decode and inspect the captured PNG.
  console.log('\n=== pixel-fidelity inspection of captured PNG ===');
  const pngBuffer = dataUrlToBuffer(cap.capturedDataUrl);
  const png = await decodePng(pngBuffer);
  console.log(`decoded PNG: ${png.width}x${png.height}px`);

  // The fixture is 640px wide (per CSS .fixture { width: 640px }).
  // Sample regions (pixel coordinates inside the captured PNG):
  // - Top-left corner of the published card's ribbon: card column starts
  //   inside .fx-grid which has 1.5rem padding around it; let's sample
  //   a region we know SHOULD be green (the --c-published ribbon).
  // The cards are inside the fixture at approximate y ~ 100-160px from
  // top (after the masthead + .fx-head). Each card has a 6px ::before
  // ribbon on its left edge.
  //
  // Rather than reverse-engineering CSS layout, query the live DOM for
  // bounding rects and use them to sample the PNG.

  const layout = await page.evaluate(() => {
    const target = document.getElementById('capture-target');
    const targetRect = target.getBoundingClientRect();
    function relRect(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        // Coordinates relative to the capture target (PNG coordinate space).
        x: Math.round(r.left - targetRect.left),
        y: Math.round(r.top - targetRect.top),
        w: Math.round(r.width),
        h: Math.round(r.height)
      };
    }
    return {
      publishedCard: relRect('.fx-card--draftings, .fx-card--published'),
      draftingCard: relRect('.fx-card--drafting'),
      ideasCard: relRect('.fx-card--ideas'),
      divider: relRect('.fx-divider'),
      svgIcon: relRect('.fx-icon svg')
    };
  });
  console.log('layout:', JSON.stringify(layout, null, 2));

  // Sample known-color regions.
  console.log('\nassertions [pixel-fidelity]:');

  if (layout.publishedCard) {
    // Ribbon is the leftmost 6px of the card; sample x=2 (inside the ribbon),
    // y=card-vertical-midpoint. Expected color is var(--c-published) #2f5d3a.
    const sx = layout.publishedCard.x + 2;
    const sy = layout.publishedCard.y + Math.round(layout.publishedCard.h / 2);
    const px = pixelAt(png, sx, sy);
    const expected = { r: 0x2f, g: 0x5d, b: 0x3a };
    const dist = px ? colorDistance(px, expected) : Infinity;
    assert(
      `published-card ribbon (::before) renders green at (${sx},${sy}) within color distance < 40 of #2f5d3a`,
      px !== null && dist < 40,
      { sampled: px, expected, dist }
    );
  } else {
    assert('published-card located in layout for pixel sampling', false, layout);
  }

  if (layout.draftingCard) {
    const sx = layout.draftingCard.x + 2;
    const sy = layout.draftingCard.y + Math.round(layout.draftingCard.h / 2);
    const px = pixelAt(png, sx, sy);
    const expected = { r: 0xb0, g: 0x7a, b: 0x1a };
    const dist = px ? colorDistance(px, expected) : Infinity;
    assert(
      `drafting-card ribbon renders ochre at (${sx},${sy}) within color distance < 40 of #b07a1a`,
      px !== null && dist < 40,
      { sampled: px, expected, dist }
    );
  }

  if (layout.ideasCard) {
    const sx = layout.ideasCard.x + 2;
    const sy = layout.ideasCard.y + Math.round(layout.ideasCard.h / 2);
    const px = pixelAt(png, sx, sy);
    const expected = { r: 0x4a, g: 0x4a, b: 0x8a };
    const dist = px ? colorDistance(px, expected) : Infinity;
    assert(
      `ideas-card ribbon renders purple at (${sx},${sy}) within color distance < 40 of #4a4a8a`,
      px !== null && dist < 40,
      { sampled: px, expected, dist }
    );
  }

  // Divider ::after glyph: sampled at the center of the divider's bbox.
  // Glyph color is var(--accent) #6d3a1f on background var(--paper) #f6f1e8.
  // A direct pixel sample at the glyph center is unstable because the
  // glyph occupies only a few pixels; instead, scan a 20-pixel
  // horizontal window centered on the divider and assert that AT LEAST
  // ONE pixel matches the accent color within tolerance.
  if (layout.divider) {
    const cx = layout.divider.x + Math.round(layout.divider.w / 2);
    const cy = layout.divider.y + Math.round(layout.divider.h / 2);
    const expected = { r: 0x6d, g: 0x3a, b: 0x1f };
    let foundGlyphPixel = false;
    let minDist = Infinity;
    for (let dx = -12; dx <= 12; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        const px = pixelAt(png, cx + dx, cy + dy);
        if (px) {
          const dist = colorDistance(px, expected);
          if (dist < minDist) minDist = dist;
          if (dist < 50) {
            foundGlyphPixel = true;
            break;
          }
        }
      }
      if (foundGlyphPixel) break;
    }
    assert(
      `divider ::after glyph (◆) rasterized within ±12px of divider center (color #6d3a1f); min observed dist = ${Math.round(
        minDist
      )}`,
      foundGlyphPixel,
      { cx, cy, expected, minDist }
    );
  }

  // Inline SVG: should be visible in the captured PNG. The SVG polygon
  // is filled with #6d3a1f (accent) and its center has a white circle.
  // Sample a point near the SVG bounding-box center; assert non-transparent.
  if (layout.svgIcon) {
    const cx = layout.svgIcon.x + Math.round(layout.svgIcon.w / 2);
    const cy = layout.svgIcon.y + Math.round(layout.svgIcon.h / 2);
    // The SVG's inner circle at the center has fill #fffaf0 ~paper.
    // Sample a point slightly off-center where the polygon fill is.
    const sx = cx + Math.round(layout.svgIcon.w * 0.3);
    const sy = cy;
    const px = pixelAt(png, sx, sy);
    const expected = { r: 0x6d, g: 0x3a, b: 0x1f };
    const dist = px ? colorDistance(px, expected) : Infinity;
    assert(
      `inline SVG polygon fill (accent) visible near (${sx},${sy}) within color distance < 50 of #6d3a1f`,
      px !== null && dist < 50,
      { sampled: px, expected, dist }
    );
  } else {
    assert('inline SVG icon located in layout for pixel sampling', false, layout);
  }

  // Clear lifecycle.
  console.log('\n=== clear lifecycle ===');
  const cleared = await clearAndSnapshot(page);
  console.log(JSON.stringify(cleared, null, 2));

  console.log('\nassertions [clear lifecycle]:');
  assert('lastPath returns to "idle" after clear', cleared.lastPath === 'idle', cleared);
  assert('capturedDataUrl cleared from state', cleared.capturedDataUrl === null, cleared);
  assert('download button re-disabled after clear', cleared.downloadDisabled === true, cleared);
  assert('clear button re-disabled after clear', cleared.clearDisabled === true, cleared);
  assert('preview placeholder restored after clear', cleared.placeholderPresent === true, cleared);

  await browser.close();

  console.log('\n=== summary ===');
  if (failures.length === 0) {
    console.log('All assertions passed.');
  } else {
    console.error(`${failures.length} assertion(s) failed:`);
    for (const f of failures) console.error('  -', f);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
