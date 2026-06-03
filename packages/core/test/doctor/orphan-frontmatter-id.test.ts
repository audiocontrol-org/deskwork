/**
 * Tests for the `orphan-frontmatter-id` doctor rule (Issue #300 regression).
 *
 * Before Phase 4 the rule consulted `ctx.calendar.entries` exclusively;
 * that list comes from the legacy `parseCalendar` parser which only
 * recognizes the pre-graphical-entries 7-stage section names. Entries
 * in `## Final`, `## Blocked`, or `## Cancelled` sections were
 * silently dropped from the parsed list, producing false-positive
 * orphan findings against every Final / Blocked / Cancelled file in
 * the project.
 *
 * Phase 4 augments the audit with a UUID-set scan of the raw
 * calendar.md markdown — section-agnostic — so any UUID that appears
 * in ANY table row anywhere in the file is treated as "in the
 * calendar", regardless of section heading.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAudit, yesInteraction } from '@/doctor/runner';
import type { DeskworkConfig } from '@/config';

const RULE_ID = 'orphan-frontmatter-id';

async function setupFixture(): Promise<{ root: string; config: DeskworkConfig }> {
  const root = await mkdtemp(join(tmpdir(), 'dw-orphan-fmid-'));
  await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  // Phase 39c (sites→lanes retirement): the doctor's content discovery is
  // sidecar-driven AND walks each lane's `scaffoldDefaults` directory (so
  // not-yet-bound files — orphans — sitting in a lane's content root are
  // still found). Seed a `default` lane whose markdown scaffold root is
  // `docs` so the orphan files under `docs/<slug>/index.md` are
  // discovered without requiring a sidecar per file.
  await mkdir(join(root, '.deskwork', 'lanes'), { recursive: true });
  await writeFile(
    join(root, '.deskwork', 'lanes', 'default.json'),
    JSON.stringify({
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      scaffoldDefaults: { markdown: 'docs' },
    }),
  );
  const config: DeskworkConfig = {
    version: 1,
    sites: {
      main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'main',
  };
  return { root, config };
}

const UUID_FINAL = '11111111-1111-4111-8111-111111111111';
const UUID_CANCELLED = '22222222-2222-4222-8222-222222222222';
const UUID_BLOCKED = '33333333-3333-4333-8333-333333333333';
const UUID_DRAFTING = '44444444-4444-4444-8444-444444444444';

function calendarWithFinalAndCancelled(): string {
  return `# Editorial Calendar

## Drafting

| UUID | Slug | Title | Description | Keywords | Source | Updated |
|------|------|------|------|------|------|------|
| ${UUID_DRAFTING} | drafting-doc | Drafting Doc |  |  | manual | 2026-04-30T10:00:00.000Z |

## Final

| UUID | Slug | Title | Description | Keywords | Source | Updated |
|------|------|------|------|------|------|------|
| ${UUID_FINAL} | final-doc | Final Doc |  |  | manual | 2026-04-30T10:00:00.000Z |

## Blocked

| UUID | Slug | Title | Description | Keywords | Source | Updated |
|------|------|------|------|------|------|------|
| ${UUID_BLOCKED} | blocked-doc | Blocked Doc |  |  | manual | 2026-04-30T10:00:00.000Z |

## Cancelled

| UUID | Slug | Title | Description | Keywords | Source | Updated |
|------|------|------|------|------|------|------|
| ${UUID_CANCELLED} | cancelled-doc | Cancelled Doc |  |  | manual | 2026-04-30T10:00:00.000Z |

## Distribution

*reserved for shortform DistributionRecords — separate model*
`;
}

async function writeContentFile(root: string, slug: string, uuid: string): Promise<void> {
  await mkdir(join(root, 'docs', slug), { recursive: true });
  await writeFile(
    join(root, 'docs', slug, 'index.md'),
    `---\ndeskwork:\n  id: ${uuid}\n---\n\n# ${slug}\n`,
  );
}

describe('doctor: orphan-frontmatter-id (#300 regression)', () => {
  let root: string;
  let config: DeskworkConfig;

  beforeEach(async () => {
    const f = await setupFixture();
    root = f.root;
    config = f.config;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('does NOT flag entries in Final / Blocked / Cancelled sections as orphans (#300)', async () => {
    await writeFile(join(root, '.deskwork', 'calendar.md'), calendarWithFinalAndCancelled());
    // Each calendar entry has a corresponding on-disk file bound by id.
    await writeContentFile(root, 'drafting-doc', UUID_DRAFTING);
    await writeContentFile(root, 'final-doc', UUID_FINAL);
    await writeContentFile(root, 'blocked-doc', UUID_BLOCKED);
    await writeContentFile(root, 'cancelled-doc', UUID_CANCELLED);

    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    // Before the fix: 3 false positives (Final / Blocked / Cancelled).
    // After:           0 false positives.
    expect(findings).toHaveLength(0);
  });

  it('still flags a real orphan (file with id not in calendar)', async () => {
    await writeFile(join(root, '.deskwork', 'calendar.md'), calendarWithFinalAndCancelled());
    // A file bound by an id that is NOT in the calendar — a real orphan.
    const orphanUuid = '99999999-9999-4999-8999-999999999999';
    await writeContentFile(root, 'orphan-doc', orphanUuid);
    // Also include the "good" files so we don't trip absence-of-id rules.
    await writeContentFile(root, 'drafting-doc', UUID_DRAFTING);
    await writeContentFile(root, 'final-doc', UUID_FINAL);
    await writeContentFile(root, 'blocked-doc', UUID_BLOCKED);
    await writeContentFile(root, 'cancelled-doc', UUID_CANCELLED);

    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.entryId).toBe(orphanUuid);
  });

  it('handles a calendar with only legacy stages (no Final / Cancelled rows) without false positives', async () => {
    const md = `# Editorial Calendar

## Drafting

| UUID | Slug | Title | Description | Keywords | Source | Updated |
|------|------|------|------|------|------|------|
| ${UUID_DRAFTING} | drafting-doc | Drafting Doc |  |  | manual | 2026-04-30T10:00:00.000Z |
`;
    await writeFile(join(root, '.deskwork', 'calendar.md'), md);
    await writeContentFile(root, 'drafting-doc', UUID_DRAFTING);

    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(0);
  });
});
