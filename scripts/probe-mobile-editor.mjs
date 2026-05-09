#!/usr/bin/env node
/**
 * Interactive verification probe for the mobile editor (Mockup 2 /
 * editor-2-press-check-tabbar).
 *
 * Drives Playwright Chromium at a phone viewport (390x844) against the
 * running dev studio, enters edit mode on a real entry, and asserts:
 *
 *   1. body[data-edit-mode="editing"] is set
 *   2. Mobile bar is visible; review-mode tabs (Outline, Actions) are
 *      display:none; edit-mode tabs (Format, Save) are visible
 *   3. Stamp computed-color matches stamp-green (#2E5D45 family)
 *   4. Source/Preview strip pill is visible
 *   5. Tapping Format tab opens the sheet with [data-fkey] keys
 *   6. Tapping a format key inserts text into the CodeMirror editor and
 *      closes the sheet; body[data-edit-dirty] is set
 *   7. Tapping Save tab triggers PUT /api/dev/editorial-review/entry/...
 *      and clears body[data-edit-dirty] on success
 *
 * Also re-checks at desktop (1280x800) that the new strip mode pill is
 * NOT visible (it's phone-only) and the edit-toolbar IS still visible.
 *
 * Usage:
 *   node scripts/probe-mobile-editor.mjs [--entry UUID] [--studio-url URL]
 *
 * Exit codes:
 *   0  all assertions passed
 *   1  one or more assertions failed
 *   2  setup error (no studio reachable, no entry found, etc.)
 */

import { chromium } from 'playwright';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ---- Args -----------------------------------------------------------------

let argEntry = null;
let argStudio = process.env.STUDIO_URL ?? 'http://localhost:47323';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--entry' && args[i + 1]) { argEntry = args[++i]; }
  else if (a === '--studio-url' && args[i + 1]) { argStudio = args[++i]; }
}

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const entriesDir = join(projectRoot, '.deskwork', 'entries');

async function pickEntry() {
  if (argEntry) return argEntry;
  const files = await readdir(entriesDir);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '');
    const json = JSON.parse(await readFile(join(entriesDir, f), 'utf8'));
    // Skip entries without an artifactPath — those won't render an editor.
    if (json.artifactPath) return json.uuid ?? id;
  }
  throw new Error('no entry with artifactPath found');
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
  const entryId = await pickEntry();
  console.log(`mobile editor probe`);
  console.log(`  studio: ${argStudio}`);
  console.log(`  entry:  ${entryId}`);
  console.log('');

  const browser = await chromium.launch();
  const url = `${argStudio}/dev/editorial-review/entry/${entryId}`;

  // ============== PHONE VIEWPORT ==============
  console.log('phone (390x844)');
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await phoneCtx.newPage();
  await phone.goto(url, { waitUntil: 'load' });
  await phone.waitForSelector('[data-mobile-bar]', { timeout: 5000 });

  // Enter edit mode the way an operator would on phone: open Actions
  // sheet → tap Edit (in the Document section).
  await phone.click('[data-mobile-sheet="actions"]', { force: true });
  await phone.waitForSelector('[data-mobile-sheet-slot="actions"]:not([hidden]) [data-action="edit"]', {
    timeout: 3000,
  });
  await phone.click('[data-mobile-sheet-slot="actions"] [data-action="edit"]', { force: true });
  await phone.waitForFunction(
    () => document.body.getAttribute('data-edit-mode') === 'editing',
    null,
    { timeout: 5000 },
  );

  // 1. body[data-edit-mode]
  assert(
    await phone.evaluate(() => document.body.dataset.editMode === 'editing'),
    'body[data-edit-mode="editing"] is set',
  );

  // 2. Tab visibility swap
  const tabState = await phone.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el).display;
    };
    return {
      outline: get('[data-mobile-sheet="outline"]'),
      format: get('[data-mobile-sheet="format"]'),
      notes: get('[data-mobile-sheet="notes"]'),
      actions: get('[data-mobile-sheet="actions"]'),
      save: get('[data-mobile-action="save"]'),
    };
  });
  assert(tabState.outline === 'none', `Outline tab hidden in edit mode (got ${tabState.outline})`);
  assert(tabState.actions === 'none', `Actions tab hidden in edit mode (got ${tabState.actions})`);
  assert(tabState.format !== 'none' && tabState.format !== null, `Format tab visible (got ${tabState.format})`);
  assert(tabState.save !== 'none' && tabState.save !== null, `Save tab visible (got ${tabState.save})`);
  assert(tabState.notes !== 'none' && tabState.notes !== null, `Notes tab visible in both modes (got ${tabState.notes})`);

  // 3. Stamp color
  const stampColor = await phone.evaluate(() => {
    const stamp = document.querySelector('[data-state-label]');
    if (!stamp) return null;
    return getComputedStyle(stamp).color;
  });
  // stamp-green = #2E5D45 = rgb(46, 93, 69)
  assert(
    stampColor && /rgb\(46,?\s*93,?\s*69\)/.test(stampColor),
    `Stamp color is stamp-green in edit mode (got ${stampColor})`,
  );

  // 4. Strip Source/Preview pill visible
  const stripPillDisplay = await phone.evaluate(() => {
    const el = document.querySelector('[data-strip-mode-mobile]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(
    stripPillDisplay && stripPillDisplay !== 'none',
    `Strip Source/Preview pill visible in edit mode (got ${stripPillDisplay})`,
  );

  // 5. Format sheet opens with [data-fkey] keys
  await phone.click('[data-mobile-sheet="format"]', { force: true });
  await phone.waitForSelector('[data-mobile-sheet-slot="format"]:not([hidden]) [data-fkey="bold"]', {
    timeout: 3000,
  });
  const fkeyCount = await phone.evaluate(() => {
    return document.querySelectorAll('[data-mobile-sheet-slot="format"] [data-fkey]').length;
  });
  assert(fkeyCount === 12, `Format slot renders 12 press-check keys (got ${fkeyCount})`);

  // 6. Tap Bold key — verify editor content changed + sheet closed + dirty set
  const beforeContent = await phone.evaluate(() => {
    const el = document.querySelector('[data-edit-source] .cm-content');
    return el?.textContent ?? '';
  });
  await phone.click('[data-fkey="bold"]', { force: true });
  // Sheet close has a 280ms slide; let it settle plus a frame.
  await phone.waitForTimeout(400);
  const afterContent = await phone.evaluate(() => {
    const el = document.querySelector('[data-edit-source] .cm-content');
    return el?.textContent ?? '';
  });
  assert(afterContent !== beforeContent, `Editor content changed after Bold tap`);
  assert(
    afterContent.includes('**bold**'),
    `Bold inserted '**bold**' placeholder (got tail: ${afterContent.slice(-30)})`,
  );
  const sheetOpenAfter = await phone.evaluate(() =>
    document.body.hasAttribute('data-mobile-sheet-open'),
  );
  assert(!sheetOpenAfter, `Sheet closes after format key tap`);
  const dirty = await phone.evaluate(() => document.body.hasAttribute('data-edit-dirty'));
  assert(dirty, `body[data-edit-dirty] set after edit`);

  // 7. Tap Save — verify dirty cleared
  // Watch for the PUT request as a separate signal
  let savePutSeen = false;
  phone.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/api/dev/editorial-review/entry/')) {
      savePutSeen = true;
    }
  });
  await phone.click('[data-mobile-action="save"]', { force: true });
  await phone.waitForTimeout(800);
  assert(savePutSeen, `PUT /api/dev/editorial-review/entry/.../body fired on Save tap`);
  const dirtyAfterSave = await phone.evaluate(() =>
    document.body.hasAttribute('data-edit-dirty'),
  );
  assert(!dirtyAfterSave, `body[data-edit-dirty] cleared after successful Save`);

  // 8. ✕ Done affordance is visible on phone in edit mode
  const doneVisible = await phone.evaluate(() => {
    const el = document.querySelector('[data-strip-edit-done]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return cs.display;
  });
  assert(
    doneVisible !== null && doneVisible !== 'none',
    `Strip ✕ Done button visible on phone in edit mode (got ${doneVisible})`,
  );

  // 9. Visibility-change auto-save: dirty buffer → hidden → save fires
  // Make a fresh edit, then simulate the page going hidden.
  await phone.evaluate(() => {
    // Simulate a small edit — directly dispatch into the editor view.
    // We reuse the format-keys path for a known-dirty mutation.
  });
  await phone.click('[data-mobile-sheet="format"]', { force: true });
  await phone.click('[data-fkey="bold"]', { force: true });
  await phone.waitForTimeout(300);
  const dirtyBeforeHide = await phone.evaluate(() =>
    document.body.hasAttribute('data-edit-dirty'),
  );
  assert(dirtyBeforeHide, `body[data-edit-dirty] set after second edit`);

  let visibilityPutSeen = false;
  phone.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/api/dev/editorial-review/entry/')) {
      visibilityPutSeen = true;
    }
  });
  // Trigger a synthetic visibilitychange to 'hidden' — Playwright doesn't
  // expose page.setVisibility, so we drive via the Chrome DevTools Protocol.
  const cdp = await phone.context().newCDPSession(phone);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await cdp.send('Page.bringToFront').catch(() => {});
  // Manual dispatch as fallback — visibilitychange listeners fire on the
  // synthetic event even when document.visibilityState isn't actually hidden.
  await phone.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await phone.waitForTimeout(800);
  assert(visibilityPutSeen, `PUT fires on visibilitychange when buffer is dirty`);

  // 10. ✕ Done click triggers exit (after the save settled, buffer is clean,
  // so toggle-edit exits without a discard prompt)
  // Restore visibility so click handlers fire normally.
  await phone.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await phone.waitForTimeout(300);
  // Click via evaluate — Playwright's visibility heuristic can get
  // confused after we've manipulated visibilityState above; the button
  // is rendered and the handler fires regardless.
  await phone.evaluate(() => {
    document.querySelector('[data-strip-edit-done]').click();
  });
  await phone.waitForFunction(
    () => !document.body.hasAttribute('data-edit-mode'),
    null,
    { timeout: 3000 },
  );
  assert(
    await phone.evaluate(() => !document.body.hasAttribute('data-edit-mode')),
    `Tapping ✕ Done exits edit mode (buffer clean, no confirm)`,
  );

  // ============== DESKTOP VIEWPORT ==============
  console.log('');
  console.log('desktop (1280x800)');
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktop = await desktopCtx.newPage();
  await desktop.goto(url, { waitUntil: 'load' });
  await desktop.click('[data-action="toggle-edit"]', { force: true });
  await desktop.waitForFunction(
    () => document.body.getAttribute('data-edit-mode') === 'editing',
    null,
    { timeout: 5000 },
  );

  // Strip pill must be display:none on desktop (phone-only).
  const desktopStripPill = await desktop.evaluate(() => {
    const el = document.querySelector('[data-strip-mode-mobile]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(desktopStripPill === 'none', `Strip mode pill hidden on desktop (got ${desktopStripPill})`);

  // Edit toolbar must still be visible on desktop.
  const desktopToolbar = await desktop.evaluate(() => {
    const el = document.querySelector('.er-edit-toolbar');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(desktopToolbar !== 'none' && desktopToolbar !== null, `Edit toolbar visible on desktop (got ${desktopToolbar})`);

  // ✕ Done button must be hidden on desktop too.
  const desktopDone = await desktop.evaluate(() => {
    const el = document.querySelector('[data-strip-edit-done]');
    if (!el) return null;
    return getComputedStyle(el).display;
  });
  assert(desktopDone === 'none', `✕ Done button hidden on desktop (got ${desktopDone})`);

  await browser.close();

  console.log('');
  console.log(`${failures.length} failure(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe error:', err);
  process.exit(2);
});
