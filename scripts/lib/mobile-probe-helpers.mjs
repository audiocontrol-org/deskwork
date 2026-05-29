#!/usr/bin/env node
/**
 * Shared helpers for the mobile-shell Playwright probes.
 *
 * Extracted from probe-mobile-{editor,scrapbook,dashboard}.mjs per the
 * 2026-05-12 mobile-shell audit (Task 2.1.3). The three probes had
 * identical inline definitions of ping(), assert(), the chromium boot
 * sequence, and CLI arg parsing.
 *
 * Named exports only — no default export.
 */

import { chromium } from 'playwright';

/**
 * Fetch-based health check.
 * Returns true if the URL responds with a 2xx status or a 302 redirect.
 * Returns false on network error or any other status.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function ping(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok || res.status === 302;
  } catch {
    return false;
  }
}

/**
 * Boolean assertion that logs PASS/FAIL and pushes to a failures array.
 *
 * @param {boolean} cond
 * @param {string} label
 * @param {string[]} failures  Mutated in-place on failure.
 */
export function assert(cond, label, failures) {
  if (cond) {
    console.log(`  [pass] ${label}`);
  } else {
    console.log(`  [FAIL] ${label}`);
    failures.push(label);
  }
}

/**
 * Launch a Chromium browser instance.
 * Callers are responsible for closing it via browser.close().
 *
 * @returns {Promise<import('playwright').Browser>}
 */
export async function launchBrowser() {
  return chromium.launch();
}

/**
 * Create a new browser context + page for the given viewport.
 * Returns the page; the context is accessible via page.context().
 *
 * @param {import('playwright').Browser} browser
 * @param {{ width: number, height: number }} viewport
 * @returns {Promise<import('playwright').Page>}
 */
export async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  return ctx.newPage();
}

/**
 * Parse CLI arguments for the mobile probes.
 *
 * Recognised flags (each accepts both `--flag value` and `--flag=value` forms):
 *   --studio-url <url>     Override the studio base URL (default: $STUDIO_URL or http://localhost:47323)
 *   --entry <uuid>         Pin a specific entry UUID (entry-keyed probes auto-pick if omitted)
 *   --workflow-id <uuid>   Pin a specific workflow UUID (workflow-keyed probes; e.g. shortform review)
 *
 * @param {string[]} argv  Typically process.argv.slice(2)
 * @returns {{ studioUrl: string, entryUuid: string | null, workflowId: string | null }}
 */
export function parseProbeArgs(argv) {
  let studioUrl = process.env.STUDIO_URL ?? 'http://localhost:47323';
  let entryUuid = null;
  let workflowId = null;

  function readValue(arg, flag, nextArg) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx >= 0 && arg.slice(0, eqIdx) === flag) {
      return { value: arg.slice(eqIdx + 1), consumedNext: false };
    }
    if (arg === flag && typeof nextArg === 'string') {
      return { value: nextArg, consumedNext: true };
    }
    return null;
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const studioMatch = readValue(a, '--studio-url', argv[i + 1]);
    if (studioMatch) {
      studioUrl = studioMatch.value;
      if (studioMatch.consumedNext) i++;
      continue;
    }
    const entryMatch = readValue(a, '--entry', argv[i + 1]);
    if (entryMatch) {
      entryUuid = entryMatch.value;
      if (entryMatch.consumedNext) i++;
      continue;
    }
    const workflowMatch = readValue(a, '--workflow-id', argv[i + 1]);
    if (workflowMatch) {
      workflowId = workflowMatch.value;
      if (workflowMatch.consumedNext) i++;
      continue;
    }
  }

  return { studioUrl, entryUuid, workflowId };
}

/**
 * Print a summary line and exit with 0 (all pass) or 1 (failures found).
 *
 * @param {string[]} failures  Array of failure labels collected during the probe run.
 * @param {string} label       Human-readable probe name for the summary line (optional).
 */
export function summarizeResults(failures, label) {
  if (!Array.isArray(failures)) {
    throw new TypeError('summarizeResults: failures must be an array');
  }
  if (label) {
    console.log('');
    console.log(`${label}: ${failures.length} failure(s)`);
  } else {
    console.log('');
    console.log(`${failures.length} failure(s)`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

/**
 * Assert that the universal masthead chrome is present on the page,
 * matching the v7 star-navigation model defined in
 * `DESIGN-STANDARDS.md § Studio navigation model`.
 *
 *   - `[data-er-masthead]` element is present + visible
 *   - On leaf surfaces (`isHub === false`): `.er-masthead-back` (`←`) is
 *     present + visible.
 *   - On the Desk (`isHub === true`): the back-link is SUPPRESSED — zero
 *     `.er-masthead-back` elements in the DOM. *"Absent only on the Desk
 *     itself (you're already home)"* per § Studio navigation model.
 *   - `[data-er-masthead-menu]` (`⋮`) is present + visible on every
 *     surface, including the Desk.
 *
 * @param {import('playwright').Page} page   Playwright page already navigated.
 * @param {boolean} isHub                    True for the Desk; false for every leaf.
 * @param {string[]} failures                Failures accumulator (mutated).
 */
export async function assertMastheadChrome(page, isHub, failures) {
  const mastheadPresent = await page.evaluate(() => {
    const el = document.querySelector('[data-er-masthead]');
    return el !== null && getComputedStyle(el).display !== 'none';
  });
  assert(mastheadPresent, 'Universal masthead [data-er-masthead] visible on phone', failures);

  if (isHub) {
    const backLinkAbsent = await page.evaluate(() => {
      return document.querySelectorAll('.er-masthead-back').length === 0;
    });
    assert(
      backLinkAbsent,
      'Back-link .er-masthead-back ABSENT on Desk (isHub=true; you are already home)',
      failures,
    );
  } else {
    const backLinkPresent = await page.evaluate(() => {
      const el = document.querySelector('.er-masthead-back');
      return el !== null && getComputedStyle(el).display !== 'none';
    });
    assert(
      backLinkPresent,
      'Back-link .er-masthead-back present + visible on leaf surface',
      failures,
    );
  }

  const menuGlyphPresent = await page.evaluate(() => {
    const el = document.querySelector('[data-er-masthead-menu]');
    return el !== null && getComputedStyle(el).display !== 'none';
  });
  assert(menuGlyphPresent, '⋮ menu glyph [data-er-masthead-menu] present + visible', failures);
}

/**
 * Drive a full open → assert-visible → dismiss-by-scrim → assert-closed
 * cycle on the masthead `⋮` popover.
 *
 * Asserts (per `DESIGN-STANDARDS.md § Menu reveal pattern · popover, not
 * slide-up sheet` and the controller contract in
 * `plugins/deskwork-studio/public/src/mobile-shell/masthead-popover.ts`):
 *
 *   - Initial state: popover is hidden (the popover element exists in
 *     the DOM but `hidden` attribute is set).
 *   - Trigger `aria-expanded` is `"false"` at-rest.
 *   - Tapping `[data-er-masthead-menu]` un-hides the popover + scrim
 *     and sets `aria-expanded="true"` on the trigger.
 *   - Tapping the scrim (`[data-er-masthead-popover-scrim]`) re-hides
 *     the popover + scrim and returns `aria-expanded` to `"false"`.
 *
 * The popover does NOT use the Phase 2.1 `createSlideUpSheet` primitive
 * — top-anchored affordance reveals downward; bottom-anchored
 * affordances reveal upward. Mixing reveal directions is the v6→v7
 * failure mode.
 *
 * @param {import('playwright').Page} page   Playwright page already navigated.
 * @param {string[]} failures                Failures accumulator (mutated).
 */
export async function assertMastheadMenuPopover(page, failures) {
  // Initial state: popover hidden, scrim hidden, trigger aria-expanded=false
  const initialState = await page.evaluate(() => {
    const trigger = document.querySelector('[data-er-masthead-menu]');
    const popover = document.querySelector('[data-er-masthead-popover]');
    const scrim = document.querySelector('[data-er-masthead-popover-scrim]');
    return {
      hasTrigger: trigger !== null,
      hasPopover: popover !== null,
      hasScrim: scrim !== null,
      ariaExpanded: trigger?.getAttribute('aria-expanded') ?? null,
      popoverHidden: popover?.hasAttribute('hidden') ?? null,
      scrimHidden: scrim?.hasAttribute('hidden') ?? null,
    };
  });
  assert(initialState.hasPopover, '[data-er-masthead-popover] element present in DOM', failures);
  assert(initialState.hasScrim, '[data-er-masthead-popover-scrim] element present in DOM', failures);
  assert(
    initialState.popoverHidden === true,
    `Popover hidden at-rest (got hidden=${initialState.popoverHidden})`,
    failures,
  );
  assert(
    initialState.scrimHidden === true,
    `Scrim hidden at-rest (got hidden=${initialState.scrimHidden})`,
    failures,
  );
  assert(
    initialState.ariaExpanded === 'false',
    `Trigger aria-expanded="false" at-rest (got ${initialState.ariaExpanded})`,
    failures,
  );

  // Tap ⋮ — popover + scrim become visible; aria-expanded flips to true
  await page.click('[data-er-masthead-menu]', { force: true });
  await page.waitForTimeout(100);
  const openState = await page.evaluate(() => {
    const trigger = document.querySelector('[data-er-masthead-menu]');
    const popover = document.querySelector('[data-er-masthead-popover]');
    const scrim = document.querySelector('[data-er-masthead-popover-scrim]');
    return {
      ariaExpanded: trigger?.getAttribute('aria-expanded') ?? null,
      popoverHidden: popover?.hasAttribute('hidden') ?? null,
      scrimHidden: scrim?.hasAttribute('hidden') ?? null,
    };
  });
  assert(
    openState.popoverHidden === false,
    `Popover un-hidden after ⋮ tap (got hidden=${openState.popoverHidden})`,
    failures,
  );
  assert(
    openState.scrimHidden === false,
    `Scrim un-hidden after ⋮ tap (got hidden=${openState.scrimHidden})`,
    failures,
  );
  assert(
    openState.ariaExpanded === 'true',
    `Trigger aria-expanded="true" after ⋮ tap (got ${openState.ariaExpanded})`,
    failures,
  );

  // Tap scrim — popover + scrim hide again; aria-expanded returns to false
  await page.click('[data-er-masthead-popover-scrim]', { force: true });
  await page.waitForTimeout(100);
  const closedState = await page.evaluate(() => {
    const trigger = document.querySelector('[data-er-masthead-menu]');
    const popover = document.querySelector('[data-er-masthead-popover]');
    const scrim = document.querySelector('[data-er-masthead-popover-scrim]');
    return {
      ariaExpanded: trigger?.getAttribute('aria-expanded') ?? null,
      popoverHidden: popover?.hasAttribute('hidden') ?? null,
      scrimHidden: scrim?.hasAttribute('hidden') ?? null,
    };
  });
  assert(
    closedState.popoverHidden === true,
    `Popover hidden after scrim tap (got hidden=${closedState.popoverHidden})`,
    failures,
  );
  assert(
    closedState.scrimHidden === true,
    `Scrim hidden after scrim tap (got hidden=${closedState.scrimHidden})`,
    failures,
  );
  assert(
    closedState.ariaExpanded === 'false',
    `Trigger aria-expanded="false" after scrim tap (got ${closedState.ariaExpanded})`,
    failures,
  );
}
