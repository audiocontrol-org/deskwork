/**
 * Phase 39c (sites→lanes retirement) — the calendar is a SINGLE
 * project-level file at `.deskwork/calendar.md` (spec §"Calendar").
 *
 * This file previously tested the RETIRED #232 behavior: that the
 * pipeline honored a per-site `calendarPath` (here `docs/custom-calendar.md`)
 * and did NOT write the hardcoded `.deskwork/calendar.md`. Under the
 * retirement, per-site `calendarPath` is gone — `resolveCalendarPath`
 * ignores its `site`/`config` arguments and always returns the single
 * project calendar. These tests now assert the inverse: both `approve`
 * (via regenerateCalendar) and `doctor --fix` write `.deskwork/calendar.md`,
 * regardless of any legacy `calendarPath` in the (tolerated) `sites` block.
 * Closes #234 (divergence), #357 (read-side validator), #223 (regen
 * flip-flop) per spec §"Inherited calendar-surface cluster".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

const PROJECT_CALENDAR_REL = '.deskwork/calendar.md';
// A legacy per-site `calendarPath` that must NOT be written under the
// single-project-calendar model — the inverse of the retired #232 test.
const LEGACY_CALENDAR_REL = 'docs/custom-calendar.md';

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-calpath-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, 'docs'), { recursive: true });
  // The `sites` block (with a non-default `calendarPath`) is retained
  // and tolerated for the CLI-verb resolution family; it no longer
  // steers the calendar location.
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: LEGACY_CALENDAR_REL },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  // Seed the single project calendar so it exists pre-transition.
  writeFileSync(
    join(project, PROJECT_CALENDAR_REL),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function writeSidecar(uuid: string, slug: string, currentStage: string): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage,
      iterationByStage: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

describe('single project calendar at .deskwork/calendar.md (Phase 39c)', () => {
  it('approve regenerates the single .deskwork/calendar.md, not a per-site path', () => {
    const uuid = '550e8400-e29b-41d4-a716-44665544c232';
    writeSidecar(uuid, 'my-idea', 'Ideas');

    const r = spawnSync(deskworkBin, ['approve', project, 'my-idea'], { encoding: 'utf-8' });
    expect(r.stderr, `stderr:\n${r.stderr}`).toBe('');
    expect(r.status).toBe(0);

    const projectCalendar = readFileSync(
      join(project, PROJECT_CALENDAR_REL),
      'utf-8',
    );
    expect(projectCalendar).toContain('my-idea');
    // The legacy per-site path must NOT be written — calendarPath is retired.
    expect(existsSync(join(project, LEGACY_CALENDAR_REL))).toBe(false);
  });

  it('doctor --fix all regenerates the single .deskwork/calendar.md, not a per-site path', () => {
    const uuid = '550e8400-e29b-41d4-a716-44665544d232';
    writeSidecar(uuid, 'repair-idea', 'Ideas');

    const r = spawnSync(
      deskworkBin,
      ['doctor', project, '--fix', 'all', '--yes'],
      { encoding: 'utf-8' },
    );
    // Which file the repair writes is the assertion — NOT doctor's overall
    // exit code (unrelated validations on a bare sidecar can still report
    // findings). Confirm the repair pass ran, then assert the target.
    expect(r.stdout, `stderr:\n${r.stderr}`).toContain('calendar-regenerated');

    const projectCalendar = readFileSync(
      join(project, PROJECT_CALENDAR_REL),
      'utf-8',
    );
    expect(projectCalendar).toContain('repair-idea');
    expect(existsSync(join(project, LEGACY_CALENDAR_REL))).toBe(false);
  });
});
