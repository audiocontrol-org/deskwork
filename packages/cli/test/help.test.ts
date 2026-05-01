/**
 * `deskwork --help` text shape (#139).
 *
 * Spawns a fresh node process to capture the help output without
 * triggering process.exit() in the test runner. Asserts on the LIVE help
 * text — what an operator sees when they run `deskwork --help`.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIST = join(__dirname, '..', 'dist', 'cli.js');

function runHelp(): string {
  const r = spawnSync('node', [CLI_DIST, '--help'], {
    encoding: 'utf8',
  });
  return r.stdout + r.stderr;
}

describe('deskwork --help', () => {
  it('lists install / ingest / add', () => {
    const out = runHelp();
    expect(out).toMatch(/\binstall\b/);
    expect(out).toMatch(/\bingest\b/);
    expect(out).toMatch(/\badd\b/);
  });

  it('lists doctor / customize / repair-install', () => {
    const out = runHelp();
    expect(out).toMatch(/\bdoctor\b/);
    expect(out).toMatch(/\bcustomize\b/);
    expect(out).toMatch(/\brepair-install\b/);
  });

  it('lists iterate / approve / publish (universal verbs available as CLI)', () => {
    const out = runHelp();
    expect(out).toMatch(/\biterate\b/);
    expect(out).toMatch(/\bapprove\b/);
    expect(out).toMatch(/\bpublish\b/);
  });

  it('lists shortform-start / distribute', () => {
    const out = runHelp();
    expect(out).toMatch(/\bshortform-start\b/);
    expect(out).toMatch(/\bdistribute\b/);
  });

  it('does NOT list retired verbs as if usable', () => {
    const out = runHelp();
    // None of the retired verbs should appear in the active command list.
    // We allow them in a "retired / migration" mention if it's clearly
    // labelled, but not in the primary listing. Test: search for
    // `\n  <verb>\b` (two-space indent on a fresh line — the listing
    // shape) for each retired verb.
    for (const verb of [
      'plan', 'outline', 'draft', 'pause', 'resume',
      'review-start', 'review-cancel', 'review-help', 'review-report',
    ]) {
      const re = new RegExp(`^  ${verb}\\b`, 'm');
      expect(out, `retired verb '${verb}' appears in the help listing`).not.toMatch(re);
    }
  });

  it('points operators at the new skill-only universal verbs (block / cancel / induct / status)', () => {
    const out = runHelp();
    // Allowed in any form (heading, prose, "see /deskwork:<verb>")
    // — just be discoverable.
    expect(out).toMatch(/\bblock\b/);
    expect(out).toMatch(/\bcancel\b/);
    expect(out).toMatch(/\binduct\b/);
    expect(out).toMatch(/\bstatus\b/);
  });
});
