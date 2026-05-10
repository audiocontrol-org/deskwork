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

  await browser.close();

  console.log('');
  console.log(`${failures.length} failure(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe error:', err);
  process.exit(2);
});
