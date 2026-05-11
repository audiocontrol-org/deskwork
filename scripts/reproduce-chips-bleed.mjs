#!/usr/bin/env node
// Reproduce the "drawer chips visible over foreground row content" bug
// from the operator's iOS screenshot. Goal: identify the root cause by
// walking through plausible states (at-rest, hover, mid-swipe, post-swipe)
// and observing which one matches the screenshot.

import { webkit, devices } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const STUDIO_URL = process.env.STUDIO_URL ?? 'http://localhost:47330';
const OUT = resolve(process.cwd(), 'tmp/probe-webkit');
mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], hasTouch: true });
const page = await context.newPage();

await page.goto(`${STUDIO_URL}/dev/editorial-studio`, { waitUntil: 'networkidle' });
await page.click('[data-stage-tile="Final"]');
await page.waitForTimeout(300);

// Scroll row 2 into view.
await page.evaluate(() => {
  const shells = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell');
  shells[1]?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(200);

// State 1: at rest (no interaction).
await page.screenshot({ path: resolve(OUT, '30-rest.png'), fullPage: false });
const restState = await page.evaluate(() => {
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  return {
    fgBg: getComputedStyle(fg).backgroundColor,
    fgZ: getComputedStyle(fg).zIndex,
    fgTransform: getComputedStyle(fg).transform,
    shellOverflow: getComputedStyle(shell).overflow,
  };
});
console.log('REST:', JSON.stringify(restState));

// State 2: simulate :hover on the row foreground (iOS Safari applies :hover
// after a tap — this is the suspected culprit).
const fgLocator = page.locator('[data-stage-section="Final"] .er-row-shell').nth(1).locator('.er-row-fg');
await fgLocator.hover({ force: true });
await page.waitForTimeout(150);
await page.screenshot({ path: resolve(OUT, '31-hover.png'), fullPage: false });
const hoverState = await page.evaluate(() => {
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  return {
    fgBg: getComputedStyle(fg).backgroundColor,
    fgZ: getComputedStyle(fg).zIndex,
    bgIsOpaque: !getComputedStyle(fg).backgroundColor.includes('rgba(0, 0, 0, 0)')
      && !getComputedStyle(fg).backgroundColor.match(/rgba\([^)]+,\s*0\.0?\d+\)/),
  };
});
console.log('HOVER:', JSON.stringify(hoverState));

// State 3: foreground translated mid-swipe.
await page.evaluate(() => {
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  fg.style.transition = 'none';
  fg.style.transform = 'translateX(-100px)';
});
await page.waitForTimeout(100);
await page.screenshot({ path: resolve(OUT, '32-translated.png'), fullPage: false });

await browser.close();
