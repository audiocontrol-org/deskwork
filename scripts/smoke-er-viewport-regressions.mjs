#!/usr/bin/env node
/**
 * Dual-viewport regression smoke for the entry-review surface.
 *
 * Drives Playwright Chromium against the running dev studio at BOTH a
 * desktop viewport (1920x1080) and a phone viewport (390x844). Walks N
 * entries from the project's calendar; for each (entry × viewport) pair
 * asserts:
 *
 *   1. No page-level horizontal overflow:
 *        documentElement.scrollWidth === viewport.width
 *   2. Compact-chrome invariant at desktop:
 *        .er-strip rendered height <= 110px
 *   3. No fixed-position element whose right edge exceeds viewport width
 *      (those bypass html-level overflow:clip on real iOS Safari).
 *
 * Exits non-zero on any violation; prints a per-(entry × viewport) row.
 *
 * Why this script exists: the entry-review surface has accumulated layered
 * media queries where desktop layout tokens (page max-width, gutter sizing,
 * marginalia column) cross-talk with mobile containment rules. CSS commits
 * tested at one viewport class regularly regress the other — the
 * 2026-05-08 session is the canonical case study (nine layout commits,
 * each verified at only one viewport, produced an iOS regression caught
 * only by manual phone testing). This smoke pins the cross-viewport
 * invariants so they can't silently break. See
 * .claude/rules/ui-verification.md "Dual-viewport verification".
 *
 * Local-only by design (per .claude/rules/agent-discipline.md "No test
 * infrastructure in CI"). Run before any commit that touches CSS or
 * markup on the entry-review surface.
 *
 * Note on iOS-specific issues: this smoke uses Chromium for speed and
 * reliability across CI/local environments. Chromium-at-iPhone-viewport
 * catches most page-level overflow but hides WebKit-specific quirks
 * (overflow: clip support, position: fixed + soft keyboard, intrinsic
 * flex sizing). For those, run scripts/probe-ios-overflow.mjs in addition
 * — that script uses Playwright WebKit which is closer to real iOS Safari.
 *
 * Usage:
 *   node scripts/smoke-er-viewport-regressions.mjs [opts]
 *
 * Options:
 *   --studio-url URL    Dev studio base (default: $STUDIO_URL or http://localhost:47323)
 *   --limit N           Number of entries to walk (default: 5)
 *   --entry UUID        Probe one specific entry (overrides --limit)
 *
 * Exit codes:
 *   0   all probes passed
 *   1   one or more invariants violated
 *   2   setup error (no dev studio reachable, no entries on disk, etc.)
 */

import { chromium } from 'playwright';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ---- CLI args -------------------------------------------------------------

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

const STUDIO_URL = arg('--studio-url', process.env.STUDIO_URL ?? 'http://localhost:47323');
const LIMIT = Number.parseInt(arg('--limit', '5'), 10);
const ENTRY_OVERRIDE = arg('--entry', null);

const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'phone', width: 390, height: 844 },
];

const STRIP_HEIGHT_MAX_DESKTOP_PX = 110;

// ---- Entry discovery ------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..');
const ENTRIES_DIR = join(PROJECT_ROOT, '.deskwork', 'entries');

async function pickEntries() {
  if (ENTRY_OVERRIDE) return [ENTRY_OVERRIDE];
  const files = await readdir(ENTRIES_DIR);
  const ids = files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  if (ids.length === 0) {
    throw new Error(`No entries found in ${ENTRIES_DIR}`);
  }
  return ids.slice(0, LIMIT);
}

// ---- Per-probe measurement ------------------------------------------------

async function probe(page, entryId, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const url = `${STUDIO_URL}/dev/editorial-review/entry/${entryId}`;
  const resp = await page.goto(url, { waitUntil: 'networkidle' });
  if (!resp || resp.status() !== 200) {
    return { navOk: false, navStatus: resp?.status?.() ?? -1 };
  }
  return await page.evaluate(({ vp, stripMax }) => {
    const doc = document.documentElement;
    const body = document.body;
    const docW = doc.scrollWidth;
    const bodyW = body.scrollWidth;
    const overflow = docW > vp.width || bodyW > vp.width;
    const fixedOffenders = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.right > vp.width + 1 && r.width > 0) {
        fixedOffenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
    const strip = document.querySelector('.er-strip');
    const stripH = strip ? Math.round(strip.getBoundingClientRect().height) : null;
    const stripPass = vp.name === 'desktop'
      ? (stripH != null && stripH <= stripMax)
      : true;
    return {
      navOk: true,
      docW,
      bodyW,
      overflow,
      stripH,
      stripPass,
      fixedOffenders: fixedOffenders.slice(0, 10),
    };
  }, { vp: viewport, stripMax: STRIP_HEIGHT_MAX_DESKTOP_PX });
}

// ---- Main loop ------------------------------------------------------------

async function main() {
  let entries;
  try {
    entries = await pickEntries();
  } catch (err) {
    console.error(`smoke-er-viewport-regressions: ${err.message}`);
    process.exit(2);
  }

  // Quick reachability check — fail fast with exit 2 if studio is down.
  const head = await fetch(STUDIO_URL).catch((err) => err);
  if (!(head instanceof Response) || head.status >= 500) {
    console.error(`smoke-er-viewport-regressions: dev studio not reachable at ${STUDIO_URL}`);
    console.error('  start the dev studio with `npm run dev` first, then re-run.');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const rows = [];
  for (const entryId of entries) {
    for (const viewport of VIEWPORTS) {
      const result = await probe(page, entryId, viewport);
      const overflowFail = result.overflow === true;
      const stripFail = result.stripPass === false;
      const fixedFail = (result.fixedOffenders?.length ?? 0) > 0;
      const navFail = result.navOk === false;
      const fail = navFail || overflowFail || stripFail || fixedFail;
      rows.push({ entryId, viewport: viewport.name, ...result, fail });
    }
  }
  await browser.close();

  // Summary
  console.log(`\nentry-review viewport regression smoke`);
  console.log(`  studio:    ${STUDIO_URL}`);
  console.log(`  entries:   ${entries.length}`);
  console.log(`  viewports: ${VIEWPORTS.map((v) => `${v.name}(${v.width}x${v.height})`).join(', ')}\n`);

  const failures = rows.filter((r) => r.fail);
  for (const row of rows) {
    const tag = row.fail ? 'FAIL' : 'pass';
    const eid = row.entryId.slice(0, 8);
    const vp = row.viewport.padEnd(7);
    if (row.navOk === false) {
      console.log(`  [${tag}] ${eid}  ${vp} navigation failed (status=${row.navStatus})`);
      continue;
    }
    const sw = `scrollW=${row.docW}`.padEnd(13);
    const sh = `strip=${row.stripH ?? '-'}`.padEnd(12);
    const fo = `fixedOver=${row.fixedOffenders?.length ?? 0}`;
    console.log(`  [${tag}] ${eid}  ${vp} ${sw} ${sh} ${fo}`);
    if (row.fixedOffenders && row.fixedOffenders.length > 0) {
      for (const o of row.fixedOffenders) {
        console.log(`         ${o.right > 9999 ? '' : ' '}-> <${o.tag} class="${o.cls}"> right=${o.right} width=${o.width}`);
      }
    }
  }

  console.log(`\n${failures.length} failure(s) across ${rows.length} probes`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke-er-viewport-regressions: fatal error');
  console.error(err);
  process.exit(2);
});
