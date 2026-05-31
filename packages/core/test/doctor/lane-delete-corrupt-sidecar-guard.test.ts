/**
 * Test: doctor `lane-config-missing-template` delete branch refuses
 * when the project contains unparseable sidecars.
 *
 * Closes AUDIT-20260530-78 (cross-model: AUDIT-BARRAGE-claude-P6-3).
 *
 * Failure mode being pinned: the entry-binding guard at the start of
 * the `delete` apply branch enumerates referencing entries via
 * `readAllSidecars`. The historical assumption was that every sidecar
 * either parses cleanly or surfaces an error the doctor can rely on.
 * If even one sidecar on disk is corrupt/unparseable, the guard cannot
 * confirm that NO entry references the doomed lane — the corrupt
 * sidecar MIGHT carry `lane: <doomed>` but fails to enter the
 * `dependents` set, so the guard sees zero and the unlink proceeds.
 * The orphan is created, the failure mode the guard exists to prevent.
 *
 * Fix shape (mirroring the AUDIT-20260530-67 "unreadable channel"
 * pattern on the pipelines page): expose the count of unparseable
 * sidecars on a sibling channel and refuse the delete whenever it is
 * non-zero. The refusal message tells the operator to repair the
 * sidecars (run `/deskwork:doctor`) before retrying.
 *
 * Fixture lives on disk under a tmp directory — no filesystem mocking,
 * per the project's testing rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { yesInteraction } from '@/doctor/runner';
import laneConfigMissingTemplate from '@/doctor/rules/lane-config-missing-template';
import { buildContentIndex } from '@/content-index';
import { readCalendar } from '@/calendar';
import { resolveCalendarPath } from '@/paths';
import type { DeskworkConfig } from '@/config';
import type { DoctorContext } from '@/doctor/types';

interface Fixture {
  root: string;
  config: DeskworkConfig;
}

function setupFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-lane-delete-corrupt-'));
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

function writeLaneJson(root: string, id: string, payload: unknown): void {
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(payload, null, 2) + '\n',
    'utf8',
  );
}

function writeCorruptSidecar(root: string, name: string): void {
  // Truncated / non-JSON content — fails `JSON.parse` in
  // `readAllSidecars`. Lands at the canonical
  // `.deskwork/entries/<name>.json` path so the walker sees it.
  writeFileSync(
    join(root, '.deskwork', 'entries', `${name}.json`),
    '{ "uuid": "broken",',
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

describe('doctor: lane-config-missing-template — delete corrupt-sidecar guard (AUDIT-20260530-78)', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('refuses delete-lane when ANY sidecar is unparseable, even with zero parseable dependents', async () => {
    // Lane with an unresolved pipelineTemplate so the rule fires.
    writeLaneJson(fixture.root, 'qa', {
      id: 'qa',
      name: 'QA Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    // ONE unparseable sidecar. No parseable sidecars at all — under
    // the buggy guard, `readAllSidecars` would throw, and the existing
    // try/catch turns that into a generic "failed to read sidecars"
    // refusal. Under the fixed guard, the parseable channel comes back
    // empty AND the malformed channel reports one entry; the guard
    // names the unparseable count specifically.
    writeCorruptSidecar(fixture.root, 'broken');

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
    const choice = plan.choices.find((c) => c.id === 'delete-lane');
    if (!choice) throw new Error('delete-lane choice missing');

    const laneFile = join(fixture.root, '.deskwork', 'lanes', 'qa.json');
    expect(existsSync(laneFile)).toBe(true);

    const result = await laneConfigMissingTemplate.apply(ctx, {
      kind: 'apply',
      finding: findings[0],
      summary: choice.label,
      payload: choice.payload,
    });

    // Refusal.
    expect(result.applied).toBe(false);
    // Specific message naming the unparseable count + repair instruction.
    expect(result.message).toMatch(/unparseable|unparsable|cannot confirm/i);
    expect(result.message).toContain('1');
    expect(result.message).toMatch(/doctor/i);
    // Lane file untouched — the guard fired closed.
    expect(existsSync(laneFile)).toBe(true);
  });

  it('refuses delete-lane when the lane has zero parseable dependents but multiple unparseable sidecars exist', async () => {
    writeLaneJson(fixture.root, 'qa', {
      id: 'qa',
      name: 'QA Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    writeCorruptSidecar(fixture.root, 'broken-one');
    writeCorruptSidecar(fixture.root, 'broken-two');
    writeCorruptSidecar(fixture.root, 'broken-three');

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
    const choice = plan.choices.find((c) => c.id === 'delete-lane');
    if (!choice) throw new Error('delete-lane choice missing');

    const laneFile = join(fixture.root, '.deskwork', 'lanes', 'qa.json');

    const result = await laneConfigMissingTemplate.apply(ctx, {
      kind: 'apply',
      finding: findings[0],
      summary: choice.label,
      payload: choice.payload,
    });

    expect(result.applied).toBe(false);
    // Count of unparseable sidecars must appear verbatim.
    expect(result.message).toContain('3');
    expect(result.message).toMatch(/unparseable|unparsable|cannot confirm/i);
    expect(existsSync(laneFile)).toBe(true);
  });
});
