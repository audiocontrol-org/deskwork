#!/usr/bin/env node
/**
 * Interactive verification probe for the mobile dashboard
 * (Dashboard Compact-1 collapsible-stage-tiles + filing-tab + FAB).
 *
 * Drives Playwright Chromium at a phone viewport (390x844) against the
 * running dev studio and asserts:
 *
 *   1. /dev/editorial-studio loads with stage tiles rendered
 *   2. At-rest on phone, all stage sections are [data-collapsed]
 *   3. Tapping a non-empty stage tile expands its section
 *      (drops [data-collapsed]) and sets aria-expanded="true"
 *   4. Tapping a different stage tile collapses the previous one
 *      (single-expand invariant)
 *   5. The compose FAB is visible at-rest on phone
 *   6. Tapping the FAB opens the compose sheet
 *      (body[data-compose-sheet-open] set, sheet hidden=false)
 *   7. Sheet renders [data-compose-verb] buttons
 *   8. Tapping the close button closes the sheet
 *   9. No page-level horizontal overflow at 390x844
 *
 * Also re-checks at desktop (1280x800) that:
 *   - Stage tiles are display:none (the existing er-section-head carries
 *     the heading on desktop)
 *   - All stage sections are NOT [data-collapsed] (desktop = expand all)
 *   - The compose FAB is display:none (phone-only affordance)
 *   - No page-level horizontal overflow
 *
 * Usage:
 *   node scripts/probe-mobile-dashboard.mjs [--studio-url URL]
 *
 * Exit codes:
 *   0  all assertions passed
 *   1  one or more assertions failed
 *   2  setup error (no studio reachable)
 */

import { chromium } from 'playwright';

// ---- Args -----------------------------------------------------------------

let argStudio = process.env.STUDIO_URL ?? 'http://localhost:47323';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--studio-url' && args[i + 1]) { argStudio = args[++i]; }
}

const failures = [];
function assert(cond, label) {
  if (cond) {
    console.log(`  [pass] ${label}`);
  } else {
    console.log(`  [FAIL] ${label}`);
    failures.push(label);
  }
}

async function ping(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok || res.status === 302 || res.status === 200;
  } catch { return false; }
}

async function main() {
  if (!(await ping(argStudio + '/dev/'))) {
    console.error(`no dev studio at ${argStudio}; start it with \`npm run dev\``);
    process.exit(2);
  }
  console.log(`mobile dashboard probe`);
  console.log(`  studio: ${argStudio}`);
  console.log('');

  const browser = await chromium.launch();
  const url = `${argStudio}/dev/editorial-studio`;

  // ============== PHONE VIEWPORT ==============
  console.log('phone (390x844)');
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneCtx.newPage();
  await phone.goto(url, { waitUntil: 'load' });
  await phone.waitForSelector('[data-stage-tile]', { timeout: 5000 });

  // 1. Stage tiles rendered
  const tileCount = await phone.evaluate(() =>
    document.querySelectorAll('[data-stage-tile]').length,
  );
  assert(tileCount >= 6, `Stage tiles rendered (got ${tileCount}; expected ≥6 — Ideas/Planned/Outlining/Drafting/Final/Published at minimum)`);

  // 2. At-rest, all sections are collapsed on phone
  const collapsedAtRest = await phone.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-stage-section]'));
    return {
      total: sections.length,
      collapsed: sections.filter((s) => s.hasAttribute('data-collapsed')).length,
    };
  });
  assert(
    collapsedAtRest.total > 0 && collapsedAtRest.collapsed === collapsedAtRest.total,
    `All ${collapsedAtRest.total} stage sections are [data-collapsed] at-rest on phone (got ${collapsedAtRest.collapsed} collapsed)`,
  );

  // 3. Tapping a non-empty stage tile expands it.
  // Find the first non-disabled tile (ones with entries).
  const firstNonEmptyStage = await phone.evaluate(() => {
    const tiles = Array.from(
      document.querySelectorAll('[data-stage-tile]'),
    );
    for (const tile of tiles) {
      if (!tile.disabled) return tile.dataset.stageTile;
    }
    return null;
  });

  if (!firstNonEmptyStage) {
    console.log('  [skip] no non-empty stage tile found — calendar appears empty; expand+collapse asserts skipped');
  } else {
    await phone.click(`[data-stage-tile="${firstNonEmptyStage}"]`);
    await phone.waitForTimeout(150);
    const expandedAfterTap = await phone.evaluate((stage) => {
      const section = document.querySelector(`[data-stage-section="${stage}"]`);
      const tile = document.querySelector(`[data-stage-tile="${stage}"]`);
      return {
        sectionCollapsed: section?.hasAttribute('data-collapsed') ?? null,
        tileExpanded: tile?.getAttribute('aria-expanded') ?? null,
      };
    }, firstNonEmptyStage);
    assert(
      expandedAfterTap.sectionCollapsed === false,
      `Tapping ${firstNonEmptyStage} tile drops [data-collapsed] from its section (got ${expandedAfterTap.sectionCollapsed})`,
    );
    assert(
      expandedAfterTap.tileExpanded === 'true',
      `Tapping ${firstNonEmptyStage} tile sets aria-expanded="true" (got ${expandedAfterTap.tileExpanded})`,
    );

    // 4. Single-expand: tapping a SECOND non-empty tile collapses the first.
    const secondNonEmptyStage = await phone.evaluate((firstStage) => {
      const tiles = Array.from(
        document.querySelectorAll('[data-stage-tile]'),
      );
      for (const tile of tiles) {
        if (!tile.disabled && tile.dataset.stageTile !== firstStage) {
          return tile.dataset.stageTile;
        }
      }
      return null;
    }, firstNonEmptyStage);

    if (!secondNonEmptyStage) {
      console.log('  [skip] only one non-empty stage tile; single-expand assert skipped');
    } else {
      await phone.click(`[data-stage-tile="${secondNonEmptyStage}"]`);
      await phone.waitForTimeout(150);
      const singleExpandState = await phone.evaluate(
        ({ first, second }) => {
          const firstSection = document.querySelector(`[data-stage-section="${first}"]`);
          const secondSection = document.querySelector(`[data-stage-section="${second}"]`);
          return {
            firstCollapsed: firstSection?.hasAttribute('data-collapsed') ?? null,
            secondCollapsed: secondSection?.hasAttribute('data-collapsed') ?? null,
          };
        },
        { first: firstNonEmptyStage, second: secondNonEmptyStage },
      );
      assert(
        singleExpandState.firstCollapsed === true,
        `Tapping ${secondNonEmptyStage} re-collapses ${firstNonEmptyStage} section (single-expand)`,
      );
      assert(
        singleExpandState.secondCollapsed === false,
        `Tapping ${secondNonEmptyStage} expands its section`,
      );
    }
  }

  // 5. Compose FAB visible at-rest
  const fabDisplay = await phone.evaluate(() => {
    const el = document.querySelector('[data-compose-fab]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    fabDisplay !== null && fabDisplay !== 'none',
    `Compose FAB visible on phone (got ${fabDisplay})`,
  );

  // 6. Tap FAB → sheet opens
  await phone.click('[data-compose-fab]');
  await phone.waitForTimeout(100);
  const sheetOpen = await phone.evaluate(() => {
    const sheet = document.querySelector('[data-compose-sheet]');
    return {
      bodyAttr: document.body.hasAttribute('data-compose-sheet-open'),
      sheetHidden: sheet?.hasAttribute('hidden') ?? null,
    };
  });
  assert(
    sheetOpen.bodyAttr === true,
    `body[data-compose-sheet-open] set after FAB tap`,
  );
  assert(
    sheetOpen.sheetHidden === false,
    `Compose sheet hidden=false after FAB tap (got hidden=${sheetOpen.sheetHidden})`,
  );

  // 7. Sheet renders verb buttons
  const verbCount = await phone.evaluate(() =>
    document.querySelectorAll('[data-compose-verb]').length,
  );
  assert(
    verbCount > 0,
    `Compose sheet renders [data-compose-verb] buttons (got ${verbCount})`,
  );

  // 8. Tap close → sheet closes
  await phone.click('[data-compose-close]');
  // close has a slide-out delay (SLIDE_MS=280) before sheet.hidden = true;
  // body attribute clears immediately on click.
  await phone.waitForTimeout(50);
  const bodyClearedAfterClose = await phone.evaluate(() =>
    document.body.hasAttribute('data-compose-sheet-open'),
  );
  assert(
    bodyClearedAfterClose === false,
    `body[data-compose-sheet-open] cleared after close button`,
  );

  // 9. No horizontal overflow on phone
  const phoneOverflow = await phone.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    phoneOverflow.scrollWidth === phoneOverflow.innerWidth,
    `No horizontal overflow at 390x844 (scrollWidth=${phoneOverflow.scrollWidth}, innerWidth=${phoneOverflow.innerWidth})`,
  );

  // ============== ROW AFFORDANCE CHROME (v0.20) ==============
  console.log('');
  console.log('row-affordance chrome (phone)');

  // Expand a stage that has rows so the assertions below have rows to act on.
  if (firstNonEmptyStage) {
    // Re-expand it (previous test sequence may have left a different one open).
    await phone.click(`[data-stage-tile="${firstNonEmptyStage}"]`);
    await phone.waitForTimeout(150);
  }

  // 10. Rows are wrapped in [data-row-shell] with the new chrome
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
  } else {
    assert(rowChromeState.hasDrawer, 'Row shell carries .er-row-drawer');
    assert(rowChromeState.hasFg, 'Row shell carries .er-row-fg');
    assert(rowChromeState.hasOverflow, 'Row shell carries [data-row-overflow] (⋮ button)');
    assert(rowChromeState.hasMenu, 'Row shell carries .er-row-menu');
    assert(rowChromeState.menuHiddenAtRest, 'Menu is hidden at-rest');
    assert(rowChromeState.overflowAriaExpandedAtRest, '⋮ button has aria-expanded=false at-rest');
  }

  // 11. v0.19 regression check: no stacked-inline `.er-btn-small` buttons
  //     visible inside row foregrounds on phone (the desktop-style chrome
  //     that v0.20 retires). Inline chips (`.er-btn-chip`) are present in
  //     the HTML but `display: none` on phone.
  const v019Regression = await phone.evaluate(() => {
    const fgs = Array.from(document.querySelectorAll('.er-row-fg'));
    let visibleBtnSmall = 0;
    for (const fg of fgs) {
      const btns = fg.querySelectorAll('.er-btn-small');
      for (const b of btns) {
        if (getComputedStyle(b).display !== 'none') visibleBtnSmall++;
      }
    }
    // Inline chips should be hidden on phone.
    const chips = Array.from(document.querySelectorAll('.er-btn-chip'));
    const visibleChips = chips.filter((c) => getComputedStyle(c).display !== 'none').length;
    return { visibleBtnSmall, visibleChips };
  });
  assert(
    v019Regression.visibleBtnSmall === 0,
    `No legacy .er-btn-small buttons visible on phone rows (got ${v019Regression.visibleBtnSmall})`,
  );
  assert(
    v019Regression.visibleChips === 0,
    `No .er-btn-chip inline chips visible on phone (got ${v019Regression.visibleChips})`,
  );

  // 12. Tap ⋮ opens the menu (sets aria-expanded=true + un-hides menu)
  if (rowChromeState.ok) {
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
    assert(menuOpen !== null, 'Tap ⋮ adds .is-menu-open class to the row shell');
    if (menuOpen) {
      assert(menuOpen.ariaExpanded === 'true', '⋮ aria-expanded=true when menu open');
      assert(menuOpen.menuHidden === false, 'Menu un-hidden when ⋮ is tapped');
      assert(menuOpen.menuItems >= 2, `Menu renders items (got ${menuOpen.menuItems})`);
    }

    // 13. Menu contains stage-aware verbs for an active-pipeline row.
    //     Active stages should expose iterate / approve / block / induct /
    //     cancel / scrapbook (6 items per the brief's verb table).
    const verbSet = await phone.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('.is-menu-open .er-row-menu-item'),
      );
      return items.map((i) => {
        const cmd = i.dataset.copy ?? i.dataset.href ?? '';
        return cmd.replace(/ .+$/, '').replace(/\?.+$/, ''); // strip args / query
      });
    });
    // Tolerant assertion: the verb set depends on the stage of the first
    // row we opened. Active stages should include iterate + block; Final
    // stages include block but not iterate. Either is acceptable — what we
    // want is evidence the FULL set is rendered (not just 2 verbs).
    assert(verbSet.length >= 4, `Menu renders ≥4 stage-aware verbs (got ${verbSet.length}: ${verbSet.join(', ')})`);

    // 14. Click outside the menu closes it
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
    assert(menuClosed.anyOpen === 0, 'Click-outside closes the menu');
    assert(menuClosed.ariaExpanded === 'false', '⋮ aria-expanded resets to false');

    // 15. Click on row body (title / date — NOT slug link, NOT button)
    //     navigates to the entry-review surface. Per the Row-4 brief,
    //     tap-anywhere-on-the-row IS the primary action. Was a real
    //     bug shipped briefly post-Task-1.8: the row chrome rendered
    //     but click-on-body was a no-op because only the slug carried
    //     a <a href>. Operators tapping the title or date got nothing.
    const navBefore = phone.url();
    await phone.evaluate(() => {
      const title = document.querySelector(
        '[data-row-shell] .er-row-fg .er-calendar-title',
      );
      // Cast to HTMLElement for click() — querySelector returns Element.
      (title)?.click();
    });
    await phone.waitForTimeout(600);
    const navAfter = phone.url();
    assert(
      navAfter !== navBefore && navAfter.includes('/dev/editorial-review/entry/'),
      `Click row body (title) navigates to entry-review surface (before=${navBefore.slice(-40)}, after=${navAfter.slice(-40)})`,
    );
  }

  // ============== DESKTOP VIEWPORT ==============
  console.log('');
  console.log('desktop (1280x800)');
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktop = await desktopCtx.newPage();
  await desktop.goto(url, { waitUntil: 'load' });
  await desktop.waitForSelector('[data-stage-section]', { timeout: 5000 });

  // Stage tiles must be display:none on desktop.
  const desktopTileDisplay = await desktop.evaluate(() => {
    const tile = document.querySelector('[data-stage-tile]');
    if (!tile) return null;
    return getComputedStyle(tile).display;
  });
  assert(
    desktopTileDisplay === 'none',
    `Stage tiles hidden on desktop (got ${desktopTileDisplay})`,
  );

  // Sections must be uncollapsed on desktop.
  const desktopCollapseState = await desktop.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-stage-section]'));
    return {
      total: sections.length,
      collapsed: sections.filter((s) => s.hasAttribute('data-collapsed')).length,
    };
  });
  assert(
    desktopCollapseState.total > 0 && desktopCollapseState.collapsed === 0,
    `All ${desktopCollapseState.total} stage sections expanded on desktop (got ${desktopCollapseState.collapsed} collapsed; expected 0)`,
  );

  // Compose FAB must be display:none on desktop.
  const desktopFabDisplay = await desktop.evaluate(() => {
    const el = document.querySelector('[data-compose-fab]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    desktopFabDisplay === 'none',
    `Compose FAB hidden on desktop (got ${desktopFabDisplay})`,
  );

  // No horizontal overflow on desktop.
  const desktopOverflow = await desktop.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    desktopOverflow.scrollWidth === desktopOverflow.innerWidth,
    `No horizontal overflow at 1280x800 (scrollWidth=${desktopOverflow.scrollWidth}, innerWidth=${desktopOverflow.innerWidth})`,
  );

  // Inline `.er-btn-chip` chips visible on desktop (high-frequency verbs).
  const desktopChips = await desktop.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.er-btn-chip'));
    return {
      total: chips.length,
      visible: chips.filter((c) => getComputedStyle(c).display !== 'none').length,
    };
  });
  assert(
    desktopChips.total > 0 && desktopChips.visible > 0,
    `Desktop renders inline .er-btn-chip chips (got ${desktopChips.visible}/${desktopChips.total} visible)`,
  );

  // Drawer rendered in DOM but display:none on desktop (swipe is mobile-only).
  const desktopDrawerHidden = await desktop.evaluate(() => {
    const drawer = document.querySelector('.er-row-drawer');
    if (!drawer) return null;
    return getComputedStyle(drawer).display;
  });
  assert(
    desktopDrawerHidden === 'none',
    `Drawer display:none on desktop (got ${desktopDrawerHidden})`,
  );

  // ⋮ button + menu work on desktop too.
  const desktopOverflowBtn = await desktop.evaluate(() => {
    const btn = document.querySelector('[data-row-overflow]');
    if (!btn) return null;
    return {
      visible: getComputedStyle(btn).display !== 'none',
      ariaExpanded: btn.getAttribute('aria-expanded'),
    };
  });
  assert(
    desktopOverflowBtn?.visible === true,
    `⋮ button visible on desktop (got ${desktopOverflowBtn?.visible})`,
  );
  assert(
    desktopOverflowBtn?.ariaExpanded === 'false',
    `⋮ aria-expanded=false at-rest on desktop`,
  );

  await browser.close();

  console.log('');
  console.log(`${failures.length} failure(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe error:', err);
  process.exit(2);
});
