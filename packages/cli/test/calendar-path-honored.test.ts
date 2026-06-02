/**
 * Regression for #232: the entry-centric pipeline must write the calendar to
 * the configured per-site `calendarPath`, not a hardcoded `.deskwork/calendar.md`.
 *
 * Before the fix, `approve` (via regenerateCalendar) and `doctor --fix`
 * (via repairAll) both wrote `.deskwork/calendar.md` unconditionally, so an
 * adopter whose config points `calendarPath` elsewhere (here:
 * `docs/custom-calendar.md`) never saw pipeline updates — while `ingest`
 * already honored the configured path, producing a divergence.
 *
 * The fix resolves the path via `resolveCalendarPath(projectRoot, config)`.
 * These tests spawn the built `deskwork` binary against a project whose
 * `calendarPath` is deliberately NOT `.deskwork/calendar.md`, and assert the
 * configured file is the one written + the hardcoded path is NOT created.
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

const CUSTOM_CALENDAR_REL = 'docs/custom-calendar.md';

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-calpath-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, 'docs'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: CUSTOM_CALENDAR_REL },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  // Seed the configured calendar so it exists pre-transition.
  writeFileSync(
    join(project, CUSTOM_CALENDAR_REL),
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

describe('entry-centric calendar honors per-site calendarPath (#232)', () => {
  it('approve regenerates the CONFIGURED calendarPath, not the hardcoded .deskwork/calendar.md', () => {
    const uuid = '550e8400-e29b-41d4-a716-44665544c232';
    writeSidecar(uuid, 'my-idea', 'Ideas');

    const r = spawnSync(deskworkBin, ['approve', project, 'my-idea'], { encoding: 'utf-8' });
    expect(r.stderr, `stderr:\n${r.stderr}`).toBe('');
    expect(r.status).toBe(0);

    const configured = readFileSync(join(project, CUSTOM_CALENDAR_REL), 'utf-8');
    expect(configured).toContain('my-idea');
    // The hardcoded path must NOT be written when calendarPath points elsewhere.
    expect(existsSync(join(project, '.deskwork', 'calendar.md'))).toBe(false);
  });

  it('doctor --fix all regenerates the CONFIGURED calendarPath, not .deskwork/calendar.md', () => {
    const uuid = '550e8400-e29b-41d4-a716-44665544d232';
    writeSidecar(uuid, 'repair-idea', 'Ideas');

    const r = spawnSync(
      deskworkBin,
      ['doctor', project, '--fix', 'all', '--yes'],
      { encoding: 'utf-8' },
    );
    // The #232 assertion is which file repair writes — NOT doctor's overall
    // exit code (unrelated validations on a bare sidecar can still report
    // findings). Confirm the repair pass ran, then assert the target.
    expect(r.stdout, `stderr:\n${r.stderr}`).toContain('calendar-regenerated');

    const configured = readFileSync(join(project, CUSTOM_CALENDAR_REL), 'utf-8');
    expect(configured).toContain('repair-idea');
    expect(existsSync(join(project, '.deskwork', 'calendar.md'))).toBe(false);
  });
});
