/**
 * Regression coverage for AUDIT-20260603-15 (Phase 39 Task 39.5).
 *
 * The detection trigger fires on `sitesPresent || missingArtifactPath`,
 * but every repair action keys off legacy sites: lane creation iterates
 * `sites`, and the backfiller only searches each legacy `site.contentDir`.
 * When the rule fires because `missingArtifactPath` is true but the legacy
 * `sites` block is ABSENT (a partial-migration / post-drop state), the
 * backfiller has NO base dirs to search, stamps nothing — yet `apply`
 * previously returned `applied: true` ("0 lane(s) created, 0 backfilled").
 * That claims a successful fix for a run that changed nothing and did not
 * converge (a subsequent audit re-fires the same finding).
 *
 * The fix tightens the apply contract: when there are no legacy sites to
 * migrate but entries still lack `artifactPath`, `apply` must report
 * honestly (NOT `applied: true`) and direct the operator at the
 * lane-native back-fill.
 *
 * Reached through `runRepair`: a config object carrying one site drives
 * the runner's per-site loop, while the ON-DISK config has no `sites`
 * block (so `readLegacySites` returns an empty map → empty base dirs).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRepair, yesInteraction } from '@/doctor/runner';
import { writeSidecar } from '@/sidecar/write';
import type { DeskworkConfig } from '@/config';
import type { Entry } from '@/schema/entry';

function validConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      blog: { contentDir: 'src/content/blog', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'blog',
  };
}

function entry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
  return {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: {},
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('AUDIT-20260603-15 — apply does not claim success for a no-op backfill', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dw-s2l-noop-'));
    await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
    // ON-DISK config has NO sites block — the post-drop / partial state.
    await writeFile(
      join(root, '.deskwork', 'config.json'),
      JSON.stringify({ version: 1 }),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports not-applied when there are no legacy sites but an entry still lacks artifactPath', async () => {
    // Entry missing artifactPath → the detection fires on missingArtifactPath.
    await writeSidecar(root, entry('44444444-4444-4444-8444-444444444444', 'orphan-post'));

    const report = await runRepair(
      { projectRoot: root, config: validConfig(), ruleIds: ['sites-to-lanes-migration'] },
      yesInteraction,
    );

    const result = report.repairs.find(
      (r) => r.finding.ruleId === 'sites-to-lanes-migration',
    );
    expect(result).toBeDefined();
    // The run stamped nothing (no base dirs to search). It must NOT claim
    // success — `applied: true` for a no-op is the bug.
    expect(result?.applied).toBe(false);
    expect(result?.message).toMatch(/no legacy sites|nothing.*stamp|cannot/i);
  });
});
