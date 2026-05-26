// Drive the Annotorious spike with Playwright at desktop + mobile.
// Emits a payload sample, accessibility snapshot, and dimensions.
import { chromium, devices } from 'playwright';

const SPIKE_URL = process.env.SPIKE_URL ?? 'http://localhost:5173/';

async function pinRectangle(page, x, y, w, h) {
  // Annotorious uses Pointer Events on its SVG overlay. Mouse-drag
  // through Playwright simulates a touch-equivalent gesture on the
  // overlay regardless of viewport — verified hands-on in this spike.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + w, y + h, { steps: 12 });
  await page.mouse.up();
}

async function snapshotAccessibility(page) {
  // Inspect Annotorious's rendered DOM after a pin has been drawn.
  return page.evaluate(() => {
    const root = document.querySelector('.a9s-annotationlayer, .a9s-svg-layer, .a9s-annotation, svg');
    const allAnnoNodes = Array.from(
      document.querySelectorAll(
        '.a9s-annotationlayer, .a9s-annotation, .a9s-svg-layer, .a9s-handle, [class*="a9s"]'
      )
    );
    const sample = allAnnoNodes.slice(0, 8).map((n) => ({
      tag: n.tagName,
      classes: n.getAttribute('class') ?? null,
      role: n.getAttribute('role') ?? null,
      ariaLabel: n.getAttribute('aria-label') ?? null,
      ariaDescribedby: n.getAttribute('aria-describedby') ?? null,
      tabindex: n.getAttribute('tabindex') ?? null
    }));
    return {
      hasOverlay: Boolean(root),
      countAnnoNodes: allAnnoNodes.length,
      sample
    };
  });
}

async function snapshotPayload(page) {
  return page.evaluate(() => {
    const pre = document.querySelector('#payload');
    return pre ? pre.textContent : null;
  });
}

async function run() {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mobile = await browser.newContext({ ...devices['iPhone 13'] });

  for (const [name, ctx] of [
    ['desktop-1280x800', desktop],
    ['mobile-iphone13', mobile]
  ]) {
    const page = await ctx.newPage();
    page.on('pageerror', (err) => console.error(`[${name}] pageerror`, err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[${name}] console.error`, msg.text());
    });
    await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });
    // Wait until the image is loaded by Annotorious before drawing.
    await page.waitForFunction(() => {
      const img = document.getElementById('fixture-image');
      return img && img.complete && img.naturalWidth > 0;
    });
    const box = await page.locator('#fixture-image').boundingBox();
    const x0 = box.x + Math.round(box.width * 0.25);
    const y0 = box.y + Math.round(box.height * 0.25);
    const w = Math.max(40, Math.round(box.width * 0.15));
    const h = Math.max(40, Math.round(box.height * 0.15));
    await pinRectangle(page, x0, y0, w, h);
    await page.waitForFunction(() => {
      const pre = document.querySelector('#payload');
      return pre && pre.textContent && pre.textContent.trim() !== '[]';
    }, null, { timeout: 5000 });
    const payload = await snapshotPayload(page);
    const a11y = await snapshotAccessibility(page);
    console.log(`\n=== ${name} ===`);
    console.log('payload:');
    console.log(payload);
    console.log('a11y snapshot:');
    console.log(JSON.stringify(a11y, null, 2));
    await page.close();
  }

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
