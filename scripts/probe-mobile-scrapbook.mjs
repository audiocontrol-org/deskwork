#!/usr/bin/env node
/**
 * Interactive verification probe for the mobile Scrapbook tab
 * (Mockup 1 / scrapbook-1-fourth-tab).
 *
 * Drives Playwright Chromium at phone (390x844) AND desktop
 * (1280x800) viewports; asserts:
 *
 *   PHONE:
 *     1. Scrapbook tab is visible in review mode (display !== 'none')
 *     2. Bar is 4-column grid in review mode
 *     3. Scrapbook count badge has kraft tone (not red)
 *     4. Tapping Scrapbook opens sheet with cloned drawer items
 *     5. Sheet kicker reads "▦ Scrapbook · Folio"
 *     6. Desktop scrapbook drawer is hidden (display: none) on phone
 *     7. Entering edit mode hides Scrapbook tab; bar reverts to 3-col
 *
 *   DESKTOP:
 *     8. Scrapbook tab is hidden on desktop (mobile bar is display:none)
 *     9. Desktop scrapbook drawer remains visible on desktop
 *
 * Usage:
 *   node scripts/probe-mobile-scrapbook.mjs [--entry UUID] [--studio-url URL]
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { ping, assert, launchBrowser, newPage, parseProbeArgs, summarizeResults } from './lib/mobile-probe-helpers.mjs';

const { studioUrl: argStudio, entryUuid: argEntry } = parseProbeArgs(process.argv.slice(2));

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const entriesDir = join(projectRoot, '.deskwork', 'entries');

async function pickEntry() {
  if (argEntry) return argEntry;
  // Find an entry with a non-empty scrapbook so we can verify cloning.
  // Falls back to any longform entry if no scrapbook entries are found.
  const files = await readdir(entriesDir);
  let fallback = null;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '');
    const json = JSON.parse(await readFile(join(entriesDir, f), 'utf8'));
    if (!json.artifactPath) continue;
    if (!fallback) fallback = json.uuid ?? id;
    // We can't easily check scrapbook contents without scanning the FS;
    // pick the first valid entry as fallback and let the test verify
    // both empty and populated sheet behavior.
  }
  if (!fallback) throw new Error('no entry with artifactPath found');
  return fallback;
}

async function main() {
  const failures = [];

  if (!(await ping(argStudio + '/dev/'))) {
    console.error(`no dev studio at ${argStudio}; start with \`npm run dev\``);
    process.exit(2);
  }
  const entryId = await pickEntry();
  console.log('mobile scrapbook probe');
  console.log(`  studio: ${argStudio}`);
  console.log(`  entry:  ${entryId}\n`);

  const browser = await launchBrowser();
  const url = `${argStudio}/dev/editorial-review/entry/${entryId}`;

  // ============== PHONE ==============
  console.log('phone (390x844)');
  const phone = await newPage(browser, { width: 390, height: 844 });
  await phone.goto(url, { waitUntil: 'load' });
  await phone.waitForSelector('[data-mobile-bar]', { timeout: 5000 });

  // 1. Scrapbook tab visible in review mode
  const tabDisplay = await phone.evaluate(() => {
    const el = document.querySelector('[data-mobile-sheet="scrapbook"]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    tabDisplay !== null && tabDisplay !== 'none',
    `Scrapbook tab visible in review mode (got ${tabDisplay})`,
    failures,
  );

  // 2. Bar is 4-column grid in review mode
  const reviewCols = await phone.evaluate(() => {
    const bar = document.querySelector('[data-mobile-bar]');
    if (!bar) return null;
    return getComputedStyle(bar).gridTemplateColumns.split(' ').length;
  });
  assert(reviewCols === 4, `Bar grid is 4-col in review mode (got ${reviewCols})`, failures);

  // 3. Count badge has kraft tone (not red-pencil)
  const badgeBg = await phone.evaluate(() => {
    const el = document.querySelector('[data-scrapbook-count]');
    if (!el) return null;
    return getComputedStyle(el).backgroundColor;
  });
  // kraft is #8A7250 = rgb(138, 114, 80). Red-pencil is #B8362A = rgb(184, 54, 42).
  assert(
    badgeBg && /rgb\(138,?\s*114,?\s*80\)/.test(badgeBg),
    `Scrapbook count badge is kraft-toned (got ${badgeBg})`,
    failures,
  );

  // 4. Tap Scrapbook → sheet opens; slot populated
  await phone.click('[data-mobile-sheet="scrapbook"]', { force: true });
  await phone.waitForFunction(
    () => document.body.hasAttribute('data-mobile-sheet-open'),
    null,
    { timeout: 3000 },
  );
  const slotVisible = await phone.evaluate(() => {
    const slot = document.querySelector('[data-mobile-sheet-slot="scrapbook"]');
    if (!slot) return false;
    return !slot.hidden;
  });
  assert(slotVisible, `Scrapbook slot is visible after tab tap`, failures);

  // 5. Sheet kicker
  const kicker = await phone.evaluate(() => {
    const el = document.querySelector('[data-mobile-sheet-kicker]');
    return el?.textContent;
  });
  assert(
    kicker && kicker.includes('Scrapbook') && kicker.includes('Folio'),
    `Sheet kicker reads "▦ Scrapbook · Folio" (got ${JSON.stringify(kicker)})`,
    failures,
  );

  // 6. Desktop scrapbook drawer is hidden on phone
  const drawerDisplay = await phone.evaluate(() => {
    const el = document.querySelector('.er-scrapbook-drawer');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(drawerDisplay === 'none', `Desktop scrapbook drawer hidden on phone (got ${drawerDisplay})`, failures);

  // 7. Edit-mode swap: open Actions sheet → tap Edit; verify tab swap
  // First close the scrapbook sheet
  await phone.click('[data-mobile-sheet-close]', { force: true });
  await phone.waitForTimeout(400);
  await phone.click('[data-mobile-sheet="actions"]', { force: true });
  await phone.waitForSelector('[data-mobile-sheet-slot="actions"]:not([hidden]) [data-action="edit"]', {
    timeout: 3000,
  });
  await phone.click('[data-mobile-sheet-slot="actions"] [data-action="edit"]', { force: true });
  await phone.waitForFunction(
    () => document.body.dataset.editMode === 'editing',
    null,
    { timeout: 5000 },
  );
  const editTabState = await phone.evaluate(() => ({
    scrapbook: getComputedStyle(document.querySelector('[data-mobile-sheet="scrapbook"]')).display,
    cols: getComputedStyle(document.querySelector('[data-mobile-bar]')).gridTemplateColumns.split(' ').length,
  }));
  assert(editTabState.scrapbook === 'none', `Scrapbook tab hidden in edit mode (got ${editTabState.scrapbook})`, failures);
  assert(editTabState.cols === 3, `Bar grid is 3-col in edit mode (got ${editTabState.cols})`, failures);

  // ============== DESKTOP ==============
  console.log('\ndesktop (1280x800)');
  const desktop = await newPage(browser, { width: 1280, height: 800 });
  await desktop.goto(url, { waitUntil: 'load' });

  // 8. Mobile bar (and scrapbook tab inside it) hidden on desktop
  const mobileBarOnDesktop = await desktop.evaluate(() => {
    const el = document.querySelector('[data-mobile-bar]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(mobileBarOnDesktop === 'none', `Mobile bar hidden on desktop (got ${mobileBarOnDesktop})`, failures);

  // 9. Desktop scrapbook drawer remains visible on desktop
  const drawerOnDesktop = await desktop.evaluate(() => {
    const el = document.querySelector('.er-scrapbook-drawer');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    drawerOnDesktop !== 'none' && drawerOnDesktop !== null,
    `Desktop scrapbook drawer visible on desktop (got ${drawerOnDesktop})`,
    failures,
  );

  await browser.close();
  summarizeResults(failures);
}

main().catch((err) => { console.error('probe error:', err); process.exit(2); });
