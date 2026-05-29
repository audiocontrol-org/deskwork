#!/usr/bin/env node
/**
 * Drive Playwright WebKit at iPhone 14 dimensions against the running
 * dev studio. Reports horizontal-overflow status in both review mode
 * and edit mode, plus screenshots for visual diff.
 *
 * Closer to actual iOS Safari than Chromium-at-iPhone-viewport (which
 * is what the Playwright MCP defaults to). Catches WebKit-specific
 * layout quirks that Chromium hides — flex `min-width: auto`,
 * `position: fixed` + soft keyboard, etc.
 *
 * Usage: node scripts/probe-ios-overflow.mjs <entry-uuid>
 *   defaults to the THESIS entry on this project.
 */

import { webkit, devices } from 'playwright';

const ENTRY = process.argv[2] ?? '1c3bfe8f-e9c2-4133-ab88-2aa08d9fa702';
const URL = `http://localhost:47323/dev/editorial-review/entry/${ENTRY}`;

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  ...devices['iPhone 14'],
});
const page = await context.newPage();

console.log(`==> WebKit / iPhone 14 / ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle' });

async function probe(label) {
  const data = await page.evaluate(() => {
    const vp = window.innerWidth;
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    // Programmatic scroll attempt
    window.scrollTo({ left: 100 });
    const x1 = window.pageXOffset;
    window.scrollTo({ left: 0 });
    // Find every element wider than viewport
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect();
      if (b.width > vp + 1 && b.height > 0) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
          w: Math.round(b.width),
          left: Math.round(b.left),
        });
      }
    }
    return { vp, docW, bodyW, canScrollX: x1 > 0, offenders };
  });
  const head = `--- ${label} ---`;
  console.log(`\n${head}`);
  console.log(`viewport=${data.vp}  docScrollWidth=${data.docW}  bodyScrollWidth=${data.bodyW}  canScrollX=${data.canScrollX}`);
  if (data.offenders.length === 0) {
    console.log('  no element wider than viewport');
  } else {
    console.log(`  ${data.offenders.length} elements wider than viewport:`);
    for (const o of data.offenders.slice(0, 10)) {
      console.log(`    <${o.tag} class="${o.cls}"> w=${o.w} left=${o.left}`);
    }
  }
  return data;
}

await probe('REVIEW MODE');
await page.screenshot({ path: '/tmp/dw-ios-review.png', fullPage: false });

// Click Edit
const editBtn = await page.locator('button[data-action="toggle-edit"]').first();
await editBtn.click();
await page.waitForTimeout(2000);
await probe('EDIT MODE');
await page.screenshot({ path: '/tmp/dw-ios-edit.png', fullPage: false });

await browser.close();
console.log('\nScreenshots: /tmp/dw-ios-review.png, /tmp/dw-ios-edit.png');
