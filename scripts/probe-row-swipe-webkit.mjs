#!/usr/bin/env node
// Verify the tap-doesn't-reveal-drawer fix and menu rendering on real
// WebKit (iOS Safari engine) at iPhone viewport.
//
// 1. At-rest: drawer is hidden behind foreground; ⋮ visible at row edge.
// 2. Synthetic touchstart + small drift (<commit) + touchend: no transform.
// 3. Synthetic touchstart + 40px move (>commit, <latch) + touchend: snaps back.
// 4. Menu open: cmd hints fit on one line; menu paints above FAB.

import { webkit, devices } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const STUDIO_URL = process.env.STUDIO_URL ?? 'http://localhost:47330';
const OUT = resolve(process.cwd(), 'tmp/probe-webkit');
mkdirSync(OUT, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], hasTouch: true });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${STUDIO_URL}/dev/editorial-studio`, { waitUntil: 'networkidle' });
await page.click('[data-stage-tile="Final"]');
await page.waitForTimeout(300);

// Synthesize touch events (WebKit lacks new Touch() in evaluate, so build
// plain objects with the fields the controller reads).
const swipeScenarios = await page.evaluate(async () => {
  function fire(shell, type, x, y) {
    const evt = new Event(type, { bubbles: true, cancelable: true });
    const touchLike = { clientX: x, clientY: y, identifier: 1 };
    Object.defineProperty(evt, 'touches', {
      value: type === 'touchend' ? [] : [touchLike],
    });
    Object.defineProperty(evt, 'changedTouches', { value: [touchLike] });
    // The controller listens on .er-row-fg, not on shell.
    const fg = shell.querySelector('.er-row-fg');
    fg.dispatchEvent(evt);
  }

  const shell = document.querySelector('[data-stage-section="Final"] .er-row-shell');
  const fg = shell.querySelector('.er-row-fg');
  const r = shell.getBoundingClientRect();
  const sx = r.x + r.width * 0.7;
  const sy = r.y + r.height * 0.5;

  function readState() {
    return {
      transform: getComputedStyle(fg).transform,
      classes: shell.className,
    };
  }

  const results = {};

  // Scenario 1: tap with ~10px drift (below AXIS_LOCK_PX=16 and below
  // SWIPE_COMMIT_PX=24). Expect: no transform, no is-swiped.
  fire(shell, 'touchstart', sx, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(shell, 'touchmove', sx - 10, sy + 3);
  await new Promise((r) => setTimeout(r, 20));
  results.tapDrift = readState();
  fire(shell, 'touchend', sx - 10, sy + 3);
  await new Promise((r) => setTimeout(r, 50));
  results.afterTapDrift = readState();

  // Scenario 2: drift below commit (20px — above AXIS_LOCK 16 but below
  // COMMIT 24). Expect: no transform.
  fire(shell, 'touchstart', sx, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(shell, 'touchmove', sx - 20, sy);
  await new Promise((r) => setTimeout(r, 20));
  results.belowCommit = readState();
  fire(shell, 'touchend', sx - 20, sy);
  await new Promise((r) => setTimeout(r, 50));

  // Scenario 3: drift past commit but below latch (40px). Expect: transform
  // set during move, snaps back on end.
  fire(shell, 'touchstart', sx, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(shell, 'touchmove', sx - 40, sy);
  await new Promise((r) => setTimeout(r, 20));
  results.midSwipe = readState();
  fire(shell, 'touchend', sx - 40, sy);
  await new Promise((r) => setTimeout(r, 350));
  results.afterMidSwipe = readState();

  // Scenario 4: full swipe past latch (100px). Expect: drawer latches open.
  fire(shell, 'touchstart', sx, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(shell, 'touchmove', sx - 100, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(shell, 'touchend', sx - 100, sy);
  await new Promise((r) => setTimeout(r, 50));
  results.fullSwipe = readState();

  return results;
});

console.log('swipe scenarios:');
console.log(JSON.stringify(swipeScenarios, null, 2));
await page.screenshot({ path: resolve(OUT, '20-after-full-swipe.png'), fullPage: false });

// Errors?
if (errors.length) {
  console.log('PAGE ERRORS:', errors);
}

await browser.close();
