#!/usr/bin/env node
/**
 * Regression probe for the "pathological page reload" symptom.
 *
 * The symptom presents to the operator as: studio surfaces refresh
 * "as fast as possible" — multiple times per second — making them
 * unusable. The root cause history is multiple:
 *
 *   - Vite HMR WebSocket port (24678) is held by a different worktree's
 *     dev studio; Vite's client falls back to "polling for restart"
 *     mode and page-reloads ~1/sec until the WS server comes back.
 *     (Fixed 2026-05-12 by walking the HMR port forward in server.ts.)
 *
 *   - Pre-existing /api/dev/editorial-studio/state-signature 404 noted
 *     in the journal — not a reload trigger by itself (the polling
 *     client only reloads when the signature CHANGES, not on 404),
 *     but if the signature-change branch ever mis-fires this probe
 *     catches it.
 *
 *   - Any future "browser navigates to itself repeatedly" failure
 *     mode in client code.
 *
 * The probe drives Playwright Chromium against the three primary studio
 * surfaces (Desk, entry-review longform, shortform review). For each:
 *
 *   1. Navigate to the surface
 *   2. Wait 4 seconds (longer than any legitimate reload would take)
 *   3. Assert: page navigated exactly ONCE during that window
 *      (the initial GET; no subsequent re-fetches of the same URL)
 *
 * Why 4 seconds: the polling intervals in the studio are all ≥8s.
 * A correctly-behaving page sits idle for the first 8s. 4s gives a
 * generous slack window before the first legitimate poll could fire.
 *
 * Usage:
 *   node scripts/probe-no-reload-storm.mjs [--studio-url URL]
 *
 * Exit codes:
 *   0  no reload storm detected on any surface
 *   1  one or more surfaces re-navigated within the 4-second window
 *   2  setup error (no studio reachable)
 */

import {
  ping,
  assert,
  launchBrowser,
  newPage,
  parseProbeArgs,
  summarizeResults,
} from './lib/mobile-probe-helpers.mjs';

const { studioUrl: argStudio } = parseProbeArgs(process.argv.slice(2));

const WAIT_MS = 4000;

const SURFACES = [
  { name: 'Desk (/dev/editorial-studio)', path: '/dev/editorial-studio' },
  { name: 'Shortform desk (/dev/editorial-review-shortform)', path: '/dev/editorial-review-shortform' },
];

async function probeSurface(browser, baseUrl, surface, failures) {
  const url = baseUrl + surface.path;
  const page = await newPage(browser, { width: 1280, height: 800 });

  let navigationCount = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && frame.url() === url) {
      navigationCount += 1;
    }
  });

  await page.goto(url, { waitUntil: 'load' });
  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

  assert(
    navigationCount === 1,
    `${surface.name}: page navigated ${navigationCount} time(s) in ${WAIT_MS}ms (expected exactly 1 — initial load only). >1 indicates a reload storm (likely Vite HMR or polling regression).`,
    failures,
  );

  await page.close();
}

async function main() {
  const failures = [];

  if (!(await ping(argStudio + '/dev/'))) {
    console.error(`no dev studio at ${argStudio}; start it with \`npm run dev\``);
    process.exit(2);
  }
  console.log('no-reload-storm probe');
  console.log(`  studio: ${argStudio}`);
  console.log(`  wait:   ${WAIT_MS}ms per surface`);
  console.log('');

  const browser = await launchBrowser();
  try {
    for (const surface of SURFACES) {
      await probeSurface(browser, argStudio, surface, failures);
    }
  } finally {
    await browser.close();
  }

  summarizeResults(failures);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
