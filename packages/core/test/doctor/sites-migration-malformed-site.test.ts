/**
 * Regression coverage for AUDIT-20260603-13 + AUDIT-20260603-14
 * (Phase 39 Tasks 39.3 + 39.4).
 *
 * -13: `readLegacySites` throws on a present-but-broken legacy site (a
 *      site block missing a non-empty `contentDir`). The migration rule's
 *      `audit()` called it unguarded, and the runner does not wrap
 *      `rule.audit()`, so ONE malformed site aborted the ENTIRE doctor
 *      run — every unrelated rule's output was lost. The fix converts the
 *      throw into an `error`-severity finding so the run completes.
 *
 * -14: `anyEntryMissingArtifactPath` swallowed all read errors with a bare
 *      `catch { return false }`, so a corrupt sidecar made `audit()`
 *      silently conclude "no entries missing artifactPath" (false-clean)
 *      while `apply()` threw on the same input. The fix makes `audit()`
 *      surface the corrupt-sidecar condition instead of under-reporting.
 *
 * Driven through `runAudit` so the test exercises the runner's per-rule
 * dispatch (the surface where the unguarded throw aborts the run).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAudit, yesInteraction } from '@/doctor/runner';
import { sidecarPath } from '@/sidecar/paths';
import type { DeskworkConfig } from '@/config';

/**
 * A valid in-memory config so `selectSites` drives the per-site loop and
 * the migration rule actually runs. The rule reads the LEGACY sites block
 * from disk via `readLegacySites`, not from this object — so the on-disk
 * config can be malformed independently.
 */
function validConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      blog: { contentDir: 'src/content/blog', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'blog',
  };
}

describe('AUDIT-20260603-13 — malformed legacy site does not abort the doctor run', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dw-s2l-malformed-'));
    await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports the bad site as a finding instead of throwing out of audit', async () => {
    // On-disk config: a site that LACKS a non-empty contentDir — exactly
    // the shape `readLegacySites` throws on.
    await writeFile(
      join(root, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: { blog: { calendarPath: '.deskwork/calendar.md' } },
        defaultSite: 'blog',
      }),
    );

    // Must not throw: the run completes and the migration rule surfaces an
    // error finding describing the bad site.
    const report = await runAudit(
      { projectRoot: root, config: validConfig(), ruleIds: ['sites-to-lanes-migration'] },
      yesInteraction,
    );

    const bad = report.findings.find(
      (f) => f.ruleId === 'sites-to-lanes-migration' && f.severity === 'error',
    );
    expect(bad).toBeDefined();
    expect(bad?.message).toMatch(/contentDir|could not read|migration/i);
  });
});

describe('AUDIT-20260603-14 — corrupt sidecar is not silently reported clean', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dw-s2l-corrupt-'));
    await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
    // A valid legacy config so the rule's lane/backfill path is live.
    await writeFile(
      join(root, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: {
          blog: { contentDir: 'src/content/blog', calendarPath: '.deskwork/calendar.md' },
        },
        defaultSite: 'blog',
      }),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('surfaces the corrupt sidecar rather than returning a false-clean audit', async () => {
    // A sidecar that is not valid JSON — `readAllSidecars` throws on it.
    await writeFile(
      sidecarPath(root, '33333333-3333-4333-8333-333333333333'),
      '{ this is not valid json',
    );

    const report = await runAudit(
      { projectRoot: root, config: validConfig(), ruleIds: ['sites-to-lanes-migration'] },
      yesInteraction,
    );

    // The migration rule must NOT silently report a clean detection that
    // omits the corruption: an error finding must surface it (audit must
    // not disagree with apply, which throws on the same corrupt sidecar).
    const err = report.findings.find(
      (f) => f.ruleId === 'sites-to-lanes-migration' && f.severity === 'error',
    );
    expect(err).toBeDefined();
    expect(err?.message).toMatch(/sidecar|invalid|read|could not/i);
  });
});
