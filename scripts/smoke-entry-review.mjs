#!/usr/bin/env node
/**
 * Smoke for Phase 34a Layer 2 entry-keyed press-check surface.
 *
 * Boots the studio app in-process (no network listener; no Tailscale)
 * via `createApp(ctx)` + `app.fetch(...)`, hits the live PRD entry
 * URL on this project's calendar, and prints DOM-anchor evidence the
 * controller can grep against to verify the chrome rendered without
 * exposing the studio on a real port.
 *
 * Output: a JSON object with { status, domAnchors, sampleSnippets }.
 * Exit non-zero when status != 200 or any required anchor missing.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readConfig } from '@deskwork/core/config';
import { createApp } from '@deskwork/studio';

const PRD_ENTRY_UUID = '9845c268-670f-4793-b986-0433e9ef4fb9';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const config = readConfig(projectRoot);
const app = createApp({ projectRoot, config });

const url = `http://localhost/dev/editorial-review/entry/${PRD_ENTRY_UUID}`;
const res = await app.fetch(new Request(url));
const html = await res.text();

const requiredAnchors = [
  'class="er-review-shell"',
  'data-review-ui="longform"',
  'class="er-folio"',
  'class="er-strip"',
  'class="er-page-grid"',
  'class="er-marginalia"',
  'class="er-marginalia-tab"',
  'class="er-outline-drawer"',
  'class="er-scrapbook-drawer"',
  'class="er-shortcuts"',
  'class="er-edit-toolbar"',
  'data-action="approve"',
  'data-action="iterate"',
  'data-action="reject"',
  'data-action="save-version"',
  'id="entry-review-state"',
  `"entryId":"${PRD_ENTRY_UUID}"`,
];

const present = {};
const missing = [];
for (const anchor of requiredAnchors) {
  const ok = html.includes(anchor);
  present[anchor] = ok;
  if (!ok) missing.push(anchor);
}

// Reject + save disabled with tooltip pointing at the right issue.
const rejectDisabled = /data-action="reject"[^>]*disabled[^>]*title="[^"]*issues\/173/.test(html);
const saveDisabled = /data-action="save-version"[^>]*disabled[^>]*title="[^"]*issues\/174/.test(html);

const summary = {
  url,
  status: res.status,
  anchorsRequired: requiredAnchors.length,
  anchorsPresent: requiredAnchors.length - missing.length,
  missingAnchors: missing,
  rejectDisabledWithTooltip173: rejectDisabled,
  saveDisabledWithTooltip174: saveDisabled,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');

if (res.status !== 200) {
  process.stderr.write(`\n[FAIL] status ${res.status} != 200\n`);
  process.exit(1);
}
if (missing.length > 0) {
  process.stderr.write(`\n[FAIL] ${missing.length} required anchors missing\n`);
  process.exit(1);
}
if (!rejectDisabled) {
  process.stderr.write('\n[FAIL] reject button missing disabled+tooltip pointing at issue #173\n');
  process.exit(1);
}
if (!saveDisabled) {
  process.stderr.write('\n[FAIL] save button missing disabled+tooltip pointing at issue #174\n');
  process.exit(1);
}
process.stderr.write('\n[OK] all anchors + tooltips present\n');
