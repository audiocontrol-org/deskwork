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

import {
  ping,
  assert,
  launchBrowser,
  newPage,
  parseProbeArgs,
  summarizeResults,
  assertMastheadChrome,
  assertMastheadMenuPopover,
} from './lib/mobile-probe-helpers.mjs';
import { assertRowAffordanceChrome } from './lib/row-affordance-probe.mjs';

// ---- Args -----------------------------------------------------------------

const { studioUrl: argStudio } = parseProbeArgs(process.argv.slice(2));

async function main() {
  const failures = [];

  if (!(await ping(argStudio + '/dev/'))) {
    console.error(`no dev studio at ${argStudio}; start it with \`npm run dev\``);
    process.exit(2);
  }
  console.log(`mobile dashboard probe`);
  console.log(`  studio: ${argStudio}`);
  console.log('');

  const browser = await launchBrowser();
  const url = `${argStudio}/dev/editorial-studio`;

  // ============== PHONE VIEWPORT ==============
  console.log('phone (390x844)');
  const phone = await newPage(browser, { width: 390, height: 844 });
  await phone.goto(url, { waitUntil: 'load' });
  await phone.waitForSelector('[data-stage-tile]', { timeout: 5000 });
  await phone.waitForSelector('[data-er-masthead]', { timeout: 5000 });

  // 0a. Universal masthead chrome — Desk = hub (isHub=true; back-link absent)
  //     Per DESIGN-STANDARDS.md § Studio navigation model: "← absent only
  //     on the Desk itself (you're already home)."
  await assertMastheadChrome(phone, true, failures);

  // 0b. ⋮ popover opens / closes correctly. Replaces the v0.19 floating `?`
  //     overlay (retired in v7 per § Studio navigation model).
  await assertMastheadMenuPopover(phone, failures);

  // 1. Stage tiles rendered
  const tileCount = await phone.evaluate(() =>
    document.querySelectorAll('[data-stage-tile]').length,
  );
  assert(tileCount >= 6, `Stage tiles rendered (got ${tileCount}; expected ≥6 — Ideas/Planned/Outlining/Drafting/Final/Published at minimum)`, failures);

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
    failures,
  );

  // 3. Tapping a non-empty stage tile expands it.
  // Find the first non-disabled LONGFORM tile. The dashboard now hosts
  // both longform and shortform tiles under the shared
  // `[data-stage-tile]` attribute (per Step 2.2.9); the row-affordance
  // chrome assertion below targets longform row markup specifically, so
  // we must filter to longform here. Otherwise on calendars with no
  // non-empty longform stages but non-empty shortform platforms, this
  // helper would pick a shortform tile and assertRowAffordanceChrome()
  // would FAIL on the (correct) shortform row chrome.
  const firstNonEmptyStage = await phone.evaluate(() => {
    const tiles = Array.from(
      document.querySelectorAll(
        '[data-stage-tile][data-stage-section-group="longform"]',
      ),
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
      failures,
    );
    assert(
      expandedAfterTap.tileExpanded === 'true',
      `Tapping ${firstNonEmptyStage} tile sets aria-expanded="true" (got ${expandedAfterTap.tileExpanded})`,
      failures,
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
        failures,
      );
      assert(
        singleExpandState.secondCollapsed === false,
        `Tapping ${secondNonEmptyStage} expands its section`,
        failures,
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
    failures,
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
    failures,
  );
  assert(
    sheetOpen.sheetHidden === false,
    `Compose sheet hidden=false after FAB tap (got hidden=${sheetOpen.sheetHidden})`,
    failures,
  );

  // 7. Sheet renders verb buttons
  const verbCount = await phone.evaluate(() =>
    document.querySelectorAll('[data-compose-verb]').length,
  );
  assert(
    verbCount > 0,
    `Compose sheet renders [data-compose-verb] buttons (got ${verbCount})`,
    failures,
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
    failures,
  );

  // 9. No horizontal overflow on phone
  const phoneOverflow = await phone.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    phoneOverflow.scrollWidth === phoneOverflow.innerWidth,
    `No horizontal overflow at 390x844 (scrollWidth=${phoneOverflow.scrollWidth}, innerWidth=${phoneOverflow.innerWidth})`,
    failures,
  );

  // ============== ROW AFFORDANCE CHROME (v0.20) ==============
  // Extracted to scripts/lib/row-affordance-probe.mjs during Step 2.3.4
  // (studio-mobile-first) to keep this file under the 500-line cap.
  await assertRowAffordanceChrome(phone, firstNonEmptyStage, failures);

  // ============== DESKTOP VIEWPORT ==============
  console.log('');
  console.log('desktop (1280x800)');
  const desktop = await newPage(browser, { width: 1280, height: 800 });
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
    failures,
  );

  // Universal masthead must be display:none on desktop. Per
  // DESIGN-STANDARDS.md § Studio navigation model the masthead is
  // mobile-only (≤600px); desktop refinement is deferred to a separate
  // feature branch.
  const desktopMastheadDisplay = await desktop.evaluate(() => {
    const el = document.querySelector('[data-er-masthead]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    desktopMastheadDisplay === 'none',
    `Mobile masthead hidden on desktop (got ${desktopMastheadDisplay})`,
    failures,
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
    failures,
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
    failures,
  );

  // No horizontal overflow on desktop.
  const desktopOverflow = await desktop.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    desktopOverflow.scrollWidth === desktopOverflow.innerWidth,
    `No horizontal overflow at 1280x800 (scrollWidth=${desktopOverflow.scrollWidth}, innerWidth=${desktopOverflow.innerWidth})`,
    failures,
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
    failures,
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
    failures,
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
    failures,
  );
  assert(
    desktopOverflowBtn?.ariaExpanded === 'false',
    `⋮ aria-expanded=false at-rest on desktop`,
    failures,
  );

  await browser.close();

  summarizeResults(failures);
}

main().catch((err) => {
  console.error('probe error:', err);
  process.exit(2);
});
