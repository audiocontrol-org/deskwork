#!/usr/bin/env node
/**
 * Interactive verification probe for the v7 Desk surface
 * (`/dev/editorial-studio`) at the phone viewport.
 *
 * Drives Playwright Chromium at 390x844 and asserts the three-section
 * Desk information architecture defined in `DESIGN-STANDARDS.md § Desk
 * information architecture`:
 *
 *   1. Universal masthead chrome (hub = back-link absent; ⋮ glyph present).
 *   2. ⋮ popover opens / dismisses correctly.
 *   3. § Longform pipeline · 8 stage tiles (existing pre-v7 surface;
 *      this probe lightly verifies tile count + single-expand within
 *      section, since the heavier coverage already lives in
 *      probe-mobile-dashboard.mjs).
 *   4. § Shortform · by platform · 4 platform tiles (LinkedIn, Reddit,
 *      YouTube, Instagram in that order). Each empty tile renders per
 *      the muted-palette empty-state spec (opacity === '1', chevron
 *      visibility hidden).
 *   5. § Adjacent tools · 2 inert future tiles (Folio + Files) with
 *      `aria-disabled="true"`.
 *   6. Independent single-expand across sections — operator may have
 *      one longform stage AND one shortform platform expanded
 *      simultaneously. Tapping a second tile within ONE section
 *      collapses the previously-open tile in that section but leaves
 *      the other section untouched.
 *   7. Compose FAB visible.
 *   8. No horizontal scroll.
 *
 * Desktop (1280x800):
 *   - Mobile masthead is display:none.
 *   - Compose FAB is display:none.
 *   - No horizontal scroll.
 *
 * Per DESIGN-STANDARDS.md § Empty-state rendering, empty tiles MUST
 * render via explicit muted palette, NOT via `opacity` reduction. The
 * probe asserts `getComputedStyle().opacity === '1'` on empty platform
 * tiles to catch opacity regressions.
 *
 * Usage:
 *   node scripts/probe-mobile-desk.mjs [--studio-url URL]
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

const { studioUrl: argStudio } = parseProbeArgs(process.argv.slice(2));

const SHORTFORM_PLATFORMS = ['linkedin', 'reddit', 'youtube', 'instagram'];
const LONGFORM_STAGES = [
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Final',
  'Published',
  'Blocked',
  'Cancelled',
];

async function main() {
  const failures = [];

  if (!(await ping(argStudio + '/dev/'))) {
    console.error(`no dev studio at ${argStudio}; start it with \`npm run dev\``);
    process.exit(2);
  }

  console.log(`mobile desk probe`);
  console.log(`  studio: ${argStudio}`);
  console.log('');

  const browser = await launchBrowser();
  const url = `${argStudio}/dev/editorial-studio`;

  // ============== PHONE VIEWPORT ==============
  console.log('phone (390x844)');
  const phone = await newPage(browser, { width: 390, height: 844 });
  const response = await phone.goto(url, { waitUntil: 'load' });
  assert(
    response !== null && response.status() === 200,
    `Desk loads at ${url} (status 200)`,
    failures,
  );
  await phone.waitForSelector('[data-er-masthead]', { timeout: 5000 });

  // -- masthead chrome (Desk = hub: back-link absent; ⋮ present) --
  await assertMastheadChrome(phone, true, failures);

  // -- ⋮ popover open / dismiss --
  await assertMastheadMenuPopover(phone, failures);

  // -- Three section heads in order (Longform / Shortform / Adjacent) --
  // The longform pipeline doesn't render an explicit `.er-desk-section-head`
  // — its eight stage tiles are the section. Shortform + Adjacent render
  // `.er-desk-section-head--shortform` / `.er-desk-section-head--adjacent`
  // marker classes per renderShortformSectionHead / renderAdjacentSectionHead.
  const shortformHead = await phone.evaluate(() => {
    const el = document.querySelector('.er-desk-section-head--shortform');
    if (!el) return null;
    const label = el.querySelector('.er-desk-section-head-label')?.textContent ?? '';
    return { present: true, label: label.trim() };
  });
  assert(
    shortformHead?.present === true && shortformHead?.label.startsWith('Shortform'),
    `Shortform section head present (label="${shortformHead?.label ?? ''}")`,
    failures,
  );

  const adjacentHead = await phone.evaluate(() => {
    const el = document.querySelector('.er-desk-section-head--adjacent');
    if (!el) return null;
    const label = el.querySelector('.er-desk-section-head-label')?.textContent ?? '';
    return { present: true, label: label.trim() };
  });
  assert(
    adjacentHead?.present === true && adjacentHead?.label.startsWith('Adjacent'),
    `Adjacent-tools section head present (label="${adjacentHead?.label ?? ''}")`,
    failures,
  );

  // The three section markers in document order: zero longform marker +
  // shortform + adjacent. Verify the shortform head comes BEFORE the
  // adjacent head (per DASHBOARD spec — shortform is section 2, adjacent
  // is section 3).
  const headOrder = await phone.evaluate(() => {
    const shortform = document.querySelector('.er-desk-section-head--shortform');
    const adjacent = document.querySelector('.er-desk-section-head--adjacent');
    if (!shortform || !adjacent) return null;
    // Element.compareDocumentPosition returns DOCUMENT_POSITION_FOLLOWING (4)
    // when shortform precedes adjacent.
    return (shortform.compareDocumentPosition(adjacent) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  assert(
    headOrder === true,
    `Section order: Shortform precedes Adjacent in document order`,
    failures,
  );

  // -- § Longform pipeline · 8 stage tiles --
  // Each longform stage tile carries `data-stage-section-group="longform"`
  // (per section.ts renderStageTile) so stage-tiles.ts can partition the
  // single-expand state. The Distribution placeholder also carries
  // group="longform" but is filtered out by checking against the known
  // canonical stage names.
  const longformTileCount = await phone.evaluate((stageList) => {
    const tiles = Array.from(
      document.querySelectorAll('[data-stage-tile][data-stage-section-group="longform"]'),
    );
    let count = 0;
    for (const tile of tiles) {
      const stage = tile.getAttribute('data-stage-tile');
      if (stageList.includes(stage)) count++;
    }
    return count;
  }, LONGFORM_STAGES);
  assert(
    longformTileCount === 8,
    `Longform pipeline renders 8 stage tiles (got ${longformTileCount}; expected exactly 8: Ideas/Planned/Outlining/Drafting/Final/Published/Blocked/Cancelled)`,
    failures,
  );

  // -- § Shortform · by platform · 4 platform tiles --
  // Even with zero workflows, all four tiles render per § Empty-state
  // rendering ("the absence of items is information about the pipeline
  // shape").
  const shortformTileCount = await phone.evaluate(() => {
    return document.querySelectorAll('[data-stage-section-group="shortform"]').length;
  });
  assert(
    shortformTileCount === 4,
    `Shortform section renders 4 platform tiles (got ${shortformTileCount}; expected exactly 4: LinkedIn/Reddit/YouTube/Instagram)`,
    failures,
  );

  // Each platform tile renders in the expected order with a colored badge.
  const platformTileShape = await phone.evaluate((platforms) => {
    const out = [];
    for (const platform of platforms) {
      const tile = document.querySelector(`[data-stage-tile="shortform-${platform}"]`);
      if (!tile) {
        out.push({ platform, present: false });
        continue;
      }
      const badge = tile.querySelector('.er-platform-badge');
      const badgeText = badge?.textContent?.trim() ?? '';
      const countNum = tile.querySelector('.er-stage-tile-count .num')?.textContent?.trim() ?? '';
      const isEmpty = tile.classList.contains('is-empty');
      const cs = getComputedStyle(tile);
      const chev = tile.querySelector('.er-stage-tile-chev');
      const chevCs = chev ? getComputedStyle(chev) : null;
      const disabled = tile.hasAttribute('disabled');
      const rect = tile.getBoundingClientRect();
      out.push({
        platform,
        present: true,
        badgeText,
        countNum,
        isEmpty,
        disabled,
        opacity: cs.opacity,
        chevVisibility: chevCs?.visibility ?? null,
        visible: rect.width > 0 && rect.height > 0,
      });
    }
    return out;
  }, SHORTFORM_PLATFORMS);

  // Each platform tile present + visible
  const allFourPresent = platformTileShape.length === 4 && platformTileShape.every((t) => t.present === true);
  assert(
    allFourPresent,
    `All four platform tiles present (LinkedIn/Reddit/YouTube/Instagram) — got ${platformTileShape.map((t) => t.platform + (t.present ? '✓' : '✗')).join(' ')}`,
    failures,
  );

  // Badge text matches per-platform spec (badge replaces glyph slot)
  if (allFourPresent) {
    const expectedBadges = { linkedin: 'in', reddit: 'r/', youtube: '@', instagram: 'IG' };
    for (const tile of platformTileShape) {
      const expected = expectedBadges[tile.platform];
      assert(
        tile.badgeText === expected,
        `${tile.platform} badge text "${tile.badgeText}" === "${expected}"`,
        failures,
      );
      assert(
        tile.visible === true,
        `${tile.platform} tile visible (bounding rect width × height > 0)`,
        failures,
      );
    }

    // Per § Empty-state rendering: empty tiles use muted palette, NOT
    // opacity. Empty tiles MUST have opacity === '1' AND chevron
    // visibility === 'hidden'.
    for (const tile of platformTileShape) {
      if (tile.isEmpty) {
        assert(
          tile.opacity === '1',
          `${tile.platform} (empty) opacity === '1' per § Empty-state rendering (got ${tile.opacity}) — empty tiles use muted palette, NOT opacity reduction`,
          failures,
        );
        assert(
          tile.chevVisibility === 'hidden',
          `${tile.platform} (empty) chevron visibility === 'hidden' (got ${tile.chevVisibility})`,
          failures,
        );
        assert(
          tile.disabled === true,
          `${tile.platform} (empty) tile carries disabled attr (got disabled=${tile.disabled})`,
          failures,
        );
      }
    }
  }

  // -- § Adjacent tools · 2 future tiles (Folio + Files) --
  const adjacentTiles = await phone.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.er-future-tile'));
    return tiles.map((t) => ({
      ariaDisabled: t.getAttribute('aria-disabled'),
      tag: t.querySelector('.er-future-tile-name')?.tagName.toLowerCase() ?? null,
      name: t.querySelector('.er-future-tile-name')?.textContent?.trim() ?? '',
      isButton: t.tagName.toLowerCase() === 'button',
    }));
  });
  assert(
    adjacentTiles.length === 2,
    `Adjacent-tools section renders 2 future tiles (got ${adjacentTiles.length}; expected Folio + Files)`,
    failures,
  );
  if (adjacentTiles.length === 2) {
    for (const tile of adjacentTiles) {
      assert(
        tile.ariaDisabled === 'true',
        `Adjacent tile "${tile.name}" has aria-disabled="true" (got ${tile.ariaDisabled})`,
        failures,
      );
      assert(
        tile.isButton === false,
        `Adjacent tile "${tile.name}" is NOT a <button> — inert <div> per spec (got tag <${tile.tag}>)`,
        failures,
      );
    }
  }

  // -- Independent single-expand across sections --
  // Find a non-empty longform stage tile + a non-empty shortform platform
  // tile. Expand each. Then expand a second longform stage; assert it
  // collapses the first longform but leaves the shortform untouched.
  const expandTargets = await phone.evaluate((stageList) => {
    function pick(groupName, exclude) {
      const sel = `[data-stage-tile][data-stage-section-group="${groupName}"]`;
      const tiles = Array.from(document.querySelectorAll(sel));
      for (const tile of tiles) {
        if (tile.disabled) continue;
        const id = tile.getAttribute('data-stage-tile');
        // Filter out the Distribution placeholder (group=longform but not a
        // canonical stage) when picking longform targets.
        if (groupName === 'longform' && !stageList.includes(id)) continue;
        if (exclude.includes(id)) continue;
        return id;
      }
      return null;
    }
    const firstLongform = pick('longform', []);
    const secondLongform = firstLongform ? pick('longform', [firstLongform]) : null;
    const firstShortform = pick('shortform', []);
    return { firstLongform, secondLongform, firstShortform };
  }, LONGFORM_STAGES);

  if (!expandTargets.firstLongform || !expandTargets.secondLongform) {
    console.log('  [skip] independent single-expand: <2 non-empty longform tiles');
  } else if (!expandTargets.firstShortform) {
    console.log('  [skip] independent single-expand: 0 non-empty shortform tiles');
  } else {
    // Expand longform.firstNonEmpty
    await phone.click(`[data-stage-tile="${expandTargets.firstLongform}"]`);
    await phone.waitForTimeout(150);
    // Expand shortform.firstNonEmpty
    await phone.click(`[data-stage-tile="${expandTargets.firstShortform}"]`);
    await phone.waitForTimeout(150);

    const bothExpanded = await phone.evaluate(({ longform, shortform }) => {
      const lf = document.querySelector(`[data-stage-section="${longform}"]`);
      const sf = document.querySelector(`[data-stage-section="${shortform}"]`);
      return {
        longformCollapsed: lf?.hasAttribute('data-collapsed') ?? null,
        shortformCollapsed: sf?.hasAttribute('data-collapsed') ?? null,
      };
    }, { longform: expandTargets.firstLongform, shortform: expandTargets.firstShortform });
    assert(
      bothExpanded.longformCollapsed === false && bothExpanded.shortformCollapsed === false,
      `Both sections expand simultaneously across groups (longform-collapsed=${bothExpanded.longformCollapsed}, shortform-collapsed=${bothExpanded.shortformCollapsed})`,
      failures,
    );

    // Expand longform.second — should collapse longform.first but leave
    // shortform.first expanded.
    await phone.click(`[data-stage-tile="${expandTargets.secondLongform}"]`);
    await phone.waitForTimeout(150);

    const partitionedState = await phone.evaluate(({ first, second, shortform }) => {
      const lf1 = document.querySelector(`[data-stage-section="${first}"]`);
      const lf2 = document.querySelector(`[data-stage-section="${second}"]`);
      const sf = document.querySelector(`[data-stage-section="${shortform}"]`);
      return {
        firstLongformCollapsed: lf1?.hasAttribute('data-collapsed') ?? null,
        secondLongformCollapsed: lf2?.hasAttribute('data-collapsed') ?? null,
        shortformCollapsed: sf?.hasAttribute('data-collapsed') ?? null,
      };
    }, {
      first: expandTargets.firstLongform,
      second: expandTargets.secondLongform,
      shortform: expandTargets.firstShortform,
    });
    assert(
      partitionedState.firstLongformCollapsed === true,
      `Expanding ${expandTargets.secondLongform} collapses ${expandTargets.firstLongform} (within-section single-expand)`,
      failures,
    );
    assert(
      partitionedState.secondLongformCollapsed === false,
      `${expandTargets.secondLongform} is now expanded`,
      failures,
    );
    assert(
      partitionedState.shortformCollapsed === false,
      `${expandTargets.firstShortform} remains expanded (cross-section independence: shortform untouched by longform single-expand)`,
      failures,
    );
  }

  // -- Compose FAB visible on phone --
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

  // -- No horizontal scroll --
  const phoneOverflow = await phone.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    phoneOverflow.scrollWidth === phoneOverflow.innerWidth,
    `No horizontal overflow at 390x844 (scrollWidth=${phoneOverflow.scrollWidth}, innerWidth=${phoneOverflow.innerWidth})`,
    failures,
  );

  // ============== DESKTOP VIEWPORT ==============
  console.log('');
  console.log('desktop (1280x800)');
  const desktop = await newPage(browser, { width: 1280, height: 800 });
  await desktop.goto(url, { waitUntil: 'load' });
  await desktop.waitForSelector('[data-stage-section]', { timeout: 5000 });

  // Mobile masthead must be display:none on desktop.
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

  await browser.close();

  summarizeResults(failures, 'mobile desk probe');
}

main().catch((err) => {
  console.error('probe error:', err);
  process.exit(2);
});
