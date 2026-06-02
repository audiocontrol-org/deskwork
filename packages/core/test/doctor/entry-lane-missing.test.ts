/**
 * Tests for the `entry-lane-missing` doctor rule.
 *
 * Phase 8 Step 8.0.1 (graphical-entries). Verifies that the rule:
 *
 *   1. Emits one `error` finding per sidecar lacking a `lane` field.
 *   2. Names the entry's slug + UUID + project-relative sidecar path
 *      in finding details (AUDIT-20260530-81 precedent — relative,
 *      never absolute).
 *   3. Repair-message includes BOTH operator-facing repair paths
 *      (`migrateLaneMembership` and `/deskwork:lane move`).
 *   4. Emits zero findings when every entry carries a `lane` field
 *      (negative test).
 *   5. `plan()` returns `report-only` with both repair commands in
 *      its reason — confirms there is no auto-repair branch.
 *
 * Fixtures live on disk under tmp directories — no filesystem mocking,
 * per the project's testing rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAudit, yesInteraction } from '@/doctor/runner';
import entryLaneMissing from '@/doctor/rules/entry-lane-missing';
import { buildContentIndex } from '@/content-index';
import { readCalendar } from '@/calendar';
import { resolveCalendarPath } from '@/paths';
import type { DeskworkConfig } from '@/config';
import type { DoctorContext } from '@/doctor/types';

const RULE_ID = 'entry-lane-missing';

interface Fixture {
  root: string;
  config: DeskworkConfig;
}

function setupFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-entry-lane-missing-'));
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(
    join(root, '.deskwork', 'calendar.md'),
    `# Editorial Calendar\n\n## Drafting\n\n| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n`,
    'utf8',
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

function writeSidecarJson(root: string, payload: unknown): void {
  const obj = payload as { uuid: string };
  writeFileSync(
    join(root, '.deskwork', 'entries', `${obj.uuid}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function buildCtx(fixture: Fixture): DoctorContext {
  const calendarPath = resolveCalendarPath(fixture.root, fixture.config, 'main');
  return {
    projectRoot: fixture.root,
    config: fixture.config,
    site: 'main',
    calendar: readCalendar(calendarPath),
    index: buildContentIndex(fixture.root, fixture.config, 'main'),
    workflows: [],
    interaction: yesInteraction,
  };
}

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('doctor: entry-lane-missing', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('emits one finding per sidecar missing the `lane` field (with slug + UUID + relative path)', async () => {
    const nowIso = new Date().toISOString();
    // Entry A: has lane "default" — should NOT emit a finding.
    writeSidecarJson(fixture.root, {
      uuid: UUID_A,
      slug: 'with-default-lane',
      title: 'With Default Lane',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      lane: 'default',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    // Entry B: NO lane field — legacy migration-window state — SHOULD emit.
    writeSidecarJson(fixture.root, {
      uuid: UUID_B,
      slug: 'legacy-no-lane',
      title: 'Legacy No Lane',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    // Entry C: has lane "qa" — should NOT emit a finding.
    writeSidecarJson(fixture.root, {
      uuid: UUID_C,
      slug: 'with-qa-lane',
      title: 'With QA Lane',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      lane: 'qa',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const report = await runAudit(
      { projectRoot: fixture.root, config: fixture.config },
      yesInteraction,
    );
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);

    const f = findings[0];
    expect(f.severity).toBe('error');
    expect(f.details.slug).toBe('legacy-no-lane');
    expect(f.details.uuid).toBe(UUID_B);
    // AUDIT-20260530-81 precedent — the persisted `sidecarPath` must be
    // PROJECT-RELATIVE (`.deskwork/entries/<uuid>.json`), never absolute.
    expect(f.details.sidecarPath).toBe(
      join('.deskwork', 'entries', `${UUID_B}.json`),
    );
    // Sanity guard: must not start with `/` regardless of OS.
    expect(String(f.details.sidecarPath).startsWith('/')).toBe(false);

    // Message names the slug + both operator-facing repair paths.
    expect(f.message).toContain('legacy-no-lane');
    expect(f.message).toContain(UUID_B);
    expect(f.message).toContain('migrateLaneMembership');
    expect(f.message).toContain('/deskwork:lane move legacy-no-lane --to');
  });

  it('emits zero findings when every entry carries a `lane` field', async () => {
    const nowIso = new Date().toISOString();
    writeSidecarJson(fixture.root, {
      uuid: UUID_A,
      slug: 'with-default-lane',
      title: 'With Default Lane',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      lane: 'default',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    writeSidecarJson(fixture.root, {
      uuid: UUID_C,
      slug: 'with-qa-lane',
      title: 'With QA Lane',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      lane: 'qa',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const ctx = buildCtx(fixture);
    const findings = await entryLaneMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('emits zero findings on an empty project (no sidecars dir)', async () => {
    // Setup creates the entries/ dir; remove it to exercise the
    // ENOENT-tolerant path in `readAllSidecarsPartitioned`.
    rmSync(join(fixture.root, '.deskwork', 'entries'), {
      recursive: true,
      force: true,
    });
    const ctx = buildCtx(fixture);
    const findings = await entryLaneMissing.audit(ctx);
    expect(findings).toHaveLength(0);
  });

  it('plan() returns report-only with both repair commands named in the reason', async () => {
    const nowIso = new Date().toISOString();
    writeSidecarJson(fixture.root, {
      uuid: UUID_B,
      slug: 'legacy-no-lane',
      title: 'Legacy No Lane',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const ctx = buildCtx(fixture);
    const findings = await entryLaneMissing.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await entryLaneMissing.plan(ctx, findings[0]);
    expect(plan.kind).toBe('report-only');
    if (plan.kind !== 'report-only') throw new Error('plan must be report-only');
    expect(plan.reason).toContain('migrateLaneMembership');
    expect(plan.reason).toContain('/deskwork:lane move legacy-no-lane --to');
  });
});
