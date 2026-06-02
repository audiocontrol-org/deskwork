// Screenshot each direction via Playwright. Run with the static
// server up on port 8766 in this directory.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8766';

async function snap(page, path, file, vw, vh) {
  await page.setViewportSize({ width: vw, height: vh });
  await page.goto(`${BASE}/${path}`, { waitUntil: 'networkidle' });
  // Wait for web fonts to settle so screenshot picks them up.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`wrote ${file} (${vw}x${vh})`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await snap(page, 'index.html',                  'snap-00-index.png',     1280, 1600);
await snap(page, 'direction-1-lane-stack.html', 'snap-01-lane-stack.png', 1600, 1100);
await snap(page, 'direction-2-lane-bar.html',   'snap-02-lane-bar.png',   1600, 1100);
await snap(page, 'direction-3-press-bay.html',  'snap-03-press-bay.png',  1800, 1200);
await browser.close();
