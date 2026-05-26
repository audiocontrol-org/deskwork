// Quick keyboard-accessibility probe — focus the SVG overlay and try
// to navigate annotation handles by Tab / arrow / Enter.
import { chromium } from 'playwright';

const SPIKE_URL = process.env.SPIKE_URL ?? 'http://localhost:5173/';

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(SPIKE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const img = document.getElementById('fixture-image');
    return img && img.complete && img.naturalWidth > 0;
  });
  // Draw one annotation
  const box = await page.locator('#fixture-image').boundingBox();
  const x = box.x + 200;
  const y = box.y + 150;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 70, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  // Click outside to deselect, then probe keyboard surface
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.waitForTimeout(150);

  // Tab into the SVG layer
  const focusable = await page.evaluate(() => {
    const svg = document.querySelector('svg.a9s-annotationlayer');
    if (!svg) return null;
    svg.focus();
    return {
      activeTag: document.activeElement?.tagName ?? null,
      activeClass: document.activeElement?.getAttribute?.('class') ?? null,
      svgTabindex: svg.getAttribute('tabindex'),
      annotations: Array.from(svg.querySelectorAll('.a9s-annotation')).map((g) => ({
        tag: g.tagName,
        classes: g.getAttribute('class'),
        tabindex: g.getAttribute('tabindex'),
        role: g.getAttribute('role'),
        ariaLabel: g.getAttribute('aria-label')
      }))
    };
  });
  console.log('focus snapshot:', JSON.stringify(focusable, null, 2));

  // Press Tab from the SVG layer and report what focuses
  await page.keyboard.press('Tab');
  const afterTab = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    classes: document.activeElement?.getAttribute?.('class') ?? null
  }));
  console.log('after Tab from SVG layer:', JSON.stringify(afterTab, null, 2));

  // Press Enter on the focused element — observe whether it activates
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);

  // Press Escape — verify cancelDrawing is a no-op when not drawing
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const payload = await page.evaluate(() => document.querySelector('#payload')?.textContent);
  console.log('payload after Tab/Enter/Escape sequence (annotation should still be present):');
  console.log(payload);

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
