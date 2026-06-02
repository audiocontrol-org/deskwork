/**
 * Regression test for AUDIT-20260530-79 (cross-model:
 * AUDIT-BARRAGE-claude-P6-3).
 *
 * Surface: `packages/core/src/doctor/rules/lane-config-missing-template.ts`
 * — both repair branches (set-template @ ~:303-320 and delete @ ~:397-414)
 * mutated disk BEFORE appending the lane-config-repair journal event.
 * If the journal append failed AFTER the mutation, the rebind / delete
 * had already landed with no audit record. The delete branch was
 * worst: the lane file was gone with zero durable record of who
 * removed it.
 *
 * Fix shape (mirrors AUDIT-20260530-13 — bootstrap rollback in
 * `packages/core/src/lanes/bootstrap.ts`): snapshot the pre-mutation
 * state, perform the mutation, then wrap `appendJournalEvent` in
 * try/catch. On journal-append failure, restore the snapshot before
 * rethrowing the journal error (set-template) OR re-create the deleted
 * file from the snapshot (delete). The compensating write returns the
 * project to its pre-repair state so the operator can re-run the
 * doctor cleanly.
 *
 * The test forces the journal failure the same way the AUDIT-13 test
 * does: pre-create `.deskwork/review-journal/history` as a FILE (not a
 * directory), so the journal's `mkdir(..., { recursive: true })` step
 * hits ENOTDIR / EEXIST and the append throws.
 *
 * Per the project's testing rules: fixtures live on disk in tmp
 * directories — no filesystem mocking.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import laneConfigMissingTemplate from '@/doctor/rules/lane-config-missing-template';
import { buildContentIndex } from '@/content-index';
import { readCalendar } from '@/calendar';
import { resolveCalendarPath } from '@/paths';
import { yesInteraction } from '@/doctor/runner';
import type { DeskworkConfig } from '@/config';
import type { DoctorContext } from '@/doctor/types';

interface Fixture {
  root: string;
  config: DeskworkConfig;
}

function setupFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-lane-repair-rb-'));
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

/**
 * Pre-create `.deskwork/review-journal/history` as a FILE (not a
 * directory). The journal's append code mkdirs that path; passing a
 * non-directory file causes the recursive mkdir to throw ENOTDIR.
 * Mirrors the AUDIT-20260530-13 regression test's failure-induction
 * pattern.
 */
function blockJournalAppend(root: string): void {
  const journalParent = join(root, '.deskwork', 'review-journal');
  mkdirSync(journalParent, { recursive: true });
  writeFileSync(join(journalParent, 'history'), 'not-a-dir', 'utf8');
}

describe('doctor: lane-config-missing-template repair rolls back on journal-append failure (AUDIT-20260530-79)', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('set-template: rolls back the lane file to its pre-mutation state when journal append fails', async () => {
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    const laneFile = join(fixture.root, '.deskwork', 'lanes', 'dangling.json');
    const originalBody = readFileSync(laneFile, 'utf8');

    blockJournalAppend(fixture.root);

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
    const choice = plan.choices.find((c) => c.id === 'set-template-editorial');
    if (!choice) throw new Error('set-template-editorial choice missing');

    let caught: unknown;
    let result: Awaited<ReturnType<typeof laneConfigMissingTemplate.apply>> | undefined;
    try {
      result = await laneConfigMissingTemplate.apply(ctx, {
        kind: 'apply',
        finding: findings[0],
        summary: choice.label,
        payload: choice.payload,
      });
    } catch (err) {
      caught = err;
    }
    // The rule may either throw the journal error OR catch it and
    // surface as `applied: false`. Both are valid post-fix shapes —
    // what matters is that the lane file is unchanged.
    if (caught === undefined) {
      expect(result).toBeDefined();
      if (result) expect(result.applied).toBe(false);
    } else {
      expect(caught).toBeInstanceOf(Error);
    }

    // The lane file MUST be unchanged from its pre-repair state. Pre-
    // fix the file's pipelineTemplate was already "editorial" on disk
    // (the atomicWrite landed before the journal append failed), so
    // this assertion failed pre-fix.
    expect(existsSync(laneFile)).toBe(true);
    const afterBody = readFileSync(laneFile, 'utf8');
    expect(afterBody).toBe(originalBody);
  });

  it('delete: rolls back (re-creates) the lane file when journal append fails', async () => {
    writeLaneJson(fixture.root, 'dangling', {
      id: 'dangling',
      name: 'Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    const laneFile = join(fixture.root, '.deskwork', 'lanes', 'dangling.json');
    const originalBody = readFileSync(laneFile, 'utf8');

    blockJournalAppend(fixture.root);

    const ctx = buildCtx(fixture);
    const findings = await laneConfigMissingTemplate.audit(ctx);
    expect(findings).toHaveLength(1);

    const plan = await laneConfigMissingTemplate.plan(ctx, findings[0]);
    if (plan.kind !== 'prompt') throw new Error('plan must be prompt');
    const choice = plan.choices.find((c) => c.id === 'delete-lane');
    if (!choice) throw new Error('delete-lane choice missing');

    let caught: unknown;
    let result: Awaited<ReturnType<typeof laneConfigMissingTemplate.apply>> | undefined;
    try {
      result = await laneConfigMissingTemplate.apply(ctx, {
        kind: 'apply',
        finding: findings[0],
        summary: choice.label,
        payload: choice.payload,
      });
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      expect(result).toBeDefined();
      if (result) expect(result.applied).toBe(false);
    } else {
      expect(caught).toBeInstanceOf(Error);
    }

    // The lane file MUST still exist after the failed delete repair.
    // Pre-fix this assertion failed — the unlink had already landed
    // before the journal append failed, leaving no audit record of the
    // delete and no way to recover the lane definition.
    expect(existsSync(laneFile)).toBe(true);
    const afterBody = readFileSync(laneFile, 'utf8');
    expect(afterBody).toBe(originalBody);
  });
});
