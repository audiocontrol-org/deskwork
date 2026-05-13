#!/usr/bin/env node
/**
 * Row-affordance chrome probe (extracted from probe-mobile-dashboard.mjs
 * during Step 2.3.4 of the studio-mobile-first feature work).
 *
 * The v0.20 row-affordance pattern (shipped in v0.20.0) wraps each row in
 * `[data-row-shell]` with a `.er-row-drawer` + `.er-row-fg` + `.er-row-menu`
 * triad. The `⋮` button opens a stage-aware verb menu (iterate / approve /
 * block / induct / cancel / scrapbook). The chrome is mobile-first; desktop
 * keeps inline `.er-btn-chip` verb chips.
 *
 * This module factors the dashboard probe's row-affordance assertions
 * (originally inline at probe-mobile-dashboard.mjs lines 249-389) into a
 * single helper so the dashboard probe stays under the 500-line cap and
 * future surfaces with row-affordance chrome (shortform-section rows when
 * Step 2.2.10's popover wire-up is generalized; see issue #263) can reuse
 * the assertions.
 *
 * Named exports only.
 */

import { assert } from './mobile-probe-helpers.mjs';

/**
 * Run the full row-affordance chrome assertion suite against a Playwright
 * page already navigated to a surface with rendered `[data-row-shell]`
 * elements.
 *
 *   - Asserts each shell carries .er-row-drawer + .er-row-fg + ⋮ overflow
 *     button + .er-row-menu.
 *   - Asserts at-rest state (menu hidden, aria-expanded=false).
 *   - Asserts v0.19 regression: no .er-btn-small or visible .er-btn-chip
 *     on phone.
 *   - Drives a ⋮-tap-opens / click-outside-closes cycle.
 *   - Asserts row-body click (title) navigates to /dev/editorial-review/entry/<uuid>.
 *
 * If no [data-row-shell] elements exist on the page (empty calendar, etc.),
 * the suite is skipped and a `[skip]` line is logged. Failures accumulate
 * into the supplied array.
 *
 * @param {import('playwright').Page} phone   Playwright phone page.
 * @param {string} firstNonEmptyStage         Stage id to re-expand before driving
 *                                            (caller is responsible for picking one;
 *                                            pass null/undefined to skip re-expand).
 * @param {string[]} failures                 Failures accumulator.
 */
export async function assertRowAffordanceChrome(phone, firstNonEmptyStage, failures) {
  console.log('');
  console.log('row-affordance chrome (phone)');

  if (firstNonEmptyStage) {
    await phone.click(`[data-stage-tile="${firstNonEmptyStage}"]`);
    await phone.waitForTimeout(150);
  }

  // Rows wrapped in [data-row-shell] with .er-row-drawer + .er-row-fg +
  // [data-row-overflow] + .er-row-menu
  const rowChromeState = await phone.evaluate(() => {
    const shells = Array.from(document.querySelectorAll('[data-row-shell]'));
    if (shells.length === 0) return { ok: false, reason: 'no row shells found' };
    const shell = shells[0];
    return {
      ok: true,
      hasDrawer: !!shell.querySelector('.er-row-drawer'),
      hasFg: !!shell.querySelector('.er-row-fg'),
      hasOverflow: !!shell.querySelector('[data-row-overflow]'),
      hasMenu: !!shell.querySelector('.er-row-menu'),
      menuHiddenAtRest: shell.querySelector('.er-row-menu')?.hasAttribute('hidden') === true,
      overflowAriaExpandedAtRest:
        shell.querySelector('[data-row-overflow]')?.getAttribute('aria-expanded') === 'false',
    };
  });
  if (!rowChromeState.ok) {
    console.log(`  [skip] ${rowChromeState.reason ?? 'unknown'} — no rows to check`);
    return;
  }

  assert(rowChromeState.hasDrawer, 'Row shell carries .er-row-drawer', failures);
  assert(rowChromeState.hasFg, 'Row shell carries .er-row-fg', failures);
  assert(rowChromeState.hasOverflow, 'Row shell carries [data-row-overflow] (⋮ button)', failures);
  assert(rowChromeState.hasMenu, 'Row shell carries .er-row-menu', failures);
  assert(rowChromeState.menuHiddenAtRest, 'Menu is hidden at-rest', failures);
  assert(rowChromeState.overflowAriaExpandedAtRest, '⋮ button has aria-expanded=false at-rest', failures);

  // v0.19 regression check: no stacked-inline `.er-btn-small` buttons
  // visible inside row foregrounds on phone (the desktop-style chrome
  // that v0.20 retires). Inline chips (`.er-btn-chip`) are present in
  // the HTML but `display: none` on phone.
  const v019Regression = await phone.evaluate(() => {
    const fgs = Array.from(document.querySelectorAll('.er-row-fg'));
    let visibleBtnSmall = 0;
    for (const fg of fgs) {
      const btns = fg.querySelectorAll('.er-btn-small');
      for (const b of btns) {
        if (getComputedStyle(b).display !== 'none') visibleBtnSmall++;
      }
    }
    const chips = Array.from(document.querySelectorAll('.er-btn-chip'));
    const visibleChips = chips.filter((c) => getComputedStyle(c).display !== 'none').length;
    return { visibleBtnSmall, visibleChips };
  });
  assert(
    v019Regression.visibleBtnSmall === 0,
    `No legacy .er-btn-small buttons visible on phone rows (got ${v019Regression.visibleBtnSmall})`,
    failures,
  );
  assert(
    v019Regression.visibleChips === 0,
    `No .er-btn-chip inline chips visible on phone (got ${v019Regression.visibleChips})`,
    failures,
  );

  // Tap ⋮ opens the menu (sets aria-expanded=true + un-hides menu)
  await phone.click('[data-row-shell] [data-row-overflow]');
  await phone.waitForTimeout(100);
  const menuOpen = await phone.evaluate(() => {
    const shell = document.querySelector('.is-menu-open');
    if (!shell) return null;
    return {
      ariaExpanded: shell.querySelector('[data-row-overflow]')?.getAttribute('aria-expanded'),
      menuHidden: shell.querySelector('.er-row-menu')?.hasAttribute('hidden'),
      menuItems: shell.querySelectorAll('.er-row-menu-item').length,
    };
  });
  assert(menuOpen !== null, 'Tap ⋮ adds .is-menu-open class to the row shell', failures);
  if (menuOpen) {
    assert(menuOpen.ariaExpanded === 'true', '⋮ aria-expanded=true when menu open', failures);
    assert(menuOpen.menuHidden === false, 'Menu un-hidden when ⋮ is tapped', failures);
    assert(menuOpen.menuItems >= 2, `Menu renders items (got ${menuOpen.menuItems})`, failures);
  }

  // Menu contains stage-aware verbs for an active-pipeline row. Active
  // stages should expose iterate / approve / block / induct / cancel /
  // scrapbook (6 items per the brief's verb table). Tolerant assertion:
  // the verb set depends on the stage of the first row we opened — what
  // we want is evidence the FULL set is rendered (not just 2 verbs).
  const verbSet = await phone.evaluate(() => {
    const items = Array.from(
      document.querySelectorAll('.is-menu-open .er-row-menu-item'),
    );
    return items.map((i) => {
      const cmd = i.dataset.copy ?? i.dataset.href ?? '';
      return cmd.replace(/ .+$/, '').replace(/\?.+$/, '');
    });
  });
  assert(verbSet.length >= 4, `Menu renders ≥4 stage-aware verbs (got ${verbSet.length}: ${verbSet.join(', ')})`, failures);

  // Click outside the menu closes it
  await phone.click('body', { position: { x: 10, y: 10 } });
  await phone.waitForTimeout(150);
  const menuClosed = await phone.evaluate(() => {
    return {
      anyOpen: document.querySelectorAll('.is-menu-open').length,
      ariaExpanded: document
        .querySelector('[data-row-shell] [data-row-overflow]')
        ?.getAttribute('aria-expanded'),
    };
  });
  assert(menuClosed.anyOpen === 0, 'Click-outside closes the menu', failures);
  assert(menuClosed.ariaExpanded === 'false', '⋮ aria-expanded resets to false', failures);

  // Click on row body (title — NOT slug link, NOT button) navigates to
  // the entry-review surface. Per the Row-4 brief, tap-anywhere-on-the-
  // row IS the primary action. Was a real bug shipped briefly post-Task-
  // 1.8: the row chrome rendered but click-on-body was a no-op because
  // only the slug carried an <a href>. Operators tapping the title or
  // date got nothing.
  const navBefore = phone.url();
  await phone.evaluate(() => {
    const title = document.querySelector(
      '[data-row-shell] .er-row-fg .er-calendar-title',
    );
    (title)?.click();
  });
  await phone.waitForTimeout(600);
  const navAfter = phone.url();
  assert(
    navAfter !== navBefore && navAfter.includes('/dev/editorial-review/entry/'),
    `Click row body (title) navigates to entry-review surface (before=${navBefore.slice(-40)}, after=${navAfter.slice(-40)})`,
    failures,
  );
}
