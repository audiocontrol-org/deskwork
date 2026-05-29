#!/usr/bin/env node
// WebKit-based probe for the v0.20 dashboard row affordances.
// Uses Playwright WebKit (the same engine iOS Safari ships) at an iPhone-class
// viewport to validate the rendering matches what the operator sees on phone.
// This is the closest substitute for the iOS Simulator available on this Mac
// (full Xcode is not installed; only command-line tools).

import { webkit, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const STUDIO_URL = process.env.STUDIO_URL ?? 'http://localhost:47330';
const OUT_DIR = resolve(process.cwd(), 'tmp/probe-webkit');
mkdirSync(OUT_DIR, { recursive: true });

const iPhone = devices['iPhone 14'];

const browser = await webkit.launch();
const context = await browser.newContext({
  ...iPhone,
  hasTouch: true,
});
const page = await context.newPage();

const consoleMessages = [];
page.on('console', (msg) => {
  consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  consoleMessages.push(`[pageerror] ${err.message}`);
});

console.log(`navigating to ${STUDIO_URL}/dev/editorial-studio`);
await page.goto(`${STUDIO_URL}/dev/editorial-studio`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

await page.screenshot({ path: resolve(OUT_DIR, '01-at-rest.png'), fullPage: true });

// Click the Final stage tile to expand it.
await page.click('[data-stage-tile="Final"]');
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUT_DIR, '02-final-expanded.png'), fullPage: true });

// Inspect the first row (probably design-archive-contract — Final stage entry).
const rowProbe = await page.evaluate(() => {
  const section = document.querySelector('[data-stage-section="Final"]');
  if (!section) return { error: 'no Final section' };
  const shells = Array.from(section.querySelectorAll('.er-row-shell'));
  if (shells.length === 0) return { error: 'no rows in Final section' };

  const findings = [];
  for (const shell of shells.slice(0, 3)) {
    const slug = shell.getAttribute('data-slug');
    const stage = shell.getAttribute('data-stage');
    const shellRect = shell.getBoundingClientRect();
    const drawer = shell.querySelector('.er-row-drawer');
    const drawerRect = drawer?.getBoundingClientRect();
    const drawerStyle = drawer ? getComputedStyle(drawer) : null;
    const chips = drawer ? Array.from(drawer.querySelectorAll('.er-row-action')) : [];
    const chipRects = chips.map((c) => ({
      kind: c.className.match(/er-row-action-(\w+)/)?.[1] ?? '?',
      rect: c.getBoundingClientRect(),
    }));
    const fg = shell.querySelector('.er-row-fg');
    const fgRect = fg?.getBoundingClientRect();
    const fgStyle = fg ? getComputedStyle(fg) : null;
    const menu = shell.querySelector('.er-row-menu');
    const overflow = shell.querySelector('[data-row-overflow]');
    const overflowRect = overflow?.getBoundingClientRect();

    findings.push({
      slug,
      stage,
      shell: { w: shellRect.width, h: shellRect.height, overflow: getComputedStyle(shell).overflow },
      drawer: drawer ? {
        rect: { x: drawerRect.x, y: drawerRect.y, w: drawerRect.width, h: drawerRect.height },
        zIndex: drawerStyle.zIndex,
        chipCount: chips.length,
        chips: chipRects,
      } : null,
      fg: fg ? {
        rect: { x: fgRect.x, y: fgRect.y, w: fgRect.width, h: fgRect.height },
        zIndex: fgStyle.zIndex,
        bg: fgStyle.backgroundColor,
        transform: fgStyle.transform,
      } : null,
      menu: menu ? { hidden: menu.hidden, zIndex: getComputedStyle(menu).zIndex } : null,
      overflow: overflow ? {
        rect: { x: overflowRect.x, y: overflowRect.y, w: overflowRect.width, h: overflowRect.height },
      } : null,
    });
  }
  return { rowCount: shells.length, findings };
});

console.log('Final section row probe:');
console.log(JSON.stringify(rowProbe, null, 2));
writeFileSync(
  resolve(OUT_DIR, '03-row-probe.json'),
  JSON.stringify(rowProbe, null, 2),
);

// Now open the menu on the first row.
const openResult = await page.evaluate(() => {
  const section = document.querySelector('[data-stage-section="Final"]');
  const shell = section?.querySelector('.er-row-shell');
  const overflow = shell?.querySelector('[data-row-overflow]');
  if (!overflow) return { error: 'no overflow button' };
  overflow.click();
  const menu = shell.querySelector('.er-row-menu');
  return {
    slug: shell.getAttribute('data-slug'),
    menuHidden: menu?.hidden,
    shellClasses: shell.className,
    shellOverflow: getComputedStyle(shell).overflow,
  };
});

console.log('after menu open:', JSON.stringify(openResult, null, 2));
await page.waitForTimeout(200);
await page.screenshot({ path: resolve(OUT_DIR, '04-menu-open.png'), fullPage: true });

// Now simulate a partial swipe to see drawer behavior.
await page.evaluate(() => {
  // close the menu first
  document.body.click();
});
await page.waitForTimeout(150);

// Use page.touchscreen for real touch events (no Touch() constructor needed).
const rowRect = await page.evaluate(() => {
  const shell = document.querySelector('[data-stage-section="Final"] .er-row-shell');
  if (!shell) return null;
  const r = shell.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

if (rowRect) {
  // Scenario A: small drift tap (10px) — should NOT reveal drawer.
  const startX = rowRect.x + rowRect.w * 0.4;
  const startY = rowRect.y + rowRect.h * 0.5;
  await page.touchscreen.tap(startX, startY);
  await page.waitForTimeout(150);

  // Scenario B: mid-swipe with Playwright's page-level touch — drag pattern.
  // page.touchscreen doesn't have a drag, so we synthesize via dispatchEvent
  // using JSON-cloneable plain objects (works in WebKit evaluate).
  const swipeState = await page.evaluate(async () => {
    const shell = document.querySelector('[data-stage-section="Final"] .er-row-shell');
    if (!shell) return null;
    const r = shell.getBoundingClientRect();
    const sx = r.x + r.width * 0.6;
    const sy = r.y + r.height * 0.5;

    // Construct TouchEvent via UIEvent for WebKit. Use Touch from document API.
    function fire(type, x, y) {
      const evt = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(evt, 'touches', {
        value: type === 'touchend' ? [] : [{ clientX: x, clientY: y, identifier: 1 }],
      });
      Object.defineProperty(evt, 'changedTouches', {
        value: [{ clientX: x, clientY: y, identifier: 1 }],
      });
      shell.dispatchEvent(evt);
    }

    fire('touchstart', sx, sy);
    await new Promise((r) => setTimeout(r, 30));
    fire('touchmove', sx - 80, sy);
    await new Promise((r) => setTimeout(r, 30));
    const fg = shell.querySelector('.er-row-fg');
    return {
      classes: shell.className,
      fgTransform: getComputedStyle(fg).transform,
    };
  });
  console.log('mid-swipe state:', JSON.stringify(swipeState, null, 2));
  await page.screenshot({ path: resolve(OUT_DIR, '05-mid-swipe.png'), fullPage: false });
}

writeFileSync(resolve(OUT_DIR, '99-console.log'), consoleMessages.join('\n'));

await browser.close();
console.log('done');
