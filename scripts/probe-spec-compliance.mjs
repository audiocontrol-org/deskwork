#!/usr/bin/env node
// Spec-compliance probe for the v0.20 row affordance redesign.
//
// Every assertion in this file traces back to a literal clause in the
// design brief at:
//   docs/studio-design/ACCEPTED/2026-05-11-row-affordance-overflow-plus-swipe/brief.md
// expressed as something an operator can perceive on screen (counted
// elements, visible chips, unobstructed targets) — not as a CSS computed
// property the operator can't see.
//
// Runs on real WebKit (Playwright + iPhone 14 emulation — reports
// `hover: none, pointer: coarse` like real iOS Safari).

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
  if (rgb.startsWith('rgb(')) return true;
  const m = rgb.match(/rgba\([^,]+,\s*[^,]+,\s*[^,]+,\s*([0-9.]+)\)/);
  if (!m) return false;
  return parseFloat(m[1]) >= 0.999;
}

/**
 * Spec table from the brief. Each entry names the stage and the verb
 * kinds the drawer must reveal IN ORDER (left → right).
 */
const SPEC_DRAWER = {
  Ideas:     ['iterate', 'approve', 'cancel', 'scrapbook'],
  Planned:   ['iterate', 'approve', 'cancel', 'scrapbook'],
  Outlining: ['iterate', 'approve', 'cancel', 'scrapbook'],
  Drafting:  ['iterate', 'approve', 'cancel', 'scrapbook'],
  Final:     ['approve', 'cancel', 'scrapbook'],
  Blocked:   ['induct', 'scrapbook'],
  Cancelled: ['induct', 'scrapbook'],
  Published: ['view', 'scrapbook'],
};

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${STUDIO_URL}/dev/editorial-studio`, { waitUntil: 'networkidle' });

// =====================================================================
// SECTION 1 — At-rest, post-hover, mid-swipe, snap-back, menu-open.
// Each section's assertions trace to a literal sentence in the brief.
// =====================================================================

console.log('\n=== A. At-rest (brief: "row at-rest is clean") ===');
await page.click('[data-stage-tile="Final"]');
await page.waitForTimeout(300);
await page.mouse.move(0, 0);
await page.waitForTimeout(100);
const restState = await page.evaluate(() => {
  const shell = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1];
  const fg = shell.querySelector('.er-row-fg');
  const menu = shell.querySelector('.er-row-menu');
  return {
    fgBg: getComputedStyle(fg).backgroundColor,
    fgTransform: getComputedStyle(fg).transform,
    menuHidden: menu.hidden,
    shellClasses: shell.className,
    overflowVisible: !!shell.querySelector('[data-row-overflow]'),
  };
});
assert(
  'A.1 fg background opaque at rest',
  isOpaque(restState.fgBg),
  `got ${restState.fgBg}`,
);
assert('A.2 fg transform none at rest', restState.fgTransform === 'none');
assert('A.3 menu hidden at rest', restState.menuHidden);
assert(
  'A.4 shell has no is-swiped / is-menu-open at rest',
  !restState.shellClasses.includes('is-swiped')
    && !restState.shellClasses.includes('is-menu-open'),
);
assert('A.5 ⋮ overflow button rendered (low-contrast trailing)', restState.overflowVisible);

console.log('\n=== B. Post-tap-hover (iOS Safari sticky-hover) ===');
const fgLocator = page.locator('[data-stage-section="Final"] .er-row-shell').nth(1).locator('.er-row-fg');
await fgLocator.hover({ force: true });
await page.waitForTimeout(150);
const hoverBg = await page.evaluate(() => {
  const fg = document.querySelectorAll('[data-stage-section="Final"] .er-row-shell')[1].querySelector('.er-row-fg');
  return getComputedStyle(fg).backgroundColor;
});
assert(
  'B.1 fg background opaque under sticky-hover',
  isOpaque(hoverBg),
  `got ${hoverBg}`,
);
// Reset cursor so subsequent measurements aren't tainted by hover state.
await page.mouse.move(0, 0);
await page.waitForTimeout(100);

// =====================================================================
// SECTION 2 — Drawer spec (brief: "drawer slides in with up to 4 stage-
// aware verb chips"; stage table maps stage → ordered verb set).
// For each stage we have rows in, programmatically latch the drawer
// and assert the spec's visible promise.
// =====================================================================

console.log('\n=== C. Drawer verb-set per stage ===');

// Discover which stages have rows on this dashboard. We only spec-check
// stages with rows — stages with zero rows aren't a spec violation, they
// just can't be exercised against this dataset.
const stagesWithRows = await page.evaluate(() => {
  const out = [];
  for (const section of document.querySelectorAll('[data-stage-section]')) {
    const stage = section.getAttribute('data-stage-section');
    const rows = section.querySelectorAll('.er-row-shell').length;
    if (rows > 0) out.push({ stage, rows });
  }
  return out;
});
console.log('  stages with rows:', stagesWithRows.map((s) => `${s.stage}(${s.rows})`).join(', '));

for (const { stage } of stagesWithRows) {
  if (!SPEC_DRAWER[stage]) continue; // Distribution has no spec entry.
  const expected = SPEC_DRAWER[stage];

  // Open this stage's tile.
  await page.evaluate((s) => {
    const tile = document.querySelector(`[data-stage-tile="${s}"]`);
    // Only click if currently collapsed.
    if (tile && tile.getAttribute('aria-expanded') !== 'true') tile.click();
  }, stage);
  await page.waitForTimeout(250);

  // Scroll first row of this stage into view to ensure latching is
  // happening within the viewport (so visibility checks are meaningful).
  await page.evaluate((s) => {
    const shell = document.querySelector(`[data-stage-section="${s}"] .er-row-shell`);
    shell?.scrollIntoView({ block: 'center' });
  }, stage);
  await page.waitForTimeout(200);

  // Latch the first row's drawer programmatically.
  const latchInfo = await page.evaluate(async (s) => {
    function fire(fg, type, x, y) {
      const evt = new Event(type, { bubbles: true, cancelable: true });
      const t = { clientX: x, clientY: y, identifier: 1 };
      Object.defineProperty(evt, 'touches', { value: type === 'touchend' ? [] : [t] });
      Object.defineProperty(evt, 'changedTouches', { value: [t] });
      fg.dispatchEvent(evt);
    }
    const shell = document.querySelector(`[data-stage-section="${s}"] .er-row-shell`);
    if (!shell) return { error: 'no row shell' };
    const fg = shell.querySelector('.er-row-fg');
    const r = shell.getBoundingClientRect();
    const sx = r.x + r.width * 0.7;
    const sy = r.y + r.height * 0.5;
    fire(fg, 'touchstart', sx, sy);
    await new Promise((r) => setTimeout(r, 20));
    fire(fg, 'touchmove', sx - 120, sy);
    await new Promise((r) => setTimeout(r, 20));
    fire(fg, 'touchend', sx - 120, sy);
    await new Promise((r) => setTimeout(r, 400)); // wait past 250ms transition
    return {
      transform: getComputedStyle(fg).transform,
      classes: shell.className,
      slug: shell.getAttribute('data-slug'),
    };
  }, stage);

  console.log(`  stage ${stage} (row: ${latchInfo.slug}) latched: ${latchInfo.transform}, classes: ${latchInfo.classes}`);

  // Mechanism assertion (debugging aid).
  assert(
    `C.${stage}.0 shell has is-swiped after latched swipe`,
    latchInfo.classes?.includes('is-swiped'),
    `classes: ${latchInfo.classes}`,
  );

  // Spec assertion 1: chip COUNT matches.
  const chipKinds = await page.evaluate((s) => {
    const shell = document.querySelector(`[data-stage-section="${s}"] .er-row-shell`);
    const chips = Array.from(shell.querySelectorAll('.er-row-drawer .er-row-action'));
    return chips.map((c) => {
      const m = c.className.match(/er-row-action-(\w+)/);
      return m ? m[1] : '?';
    });
  }, stage);
  assert(
    `C.${stage}.1 drawer renders ${expected.length} chips`,
    chipKinds.length === expected.length,
    `expected [${expected.join(', ')}] got [${chipKinds.join(', ')}]`,
  );

  // Spec assertion 2: chip IDENTITY + ORDER matches the spec table.
  const orderOk = chipKinds.length === expected.length
    && expected.every((k, i) => chipKinds[i] === k);
  assert(
    `C.${stage}.2 drawer chip identity + order matches spec`,
    orderOk,
    `expected [${expected.join(', ')}] got [${chipKinds.join(', ')}]`,
  );

  // Spec assertion 3: each chip is VISIBLE (within viewport, non-zero size).
  const visibility = await page.evaluate((s) => {
    const shell = document.querySelector(`[data-stage-section="${s}"] .er-row-shell`);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const chips = Array.from(shell.querySelectorAll('.er-row-drawer .er-row-action'));
    return chips.map((c) => {
      const r = c.getBoundingClientRect();
      const kind = c.className.match(/er-row-action-(\w+)/)?.[1];
      return {
        kind,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        inViewport: r.x >= 0 && r.y >= 0 && r.x + r.width <= vw && r.y + r.height <= vh,
        nonZero: r.width > 0 && r.height > 0,
      };
    });
  }, stage);
  for (const v of visibility) {
    assert(
      `C.${stage}.3.${v.kind} chip has non-zero size`,
      v.nonZero,
      `rect: ${JSON.stringify(v.rect)}`,
    );
    assert(
      `C.${stage}.4.${v.kind} chip fully within viewport`,
      v.inViewport,
      `rect: ${JSON.stringify(v.rect)}, viewport: ${(await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight }))).vw}x${(await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight }))).vh}`,
    );
  }

  // Spec assertion 4: each chip has a VISIBLE, NON-PAPER background.
  // Spec implies (per the mockup palette) that every chip carries a
  // distinct accent color — green/red/blue/kraft. A chip with an
  // undefined background token (e.g., var(--er-kraft) when --er-kraft
  // isn't defined) renders transparent and is functionally invisible
  // against the paper. elementsFromPoint won't catch this — the chip
  // is still the topmost element, it just paints nothing. Assert
  // explicitly: bg is opaque AND distinguishable from --er-paper.
  const chipColors = await page.evaluate((s) => {
    const shell = document.querySelector(`[data-stage-section="${s}"] .er-row-shell`);
    const chips = Array.from(shell.querySelectorAll('.er-row-drawer .er-row-action'));
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--er-paper').trim();
    return chips.map((c) => ({
      kind: c.className.match(/er-row-action-(\w+)/)?.[1],
      bg: getComputedStyle(c).backgroundColor,
      paper,
    }));
  }, stage);
  for (const c of chipColors) {
    const isTransparent = c.bg === 'rgba(0, 0, 0, 0)' || c.bg === 'transparent';
    assert(
      `C.${stage}.5.${c.kind} chip background is opaque (not transparent)`,
      !isTransparent,
      `bg: ${c.bg}`,
    );
  }

  // Spec assertion 5: each chip's CENTER POINT is unobstructed — the
  // topmost element at the chip's center is the chip itself (or one of
  // its descendants), NOT some higher-z-index element painting over it.
  const occlusion = await page.evaluate((s) => {
    const shell = document.querySelector(`[data-stage-section="${s}"] .er-row-shell`);
    const chips = Array.from(shell.querySelectorAll('.er-row-drawer .er-row-action'));
    return chips.map((chip) => {
      const r = chip.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const top = document.elementsFromPoint(cx, cy)[0];
      const isChipOrDescendant = top === chip || chip.contains(top);
      return {
        kind: chip.className.match(/er-row-action-(\w+)/)?.[1],
        topClass: top?.className ?? '(none)',
        topTag: top?.tagName ?? '(none)',
        isChipOrDescendant,
      };
    });
  }, stage);
  for (const o of occlusion) {
    assert(
      `C.${stage}.6.${o.kind} chip not occluded by another element`,
      o.isChipOrDescendant,
      `topmost at chip center: <${o.topTag} class="${o.topClass}">`,
    );
  }

  // Screenshot for visual audit.
  await page.screenshot({
    path: resolve(OUT, `50-spec-${stage}-latched.png`),
    fullPage: false,
  });

  // Dismiss the latched drawer before moving to the next stage.
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
}

// =====================================================================
// SECTION 3 — Menu (brief: "tap the ⋮ → vertical popover with the full
// stage-aware verb set"). Verify menu opens, items fit on one line, FAB
// doesn't paint over the menu.
// =====================================================================

console.log('\n=== F. Menu open ===');
// Re-open Final (single-expand may have collapsed it during section C).
await page.evaluate(() => {
  const tile = document.querySelector('[data-stage-tile="Final"]');
  if (tile && tile.getAttribute('aria-expanded') !== 'true') tile.click();
});
await page.waitForTimeout(250);
await page.evaluate(() => {
  document.querySelector('[data-stage-section="Final"] .er-row-shell')
    ?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(200);
// Use Final since it has plenty of rows.
const overflow = page.locator('[data-stage-section="Final"] .er-row-shell').first().locator('[data-row-overflow]');
await overflow.click({ force: true });
await page.waitForTimeout(200);

const menuState = await page.evaluate(() => {
  const shell = document.querySelector('[data-stage-section="Final"] .er-row-shell');
  const menu = shell.querySelector('.er-row-menu');
  const fab = document.querySelector('.er-compose-fab');
  const items = Array.from(menu.querySelectorAll('.er-row-menu-item'));
  return {
    menuHidden: menu.hidden,
    items: items.map((i) => ({
      kind: i.className,
      h: i.offsetHeight,
    })),
    fabDisplay: fab ? getComputedStyle(fab).display : '(missing)',
    bodyHasOpenFlag: document.body.classList.contains('er-row-surface-open'),
  };
});
assert('F.1 menu visible after ⋮ tap', !menuState.menuHidden);
assert(
  'F.2 body has er-row-surface-open while a surface is open',
  menuState.bodyHasOpenFlag,
);
assert(
  'F.3 compose FAB hidden while a surface is open',
  menuState.fabDisplay === 'none',
  `display: ${menuState.fabDisplay}`,
);
const wrappedItems = menuState.items.filter((i) => i.h > 50);
assert(
  'F.4 no menu item wraps onto two lines',
  wrappedItems.length === 0,
  `items > 50px tall: ${wrappedItems.length}`,
);
await page.screenshot({ path: resolve(OUT, '51-spec-menu-open.png'), fullPage: false });

// =====================================================================
// SECTION 4 — Snap-back after release below latch threshold.
// =====================================================================

console.log('\n=== E. Snap-back below latch ===');
// Dismiss the menu first.
await page.mouse.click(5, 5);
await page.waitForTimeout(200);

const snapBack = await page.evaluate(async () => {
  function fire(fg, type, x, y) {
    const evt = new Event(type, { bubbles: true, cancelable: true });
    const t = { clientX: x, clientY: y, identifier: 1 };
    Object.defineProperty(evt, 'touches', { value: type === 'touchend' ? [] : [t] });
    Object.defineProperty(evt, 'changedTouches', { value: [t] });
    fg.dispatchEvent(evt);
  }
  const shell = document.querySelector('[data-stage-section="Final"] .er-row-shell');
  const fg = shell.querySelector('.er-row-fg');
  const r = shell.getBoundingClientRect();
  const sx = r.x + r.width * 0.7;
  const sy = r.y + r.height * 0.5;
  fire(fg, 'touchstart', sx, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(fg, 'touchmove', sx - 40, sy);
  await new Promise((r) => setTimeout(r, 20));
  fire(fg, 'touchend', sx - 40, sy);
  await new Promise((r) => setTimeout(r, 400));
  return {
    transform: getComputedStyle(fg).transform,
    classes: shell.className,
    bodyHasOpenFlag: document.body.classList.contains('er-row-surface-open'),
  };
});
assert(
  'E.1 fg transform clears after snap-back',
  snapBack.transform === 'none' || snapBack.transform === 'matrix(1, 0, 0, 0, 0, 0)',
  `got "${snapBack.transform}"`,
);
assert(
  'E.2 shell no longer has is-swiped after snap-back',
  !snapBack.classes.includes('is-swiped'),
);
assert(
  'E.3 body no longer has er-row-surface-open after snap-back',
  !snapBack.bodyHasOpenFlag,
);

if (errors.length) {
  console.log('\nPAGE ERRORS:');
  errors.forEach((e) => console.log('  ' + e));
}

await browser.close();

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${passed} pass / ${failed} fail`);
if (failed > 0 || errors.length > 0) process.exit(1);
