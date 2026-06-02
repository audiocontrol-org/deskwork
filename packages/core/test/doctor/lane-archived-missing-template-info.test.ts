/**
 * Tests for the `lane-config-missing-template` doctor rule's archived-lane
 * severity contract — AUDIT-20260530-80 (cross-model:
 * AUDIT-BARRAGE-claude-P6-3).
 *
 * The bug the rule had: `audit()` enumerates lanes with
 * `includeArchived: true` (loader.ts line 165, surfaced as the finding
 * surface). When an archived lane carries a dangling `pipelineTemplate`
 * reference, the rule emits `severity: 'error'`. Archiving is the
 * project's soft-delete path (`lane archive`), and deleting the custom
 * pipeline an already-archived lane was bound to is a normal,
 * intentional sequence per the project's "content-management databases
 * preserve, they don't delete" rule. The operator then sees a permanent
 * `error` finding on a lane they retired precisely to stop thinking
 * about — false-error noise that conflates *"this active lane is
 * broken"* with *"this retired lane references a since-removed
 * template."*
 *
 * The fix: keep enumerating archived lanes so the historical record
 * stays in the report, but emit them at `severity: 'info'` (not
 * `'error'`). Active lanes still emit at `'error'` — the active-pipeline
 * defect contract is unchanged. Both still emit (not silently dropped),
 * so the operator can still clean up the orphan reference if they want
 * the archived lane's frozen record to be tidy.
 *
 * Per the project's testing rules: fixtures on disk, no filesystem
 * mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAudit, yesInteraction } from '@/doctor/runner';
import type { DeskworkConfig } from '@/config';

const RULE_ID = 'lane-config-missing-template';

interface Fixture {
  root: string;
  config: DeskworkConfig;
}

function setupFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-lane-archived-mt-'));
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

function readLaneJson(root: string, id: string): unknown {
  return JSON.parse(
    readFileSync(join(root, '.deskwork', 'lanes', `${id}.json`), 'utf8'),
  ) as unknown;
}

describe('doctor: lane-config-missing-template (archived-lane severity)', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it('active lane with dangling template emits severity=error', async () => {
    writeLaneJson(fixture.root, 'active-dangling', {
      id: 'active-dangling',
      name: 'Active Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });

    const report = await runAudit(
      { projectRoot: fixture.root, config: fixture.config },
      yesInteraction,
    );
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].details.laneId).toBe('active-dangling');
    // The original-bug semantics: contract preserved for active lanes.
  });

  it('archived lane with dangling template emits severity=info (NOT error)', async () => {
    // Write a lane that's archived AND has a dangling template — the
    // exact AUDIT-20260530-80 shape: the operator archived the lane and
    // (later or earlier) the custom pipeline it referenced was removed.
    writeLaneJson(fixture.root, 'archived-dangling', {
      id: 'archived-dangling',
      name: 'Archived Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
      archivedAt: '2026-05-30T00:00:00.000Z',
    });

    const report = await runAudit(
      { projectRoot: fixture.root, config: fixture.config },
      yesInteraction,
    );
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    // STILL emits — historical record preserved per the operator-may-
    // want-to-clean-up disposition.
    expect(findings).toHaveLength(1);
    // But NOT at error severity — that was the false-error noise.
    expect(findings[0].severity).toBe('info');
    expect(findings[0].severity).not.toBe('error');
    expect(findings[0].details.laneId).toBe('archived-dangling');
    // The details map carries the archived signal so downstream
    // consumers (renderers, CLI summaries) can distinguish without
    // re-reading the lane JSON.
    expect(findings[0].details.archived).toBe(true);
  });

  it('mixed: one active dangling + one archived dangling produces one error AND one info', async () => {
    writeLaneJson(fixture.root, 'active-dangling', {
      id: 'active-dangling',
      name: 'Active Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
    });
    writeLaneJson(fixture.root, 'archived-dangling', {
      id: 'archived-dangling',
      name: 'Archived Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
      archivedAt: '2026-05-30T00:00:00.000Z',
    });

    const report = await runAudit(
      { projectRoot: fixture.root, config: fixture.config },
      yesInteraction,
    );
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(2);

    const byLane = new Map(findings.map((f) => [f.details.laneId as string, f]));
    expect(byLane.get('active-dangling')?.severity).toBe('error');
    expect(byLane.get('archived-dangling')?.severity).toBe('info');
    expect(byLane.get('archived-dangling')?.details.archived).toBe(true);
  });

  it('archived-lane finding details include the archived signal', async () => {
    // Sanity check the on-disk lane state matches what the rule's
    // archived-detection branch should be reading: the JSON carries an
    // ISO archivedAt and the rule's emitted finding reflects it.
    writeLaneJson(fixture.root, 'archived-dangling', {
      id: 'archived-dangling',
      name: 'Archived Dangling Lane',
      pipelineTemplate: 'nonsense',
      contentDir: 'docs',
      archivedAt: '2026-05-30T00:00:00.000Z',
    });

    const onDisk = readLaneJson(fixture.root, 'archived-dangling') as {
      archivedAt?: string;
    };
    expect(onDisk.archivedAt).toBe('2026-05-30T00:00:00.000Z');

    const report = await runAudit(
      { projectRoot: fixture.root, config: fixture.config },
      yesInteraction,
    );
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.archived).toBe(true);
    // Message wording cues the operator that the lane is retired — the
    // error-vs-info severity is the primary signal but the message
    // should reinforce it (so a log grep for the rule id surfaces the
    // archived context without re-reading details).
    expect(findings[0].message.toLowerCase()).toContain('archived');
  });
});
