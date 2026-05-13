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
