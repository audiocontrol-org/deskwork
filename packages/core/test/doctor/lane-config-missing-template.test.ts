/**
 * Tests for the `lane-config-missing-template` doctor rule.
 *
 * Phase 6 Task 6.5 (graphical-entries). Four scenarios:
 *
 *   1. Audit: a lane config referencing a non-existent template id
 *      produces exactly one finding with the expected details shape.
 *   2. Repair via `set-template`: the rebind lands on disk, a journal
 *      event is emitted, and a re-audit returns zero findings.
 *   3. Repair via `delete-lane` (no entries bound): the lane file is
 *      removed and a journal event is emitted.
 *   4. Repair via `delete-lane` when entries are bound: the apply
 *      refuses with `success: false` and names the bound entry's
 *      **slug** (per AUDIT-20260530-77 — the refusal message must use
 *      slugs to match the `lane move <slug>` instruction it gives and
 *      to match the sibling `lane purge` refusal surface).
 *   5. Repair via `delete-lane` with multiple bound entries: refusal
 *      lists every bound slug, never UUIDs.
 *
 * Fixtures live on disk under tmp directories — no filesystem mocking,
 * per the project's testing rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAudit, yesInteraction } from '@/doctor/runner';
import laneConfigMissingTemplate from '@/doctor/rules/lane-config-missing-template';
import { buildContentIndex } from '@/content-index';
import { readCalendar } from '@/calendar';
import { resolveCalendarPath } from '@/paths';
import type { DeskworkConfig } from '@/config';
import type { DoctorContext } from '@/doctor/types';

const RULE_ID = 'lane-config-missing-template';

interface Fixture {
  root: string;
  config: DeskworkConfig;
}

function setupFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-lane-cfg-mt-'));
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  // Empty calendar — every test runs against a calendar that has no
  // rows. The rule under test doesn't consult the calendar.
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

function writeLaneJson(root: string, id: string, payload: unknown): void {
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(payload, null, 2) + '\n',
    'utf8',
  );
}

function writeSidecarJson(root: string, payload: unknown): void {
  // sidecars are stored at .deskwork/entries/<uuid>.json
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

function listJournalEvents(root: string): unknown[] {
  const dir = join(root, '.deskwork', 'review-journal', 'history');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')) as unknown);
}

const EXPECTED_PRESET_TEMPLATES = [
  'blog-post',
  'editorial',
  'feature-doc',
  'qa-plan',
  'visual',
];

describe('doctor: lane-config-missing-template', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('emits one finding when a lane config references a non-existent template', async () => {
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });

    const report = await runAudit(
      { projectRoot: fixture.root, config: fixture.config },
      yesInteraction,
    );
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.severity).toBe('error');
    expect(f.details.laneId).toBe('dangling');
    expect(f.details.unresolvedTemplateId).toBe('nonsense');
    expect(f.details.laneFilePath).toBe(
      join(fixture.root, '.deskwork', 'lanes', 'dangling.json'),
    );
    expect(f.details.availableTemplates).toEqual(EXPECTED_PRESET_TEMPLATES);
  });

  it('repairs via set-template: rebinds the lane and emits a journal event', async () => {
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    expect(plan.kind).toBe('prompt');
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');

    const choice = plan.choices.find((c) => c.id === 'set-template-editorial');
    expect(choice).toBeDefined();
    if (!choice) throw new Error('set-template-editorial choice missing');

    const result = await laneConfigMissingTemplate.apply(ctx, {
      kind: 'apply',
      finding: findings[0],
      summary: choice.label,
      payload: choice.payload,
    });
    expect(result.applied).toBe(true);

    // Lane JSON updated on disk.
    const onDisk = JSON.parse(
      readFileSync(join(fixture.root, '.deskwork', 'lanes', 'dangling.json'), 'utf8'),
    ) as { pipelineTemplate: string };
    expect(onDisk.pipelineTemplate).toBe('editorial');

    // Journal event emitted.
    const events = listJournalEvents(fixture.root);
    const repairEvents = events.filter(
      (e): e is { kind: string; laneId: string; details: { action: string; before: string; after: string } } =>
        typeof e === 'object'
        && e !== null
        && (e as { kind?: unknown }).kind === 'lane-config-repair',
    );
    expect(repairEvents).toHaveLength(1);
    expect(repairEvents[0].laneId).toBe('dangling');
    expect(repairEvents[0].details.action).toBe('set-template');
    expect(repairEvents[0].details.before).toBe('nonsense');
    expect(repairEvents[0].details.after).toBe('editorial');

    // Re-audit returns zero findings.
    const reauditCtx = buildCtx(fixture);
    const after = await laneConfigMissingTemplate.audit(reauditCtx);
    expect(after).toHaveLength(0);
  });

  it('repairs via delete-lane (no entries bound): removes the file and emits a journal event', async () => {
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
    const choice = plan.choices.find((c) => c.id === 'delete-lane');
    if (!choice) throw new Error('delete-lane choice missing');

    const laneFile = join(fixture.root, '.deskwork', 'lanes', 'dangling.json');
    expect(existsSync(laneFile)).toBe(true);

    const result = await laneConfigMissingTemplate.apply(ctx, {
      kind: 'apply',
      finding: findings[0],
      summary: choice.label,
      payload: choice.payload,
    });
    expect(result.applied).toBe(true);
    expect(existsSync(laneFile)).toBe(false);

    const events = listJournalEvents(fixture.root);
    const repairEvents = events.filter(
      (e): e is { kind: string; laneId: string; details: { action: string; deleted: true; laneFilePath: string } } =>
        typeof e === 'object'
        && e !== null
        && (e as { kind?: unknown }).kind === 'lane-config-repair',
    );
    expect(repairEvents).toHaveLength(1);
    expect(repairEvents[0].details.action).toBe('delete');
    expect(repairEvents[0].details.deleted).toBe(true);
    expect(repairEvents[0].details.laneFilePath).toBe(laneFile);
  });

  it('plan: filters malformed override ids out of set-template choices (AUDIT-20260529-08)', async () => {
    // Dangling lane to trigger the finding.
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    // Malformed override under .deskwork/pipelines/broken.json —
    // `listAvailablePipelineTemplates` will surface its basename, but
    // `loadPipelineTemplate` rejects on the JSON parse. The plan's
    // filter must drop it from the choices.
    mkdirSync(join(fixture.root, '.deskwork', 'pipelines'), { recursive: true });
    writeFileSync(
      join(fixture.root, '.deskwork', 'pipelines', 'broken.json'),
      '{',
      'utf8',
    );

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');

    const choiceIds = plan.choices.map((c) => c.id);
    // Malformed id is NOT advertised.
    expect(choiceIds).not.toContain('set-template-broken');
    // Valid presets ARE advertised.
    expect(choiceIds).toContain('set-template-editorial');
    // The non-template repair path is preserved.
    expect(choiceIds).toContain('delete-lane');
  });

  it('refuses delete-lane when an entry references the lane', async () => {
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    const boundUuid = '11111111-1111-4111-8111-111111111111';
    const nowIso = new Date().toISOString();
    writeSidecarJson(fixture.root, {
      uuid: boundUuid,
      slug: 'bound-entry',
      title: 'Bound Entry',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      lane: 'dangling',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
    const choice = plan.choices.find((c) => c.id === 'delete-lane');
    if (!choice) throw new Error('delete-lane choice missing');

    const result = await laneConfigMissingTemplate.apply(ctx, {
      kind: 'apply',
      finding: findings[0],
      summary: choice.label,
      payload: choice.payload,
    });
    expect(result.applied).toBe(false);
    // Per AUDIT-20260530-77 — the refusal message must list the slug
    // (the identifier the operator can paste into the suggested
    // `lane move <slug>` command), not the UUID. The sibling
    // `lane purge` surface (purge.ts) already uses slugs; this surface
    // must match.
    expect(result.message).toContain('bound-entry');
    expect(result.message).not.toContain(boundUuid);
    expect(result.message).toMatch(/Cannot delete lane/);

    // Lane file still on disk — refusal was effective.
    expect(
      existsSync(join(fixture.root, '.deskwork', 'lanes', 'dangling.json')),
    ).toBe(true);
  });

  it('refuses delete-lane and lists slugs (never UUIDs) for multiple bound entries', async () => {
    // AUDIT-20260530-77 — extended scenario per Task 0.52 brief: two
    // bound entries with operator-recognizable slugs. The refusal
    // message must name each slug; no UUID may leak through.
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    const firstUuid = '22222222-2222-4222-8222-222222222222';
    const secondUuid = '33333333-3333-4333-8333-333333333333';
    const nowIso = new Date().toISOString();
    writeSidecarJson(fixture.root, {
      uuid: firstUuid,
      slug: 'first-post',
      title: 'First Post',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      lane: 'dangling',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    writeSidecarJson(fixture.root, {
      uuid: secondUuid,
      slug: 'second-post',
      title: 'Second Post',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      lane: 'dangling',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
    const choice = plan.choices.find((c) => c.id === 'delete-lane');
    if (!choice) throw new Error('delete-lane choice missing');

    const result = await laneConfigMissingTemplate.apply(ctx, {
      kind: 'apply',
      finding: findings[0],
      summary: choice.label,
      payload: choice.payload,
    });
    expect(result.applied).toBe(false);
    expect(result.message).toContain('first-post');
    expect(result.message).toContain('second-post');
    expect(result.message).not.toContain(firstUuid);
    expect(result.message).not.toContain(secondUuid);
    expect(result.message).toMatch(/Cannot delete lane/);

    // Lane file still on disk — refusal was effective.
    expect(
      existsSync(join(fixture.root, '.deskwork', 'lanes', 'dangling.json')),
    ).toBe(true);
  });
});
