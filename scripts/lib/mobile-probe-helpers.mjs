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
    return res.ok || res.status === 302 || res.status === 200;
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
 * Recognised flags:
 *   --studio-url <url>   Override the studio base URL (default: $STUDIO_URL or http://localhost:47323)
 *   --entry <uuid>       Pin a specific entry UUID (optional; probes auto-pick if omitted)
 *
 * @param {string[]} argv  Typically process.argv.slice(2)
 * @returns {{ studioUrl: string, entryUuid: string | null }}
 */
export function parseProbeArgs(argv) {
  let studioUrl = process.env.STUDIO_URL ?? 'http://localhost:47323';
  let entryUuid = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--studio-url' && argv[i + 1]) {
      studioUrl = argv[++i];
    } else if (a === '--entry' && argv[i + 1]) {
      entryUuid = argv[++i];
    }
  }

  return { studioUrl, entryUuid };
}

/**
 * Print a summary line and exit with 0 (all pass) or 1 (failures found).
 *
 * @param {string[]} failures  Array of failure labels collected during the probe run.
 * @param {string} label       Human-readable probe name for the summary line (optional).
 */
export function summarizeResults(failures, label) {
  if (label) {
    console.log('');
    console.log(`${label}: ${failures.length} failure(s)`);
  } else {
    console.log('');
    console.log(`${failures.length} failure(s)`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}
