#!/usr/bin/env node
// Focused WebKit probe: open the menu on a Final row, compute stacking
// state, and screenshot just the menu region to verify the FAB is fully
// covered.

import { webkit, devices } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const STUDIO_URL = process.env.STUDIO_URL ?? 'http://localhost:47330';
const OUT_DIR = resolve(process.cwd(), 'tmp/probe-webkit');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({
  ...devices['iPhone 14'],
  hasTouch: true,
});
const page = await context.newPage();
await page.goto(`${STUDIO_URL}/dev/editorial-studio`, { waitUntil: 'networkidle' });
await page.waitForTimeout(200);
await page.click('[data-stage-tile="Final"]');
await page.waitForTimeout(300);

// Click overflow on row 1 in Final.
await page.evaluate(() => {
  const section = document.querySelector('[data-stage-section="Final"]');
  const shell = section?.querySelector('.er-row-shell');
  const overflow = shell?.querySelector('[data-row-overflow]');
  overflow.click();
});
await page.waitForTimeout(200);

const state = await page.evaluate(() => {
  const section = document.querySelector('[data-stage-section="Final"]');
  const shell = section?.querySelector('.er-row-shell');
  const menu = shell?.querySelector('.er-row-menu');
  const fab = document.querySelector('.er-compose-fab');
  const menuRect = menu?.getBoundingClientRect();
  const fabRect = fab?.getBoundingClientRect();
  return {
    shell: {
      zIndex: getComputedStyle(shell).zIndex,
      classes: shell.className,
      position: getComputedStyle(shell).position,
    },
    menu: {
      zIndex: getComputedStyle(menu).zIndex,
      rect: { x: menuRect.x, y: menuRect.y, w: menuRect.width, h: menuRect.height },
    },
    fab: {
      zIndex: getComputedStyle(fab).zIndex,
      position: getComputedStyle(fab).position,
      rect: { x: fabRect.x, y: fabRect.y, w: fabRect.width, h: fabRect.height },
    },
    overlap: {
      x: Math.max(menuRect.x, fabRect.x) < Math.min(menuRect.x + menuRect.width, fabRect.x + fabRect.width),
      y: Math.max(menuRect.y, fabRect.y) < Math.min(menuRect.y + menuRect.height, fabRect.y + fabRect.height),
    },
  };
});
console.log(JSON.stringify(state, null, 2));

// Screenshot just the visible viewport (not fullPage) so we see the FAB
// in its true position relative to the menu.
await page.screenshot({
  path: resolve(OUT_DIR, '10-viewport-menu-open.png'),
  fullPage: false,
});

await browser.close();
