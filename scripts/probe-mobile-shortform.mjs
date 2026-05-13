#!/usr/bin/env node
/**
 * Interactive verification probe for the mobile shortform review surface.
 *
 * Drives Playwright Chromium at a phone viewport (390x844) against the
 * running dev studio, navigates to `/dev/editorial-review/<workflow-id>`
 * for an open shortform workflow, and asserts:
 *
 *   1. Universal masthead chrome present (back-link + ⋮ menu glyph)
 *   2. Universal mobile bar present
 *   3. Bar cells composed correctly: at least 1 (Actions); at most 3
 *      (TOC + Versions + Actions)
 *   4. Actions cell exists (data-mobile-sheet="actions")
 *   5. Tapping Actions opens #er-mobile-sheet (hidden attribute clears)
 *   6. Open Actions sheet contains three buttons:
 *      data-action="approve" + data-action="iterate" + data-action="cancel"
 *      (NOT data-action="reject" — G.4 / issue #260)
 *   7. No .er-stamp markup anywhere (Commandment III)
 *   8. No .er-pending-state markup (review-state pills retired)
 *   9. No horizontal scroll at phone viewport
 *
 * Also re-checks at desktop (1280x800) that the universal mobile chrome
 * is hidden:
 *
 *   10. .er-mobile-bar is display:none
 *   11. .er-masthead is display:none
 *
 * Usage:
 *   node scripts/probe-mobile-shortform.mjs [--workflow-id UUID] [--studio-url URL]
 *
 * When --workflow-id is omitted the probe attempts to auto-discover an
 * open shortform workflow via the studio's HTML index at
 * `/dev/editorial-review-shortform`. If no shortform workflow exists
 * in the project, the probe exits with code 2 and a diagnostic message
 * — there is no synthetic-workflow fallback (per the agent-discipline
 * "no fallbacks" rule; the absence is real data, not a hole to paper
 * over).
 *
 * Exit codes:
 *   0  all assertions passed
 *   1  one or more assertions failed
 *   2  setup error (no studio reachable, no shortform workflow found, etc.)
 */

import { ping, assert, launchBrowser, newPage, parseProbeArgs, summarizeResults } from './lib/mobile-probe-helpers.mjs';

const { studioUrl: argStudio, workflowId: argWorkflowId } = parseProbeArgs(process.argv.slice(2));

/**
 * Discover an open shortform workflow id by parsing the studio's
 * shortform desk index. Returns the first `data-workflow-id` attribute
 * found on the page, or null if there are no open shortform workflows.
 */
async function discoverShortformWorkflow(studioUrl) {
  const res = await fetch(`${studioUrl}/dev/editorial-review-shortform`);
  if (!res.ok) {
    throw new Error(`shortform desk index returned ${res.status}`);
  }
  const html = await res.text();
  const match = html.match(/data-workflow-id="([^"]+)"/);
  return match ? match[1] : null;
}

async function main() {
  const failures = [];

  if (!(await ping(argStudio + '/dev/'))) {
    console.error(`no dev studio at ${argStudio}; start it with \`npm run dev\``);
    process.exit(2);
  }

  let workflowId = argWorkflowId;
  if (!workflowId) {
    try {
      workflowId = await discoverShortformWorkflow(argStudio);
    } catch (err) {
      console.error(`shortform discovery failed: ${err.message}`);
      process.exit(2);
    }
  }
  if (!workflowId) {
    console.error('no open shortform workflow found in this project.');
    console.error('Re-run with --workflow-id <uuid> to target a specific workflow,');
    console.error('or seed the project with a shortform workflow first.');
    process.exit(2);
  }

  console.log(`mobile shortform probe`);
  console.log(`  studio:    ${argStudio}`);
  console.log(`  workflow:  ${workflowId}`);
  console.log('');

  const browser = await launchBrowser();
  const url = `${argStudio}/dev/editorial-review/${workflowId}`;

  // ============== PHONE VIEWPORT ==============
  console.log('phone (390x844)');
  const phone = await newPage(browser, { width: 390, height: 844 });
  const response = await phone.goto(url, { waitUntil: 'load' });
  assert(
    response !== null && response.status() === 200,
    `Page loads at ${url} (status 200)`,
    failures,
  );

  await phone.waitForSelector('[data-er-masthead]', { timeout: 5000 });

  // 1. Universal masthead chrome present
  const mastheadPresent = await phone.evaluate(() => {
    const el = document.querySelector('[data-er-masthead]');
    return el !== null && getComputedStyle(el).display !== 'none';
  });
  assert(mastheadPresent, 'Universal masthead [data-er-masthead] visible on phone', failures);

  const backLinkPresent = await phone.evaluate(() => {
    const el = document.querySelector('.er-masthead-back');
    return el !== null && getComputedStyle(el).display !== 'none';
  });
  assert(backLinkPresent, 'Back-link .er-masthead-back present (non-Desk surface)', failures);

  const menuGlyphPresent = await phone.evaluate(() => {
    const el = document.querySelector('[data-er-masthead-menu]');
    return el !== null && getComputedStyle(el).display !== 'none';
  });
  assert(menuGlyphPresent, '⋮ menu glyph [data-er-masthead-menu] present', failures);

  // 2. Universal mobile bar present
  const barPresent = await phone.evaluate(() => {
    const el = document.querySelector('[data-mobile-bar]');
    return el !== null && getComputedStyle(el).display !== 'none';
  });
  assert(barPresent, 'Universal mobile bar [data-mobile-bar] visible on phone', failures);

  // 3. Bar cells composed correctly (1-3 cells)
  const cellCount = await phone.evaluate(() => {
    return document.querySelectorAll('[data-mobile-bar] .er-mobile-tab').length;
  });
  assert(
    cellCount >= 1 && cellCount <= 3,
    `Bar carries 1-3 cells (got ${cellCount})`,
    failures,
  );

  // 4. Actions cell exists
  const actionsCellPresent = await phone.evaluate(() => {
    return document.querySelector('[data-mobile-sheet="actions"]') !== null;
  });
  assert(
    actionsCellPresent,
    'Actions cell [data-mobile-sheet="actions"] present in bar',
    failures,
  );

  // 5. Tapping Actions opens the sheet
  await phone.click('[data-mobile-sheet="actions"]', { force: true });
  await phone.waitForFunction(
    () => {
      const slot = document.querySelector('[data-mobile-sheet-slot="actions"]');
      return slot !== null && !slot.hasAttribute('hidden');
    },
    null,
    { timeout: 3000 },
  );
  const sheetOpened = await phone.evaluate(() => {
    const slot = document.querySelector('[data-mobile-sheet-slot="actions"]');
    return slot !== null && !slot.hasAttribute('hidden');
  });
  assert(sheetOpened, 'Tapping Actions opens [data-mobile-sheet-slot="actions"] slot', failures);

  // 6. Open Actions sheet contains the three universal verb buttons
  const approveBtn = await phone.evaluate(() => {
    return document.querySelector('[data-mobile-sheet-slot="actions"] [data-action="approve"]') !== null;
  });
  assert(approveBtn, 'Actions slot carries data-action="approve" button', failures);

  const iterateBtn = await phone.evaluate(() => {
    return document.querySelector('[data-mobile-sheet-slot="actions"] [data-action="iterate"]') !== null;
  });
  assert(iterateBtn, 'Actions slot carries data-action="iterate" button', failures);

  const cancelBtn = await phone.evaluate(() => {
    return document.querySelector('[data-mobile-sheet-slot="actions"] [data-action="cancel"]') !== null;
  });
  assert(cancelBtn, 'Actions slot carries data-action="cancel" button (G.4)', failures);

  const rejectBtnAbsent = await phone.evaluate(() => {
    return document.querySelector('[data-mobile-sheet-slot="actions"] [data-action="reject"]') === null;
  });
  assert(rejectBtnAbsent, 'Actions slot does NOT carry data-action="reject" (G.4 / #260)', failures);

  // 7. No .er-stamp markup anywhere (Commandment III)
  const stampCount = await phone.evaluate(() => {
    return document.querySelectorAll('.er-stamp').length;
  });
  assert(stampCount === 0, `No .er-stamp elements (Commandment III; got ${stampCount})`, failures);

  // 8. No .er-pending-state markup (review-state pills retired)
  const pendingCount = await phone.evaluate(() => {
    return document.querySelectorAll('.er-pending-state').length;
  });
  assert(
    pendingCount === 0,
    `No .er-pending-state elements (review-state retired; got ${pendingCount})`,
    failures,
  );

  // 9. No horizontal scroll
  const noHScroll = await phone.evaluate(() => {
    return document.documentElement.scrollWidth <= window.innerWidth;
  });
  assert(noHScroll, 'No horizontal page scroll at 390×844', failures);

  // ============== DESKTOP VIEWPORT ==============
  console.log('');
  console.log('desktop (1280x800)');
  const desktop = await newPage(browser, { width: 1280, height: 800 });
  await desktop.goto(url, { waitUntil: 'load' });

  // 10. Mobile bar is display:none on desktop
  const desktopBar = await desktop.evaluate(() => {
    const el = document.querySelector('[data-mobile-bar]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    desktopBar === 'none',
    `Mobile bar display:none on desktop (got ${desktopBar})`,
    failures,
  );

  // 11. Mobile masthead is display:none on desktop
  const desktopMasthead = await desktop.evaluate(() => {
    const el = document.querySelector('[data-er-masthead]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    desktopMasthead === 'none',
    `Mobile masthead display:none on desktop (got ${desktopMasthead})`,
    failures,
  );

  await browser.close();

  summarizeResults(failures, 'mobile shortform probe');
}

main().catch((err) => {
  console.error('probe error:', err);
  process.exit(2);
});
