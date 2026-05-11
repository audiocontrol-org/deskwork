#!/usr/bin/env node
// Spec-compliance probe for the v0.20 row affordance redesign.
//
// Walks every state the design brief at
//   docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md
// describes, on real WebKit (Playwright + iPhone 14 device emulation —
// reports `hover: none, pointer: coarse` like real iOS Safari).
//
// Spec assertions:
//   A. At rest — the row is clean: slug + title + date + low-contrast ⋮.
//      No drawer chips visible. No menu visible. Foreground is opaque
//      cream paper.
//   B. Post-tap (iOS Safari sticks :hover after a tap) — same as A.
//      Drawer chips MUST NOT bleed through the foreground.
//   C. Mid-swipe (foreground translated left by < latch threshold) —
//      drawer chips revealed in the trailing edge of the row, behind /
//      to the right of the still-visible foreground content.
//   D. Latched-open (full swipe past latch threshold) — drawer fully
//      revealed; foreground translated by chipCount * 64px.
//   E. Snap-back (swipe < latch, release) — foreground returns to
//      transform:none after the 250ms transition.
//   F. Menu open — popover anchored to the row, no drawer chips visible,
//      shell z-index above the compose FAB.
//
// Exit-zero only when every assertion passes. The probe prints PASS/FAIL
// per assertion and a final summary; non-zero exit means at least one
// spec violation is live.

import { webkit, devices } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const STUDIO_URL = process.env.STUDIO_URL ?? 'http://localhost:47330';
const OUT = resolve(process.cwd(), 'tmp/probe-webkit');
mkdirSync(OUT, { recursive: true });

const results = [];
function assert(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function isOpaque(rgb) {
  // matches rgb(r,g,b) (opaque) or rgba(r,g,b,1) (opaque). Anything with
  // alpha < 1 is non-opaque.
  if (rgb.startsWith('rgb(')) return true;
  const m = rgb.match(/rgba\([^,]+,\s*[^,]+,\s*[^,]+,\s*([0-9.]+)\)/);
  if (!m) return false;
  return parseFloat(m[1]) >= 0.999;
}

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], hasTouch: true });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${STUDIO_URL}/dev/editorial-studio`, { waitUntil: 'networkidle' });

console.log('\n=== A. Row at rest (no interaction) ===');
await page.click('[data-stage-tile="Final"]');
await page.waitForTimeout(300);
await page.evaluate(() => {
  // Move focus / cursor off all rows so no hover state could persist.
  document.body.focus();
});
await page.mouse.move(0, 0);
await page.waitForTimeout(100);

const restState = await page.evaluate(() => {
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  const drawer = shell.querySelector('.er-row-drawer');
  const menu = shell.querySelector('.er-row-menu');
  return {
    fgBg: getComputedStyle(fg).backgroundColor,
    fgZ: getComputedStyle(fg).zIndex,
    fgTransform: getComputedStyle(fg).transform,
    drawerZ: getComputedStyle(drawer).zIndex,
    drawerVisible: getComputedStyle(drawer).display !== 'none',
    menuHidden: menu.hidden,
    shellClasses: shell.className,
    shellOverflow: getComputedStyle(shell).overflow,
  };
});
console.log('  state:', JSON.stringify(restState));
assert(
  'A.1 fg background opaque at rest',
  isOpaque(restState.fgBg),
  `got ${restState.fgBg}`,
);
assert('A.2 fg z-index 2', restState.fgZ === '2');
assert('A.3 fg transform none', restState.fgTransform === 'none');
assert('A.4 drawer z-index 1', restState.drawerZ === '1');
assert('A.5 shell overflow hidden', restState.shellOverflow === 'hidden');
assert('A.6 menu hidden', restState.menuHidden === true);
assert(
  'A.7 shell has no is-swiped / is-menu-open',
  !restState.shellClasses.includes('is-swiped')
    && !restState.shellClasses.includes('is-menu-open'),
  `got "${restState.shellClasses}"`,
);
await page.screenshot({ path: resolve(OUT, '40-spec-A-at-rest.png'), fullPage: false });

console.log('\n=== B. Post-tap-hover state (iOS Safari sticky-hover) ===');
const fgLocator = page.locator('[data-stage-section="Final"] .er-row-shell').nth(1).locator('.er-row-fg');
await fgLocator.hover({ force: true });
await page.waitForTimeout(150);
const hoverState = await page.evaluate(() => {
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  return { fgBg: getComputedStyle(fg).backgroundColor };
});
console.log('  state:', JSON.stringify(hoverState));
assert(
  'B.1 fg background still opaque under sticky-hover',
  isOpaque(hoverState.fgBg),
  `got ${hoverState.fgBg}`,
);
await page.screenshot({ path: resolve(OUT, '41-spec-B-after-hover.png'), fullPage: false });

console.log('\n=== C. Mid-swipe (foreground translated below latch) ===');
const midSwipe = await page.evaluate(async () => {
  function fire(fg, type, x, y) {
    const evt = new Event(type, { bubbles: true, cancelable: true });
    const t = { clientX: x, clientY: y, identifier: 1 };
    Object.defineProperty(evt, 'touches', { value: type === 'touchend' ? [] : [t] });
    Object.defineProperty(evt, 'changedTouches', { value: [t] });
    fg.dispatchEvent(evt);
  }
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  const r = shell.getBoundingClientRect();
  const sx = r.x + r.width * 0.7;
  const sy = r.y + r.height * 0.5;
  fire(fg, 'touchstart', sx, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(fg, 'touchmove', sx - 50, sy);
  await new Promise((r) => setTimeout(r, 50));
  return {
    transform: getComputedStyle(fg).transform,
    classes: shell.className,
  };
});
console.log('  state:', JSON.stringify(midSwipe));
assert(
  'C.1 mid-swipe applies a translate',
  midSwipe.transform !== 'none' && midSwipe.transform.includes('matrix'),
);
await page.screenshot({ path: resolve(OUT, '42-spec-C-mid-swipe.png'), fullPage: false });

console.log('\n=== E. Snap-back after release below latch ===');
const snapBack = await page.evaluate(async () => {
  function fire(fg, type, x, y) {
    const evt = new Event(type, { bubbles: true, cancelable: true });
    const t = { clientX: x, clientY: y, identifier: 1 };
    Object.defineProperty(evt, 'touches', { value: type === 'touchend' ? [] : [t] });
    Object.defineProperty(evt, 'changedTouches', { value: [t] });
    fg.dispatchEvent(evt);
  }
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  const r = shell.getBoundingClientRect();
  const sx = r.x + r.width * 0.7;
  const sy = r.y + r.height * 0.5;
  // release at -40 (below SWIPE_LATCH_PX=60).
  fire(fg, 'touchend', sx - 40, sy);
  // Wait past the 250ms snap-back transition.
  await new Promise((r) => setTimeout(r, 350));
  return {
    transform: getComputedStyle(fg).transform,
    classes: shell.className,
  };
});
console.log('  state:', JSON.stringify(snapBack));
assert(
  'E.1 fg transform clears after snap-back',
  snapBack.transform === 'none' || snapBack.transform === 'matrix(1, 0, 0, 0, 0, 0)',
  `got "${snapBack.transform}"`,
);
assert(
  'E.2 shell no longer has is-swiped after snap-back',
  !snapBack.classes.includes('is-swiped'),
  `classes: "${snapBack.classes}"`,
);

console.log('\n=== D. Full swipe past latch ===');
const fullSwipe = await page.evaluate(async () => {
  function fire(fg, type, x, y) {
    const evt = new Event(type, { bubbles: true, cancelable: true });
    const t = { clientX: x, clientY: y, identifier: 1 };
    Object.defineProperty(evt, 'touches', { value: type === 'touchend' ? [] : [t] });
    Object.defineProperty(evt, 'changedTouches', { value: [t] });
    fg.dispatchEvent(evt);
  }
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  const r = shell.getBoundingClientRect();
  const sx = r.x + r.width * 0.7;
  const sy = r.y + r.height * 0.5;
  fire(fg, 'touchstart', sx, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(fg, 'touchmove', sx - 100, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(fg, 'touchend', sx - 100, sy);
  // Wait for openDrawer's transform to settle.
  await new Promise((r) => setTimeout(r, 350));
  return {
    transform: getComputedStyle(fg).transform,
    classes: shell.className,
  };
});
console.log('  state:', JSON.stringify(fullSwipe));
assert(
  'D.1 fg transform is translateX(-192px) — 3 chips × 64px',
  fullSwipe.transform === 'matrix(1, 0, 0, 1, -192, 0)',
  `got "${fullSwipe.transform}"`,
);
assert(
  'D.2 shell has is-swiped class after latched swipe',
  fullSwipe.classes.includes('is-swiped'),
  `classes: "${fullSwipe.classes}"`,
);
await page.screenshot({ path: resolve(OUT, '43-spec-D-latched.png'), fullPage: false });

console.log('\n=== F. Menu open (after dismissing the swipe) ===');
// Click outside the row to close the swipe drawer.
await page.mouse.click(10, 10);
await page.waitForTimeout(200);
const overflow = page.locator('[data-stage-section="Final"] .er-row-shell').nth(1).locator('[data-row-overflow]');
await overflow.click({ force: true });
await page.waitForTimeout(150);

const menuOpen = await page.evaluate(() => {
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  const menu = shell.querySelector('.er-row-menu');
  const fab = document.querySelector('.er-compose-fab');
  const menuItems = menu.querySelectorAll('.er-row-menu-item');
  let twoLineItem = false;
  for (const item of menuItems) {
    if (item.offsetHeight > 50) { twoLineItem = true; break; }
  }
  return {
    shellZ: getComputedStyle(shell).zIndex,
    fabZ: getComputedStyle(fab).zIndex,
    menuHidden: menu.hidden,
    fgTransform: getComputedStyle(fg).transform,
    itemCount: menuItems.length,
    twoLineItem,
  };
});
console.log('  state:', JSON.stringify(menuOpen));
assert('F.1 menu is visible', !menuOpen.menuHidden);
assert(
  'F.2 shell z-index exceeds FAB z-index',
  parseInt(menuOpen.shellZ) > parseInt(menuOpen.fabZ),
  `shell=${menuOpen.shellZ} fab=${menuOpen.fabZ}`,
);
assert('F.3 fg not translated when menu opens', menuOpen.fgTransform === 'none');
assert(
  'F.4 no menu item wraps onto two lines',
  !menuOpen.twoLineItem,
);
await page.screenshot({ path: resolve(OUT, '44-spec-F-menu-open.png'), fullPage: false });

if (errors.length) {
  console.log('\nPAGE ERRORS:');
  errors.forEach((e) => console.log('  ' + e));
}

await browser.close();

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${passed} pass / ${failed} fail`);

if (failed > 0 || errors.length > 0) process.exit(1);
